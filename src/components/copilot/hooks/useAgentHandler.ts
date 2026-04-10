// Agent 模式消息处理 Hook

import { agentExecutor } from "../../../lib/agent/executor";
import {
	encodeChatMessageToAgentContentJson,
	persistChatMessageToAgentSession,
} from "../../../lib/agent/chatBridge";
import {
	agentPersistence,
	resumePersistentSession,
	startPersistentSession,
} from "../../../lib/agent/persistence";
import { agentStore } from "../../../lib/agent/store";
import { chatStore as chatStoreInstance } from "../../../lib/chat/store";
import {
	filterThoughtBlocksForPersistence,
	StreamBlocksBuilder,
} from "../../../lib/chat/streamBlocksBuilder";
import type { ChatMessageBlock } from "../../../lib/chat/types";
import { createMessage } from "../../../lib/chat/types";
import { EVENTS, events } from "../../../lib/events";
import { getChatSystemPromptWithBudget } from "../../../lib/prompts";
import { workspaceStore } from "../../../lib/workspaceStore";
import { buildConversationMessagesForAgentRun } from "../../../lib/agent/context/conversationMessages";
import { isSdkSessionId } from "../../../lib/agent/context/sessionId";
import { getSourceDetail } from "../../../lib/api";
import {
	parseDocProtocolFinal,
	buildAgentConversationContext,
	guessFallbackSearchQuery,
} from "../../../lib/chat/docProtocol";
import {
	normalizeRuntimeText,
	getTaskImageArtifactPaths,
	replaceDataImageMarkdownWithPaths,
} from "../../../lib/chat/streamHelpers";
import { AGENT_STREAM_UPDATE_INTERVAL_MS } from "../constants";
import type { ChatStoreLike } from "../types";
import type { SlashCommand } from "../../chat/SlashCommand";
import { planModeStore } from "../../../lib/agent/planModeStore";
import { setPlan } from "../../../lib/agent/planModeStore";
import { parsePlanFromAgentOutput } from "../../../lib/agent/planModePrompt";

interface UseAgentHandlerOptions {
	chatStore: ChatStoreLike;
	activeModel: string | null;
	chatSettings: {
		persistEnabled: boolean;
		inlineTraceEnabled: boolean;
	};
	debugLog: (...args: unknown[]) => void;
	debugWarn: (...args: unknown[]) => void;
	onFirstUserMessage?: (
		sessionId: string,
		firstMessage: string,
		fallbackModel?: string,
	) => void;
	queueCreateProposal: (payload: {
		title: string;
		summary: string;
		content: string;
		prompt: string;
	}) => void;
	setAbortController: (controller: AbortController | null) => void;
}

export function useAgentHandler({
	chatStore,
	activeModel,
	chatSettings,
	debugLog,
	debugWarn,
	onFirstUserMessage,
	queueCreateProposal,
	setAbortController,
}: UseAgentHandlerOptions) {
	const handleAgentModeMessage = async (
		content: string,
		session: NonNullable<ChatStoreLike["activeSession"]>,
		userTextForChat: string,
		command: SlashCommand | undefined,
		forcedSkillId: string | undefined,
		skipUserMessage: boolean | undefined,
		forceForkSession: boolean,
		parentSdkSessionIdForRun: string | undefined,
	) => {
		// 绑定/创建后端 Agent Session（用于持久化与回放）
		let boundAgentSessionId: string | undefined = session.agentSessionId;
		try {
			if (boundAgentSessionId) {
				agentPersistence.setCurrentSessionId(boundAgentSessionId);
				await resumePersistentSession(boundAgentSessionId);
			} else {
				const agentSessionId = await startPersistentSession(session.title);
				chatStore.setSessionAgentSessionId(session.id, agentSessionId);
				boundAgentSessionId = agentSessionId;
			}
		} catch (e) {
			// 后端不可用时自动降级（仍可跑前端内存态 Agent）
			console.warn(
				"[CopilotSidebar] Agent Session 持久化初始化失败，将降级为本地执行",
				e,
			);
		}

		// 创建或获取用户消息
		let userMessage: NonNullable<
			ChatStoreLike["activeSession"]
		>["messages"][number];
		const shouldGenerateTitle = !skipUserMessage && session.messages.length === 0;
		if (!skipUserMessage) {
			// 正常情况：创建新的用户消息
			userMessage = createMessage("user", userTextForChat);
			chatStore.addMessage(session.id, userMessage);
			if (shouldGenerateTitle) {
				onFirstUserMessage?.(
					session.id,
					content,
					session.model || activeModel || undefined,
				);
			}
			if (
				chatSettings.persistEnabled &&
				boundAgentSessionId &&
				!boundAgentSessionId.startsWith("local-")
			) {
				void persistChatMessageToAgentSession(
					boundAgentSessionId,
					userMessage,
				).then((record) => {
					if (record?.id) {
						chatStore.updateMessage(session.id, userMessage.id, {
							metadata: { agentMessageId: record.id },
						});
					}
				});
			}
		} else {
			// 重新生成：使用现有的最后一条用户消息
			const existingUserMsg = session.messages
				.filter((m) => m.role === "user")
				.pop();
			if (!existingUserMsg) {
				console.error("[CopilotSidebar] 重新生成时找不到用户消息");
				return;
			}
			userMessage = existingUserMsg;
		}
		chatStore.setStatus("streaming");

		let detachAgentEvent: (() => void) | null = null;
		let currentTaskId: string | null = null;
		let streamingMsgId: string | null = null;
		const insertedToolCallIds = new Set<string>();
		let docProtocolMode: "none" | "create" | "update" = "none";
		let forcedFinalized = false;
		let lastActivityAt = Date.now();
		let watchdogTimer: number | null = null;

		const touchActivity = () => {
			lastActivityAt = Date.now();
		};

		let lastSkillExecutionBlock: ChatMessageBlock | null = null;
		const streamBuilder = new StreamBlocksBuilder({
			thoughtMaxChars: 64 * 1024,
		});

		const getStreamText = () => streamBuilder.getText();

		const buildSkillBlocks = () => {
			const blocks: ChatMessageBlock[] = streamBuilder.getBlocks();

			// 如果任务步骤（TodoWrite）已生成，用专门的 task_list 卡片承接
			if (currentTaskId) {
				const task = agentStore.getState().currentTask;
				const todos = task?.metadata ? (task.metadata as any).todos : undefined;
				const hasTodos = Array.isArray(todos) && todos.length > 0;
				if (hasTodos) {
					blocks.unshift({ type: "task_list", taskId: currentTaskId } as any);
				}
			}

			const currentSkill = agentStore.getState().currentSkill;
			if (currentSkill) {
				const skillBlock = {
					type: "skill_execution",
					skillName: currentSkill.skillName,
					skillPath: currentSkill.skillPath,
					status: currentSkill.status,
					steps: currentSkill.steps,
					loadedFiles: currentSkill.loadedFiles,
					detectedScene: currentSkill.detectedScene,
				} as any;
				lastSkillExecutionBlock = skillBlock;
				blocks.push(skillBlock);
			}

			return blocks;
		};

		const buildFinalBlocks = (
			finalText: string,
			protocol: ReturnType<typeof parseDocProtocolFinal>,
		): ChatMessageBlock[] => {
			const taskImagePaths = getTaskImageArtifactPaths(
				agentStore.getState().currentTask?.artifacts,
			);
			const blocks: ChatMessageBlock[] = streamBuilder.getBlocks().map((b) => {
				if (b.type !== "text") return b;
				return {
					type: "text",
					text: replaceDataImageMarkdownWithPaths(
						normalizeRuntimeText(b.text),
						taskImagePaths,
					),
				} as const;
			});

			// Keep Todo list card after completion
			if (currentTaskId) {
				const task = agentStore.getState().currentTask;
				const todos = task?.metadata ? (task.metadata as any).todos : undefined;
				const hasTodos = Array.isArray(todos) && todos.length > 0;
				if (hasTodos) {
					blocks.unshift({ type: "task_list", taskId: currentTaskId } as any);
				}
			}

			if (protocol.kind === "create" || protocol.kind === "update") {
				blocks.push({
					type: "file_update",
					update: protocol.fileUpdate,
				} as any);
			}

			// Prefer last seen skill block to avoid it disappearing after completion
			const currentSkill = agentStore.getState().currentSkill;
			if (currentSkill) {
				lastSkillExecutionBlock = {
					type: "skill_execution",
					skillName: currentSkill.skillName,
					skillPath: currentSkill.skillPath,
					status: currentSkill.status,
					steps: currentSkill.steps,
					loadedFiles: currentSkill.loadedFiles,
					detectedScene: currentSkill.detectedScene,
				} as any;
			}
			if (lastSkillExecutionBlock) blocks.push(lastSkillExecutionBlock);

			const normalizedFinal = replaceDataImageMarkdownWithPaths(
				normalizeRuntimeText(finalText),
				taskImagePaths,
			);
			const existingText = blocks
				.filter(
					(b): b is Extract<ChatMessageBlock, { type: "text" }> =>
						b.type === "text",
				)
				.map((b) => b.text || "")
				.join("");
			if (
				normalizedFinal.trim() &&
				normalizedFinal.trim() !== existingText.trim()
			) {
				blocks.push({ type: "text", text: normalizedFinal } as any);
			}

			// 将任务里的图片产物回填到消息 blocks，确保图片消息与中间栏产物保持一致
			const hasImageMarkdownInText =
				/!\[[^\]]*]\((?!data:)[^)]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|tif|tiff)(\?[^)]*)?\)/i.test(
					normalizedFinal,
				);
			if (currentTaskId && !hasImageMarkdownInText) {
				const task = agentStore.getState().currentTask;
				const existingImagePaths = new Set(
					blocks
						.filter(
							(b): b is Extract<ChatMessageBlock, { type: "image" }> =>
								b.type === "image",
						)
						.map((b) => String(b.path || "").trim()),
				);
				const imageBlocks =
					task?.artifacts
						?.filter(
							(a) =>
								a.type === "image" &&
								typeof a.url === "string" &&
								a.url.trim().length > 0 &&
								!a.url.trim().startsWith("data:image/") &&
								!a.url.trim().startsWith("http://") &&
								!a.url.trim().startsWith("https://"),
						)
						.map((a) => ({
							type: "image" as const,
							path: String(a.url),
							title: a.title || "图片",
						}))
						.filter((b) => {
							const p = String(b.path || "").trim();
							if (!p) return false;
							if (existingImagePaths.has(p)) return false;
							existingImagePaths.add(p);
							return true;
						}) || [];

				blocks.push(...imageBlocks);
			}

			return blocks;
		};

		let lastUpdateTime = 0;
		let pendingUpdate = false;

		const ensureStreamingMessage = () => {
			if (streamingMsgId) return;
			const streamingMsg = createMessage("assistant", "", {
				isStreaming: true,
				model: activeModel ?? undefined,
				metadata: {
					blocks: buildSkillBlocks(),
				},
			});
			streamingMsgId = streamingMsg.id;
			chatStore.addMessage(session.id, streamingMsg);
			lastUpdateTime = Date.now();
		};

		const updateStreamingMessage = () => {
			if (streamingMsgId) {
				chatStore.updateMessage(session.id, streamingMsgId, {
					content: getStreamText(),
					metadata: {
						blocks: buildSkillBlocks(),
					},
				});
			}
			pendingUpdate = false;
		};

		const scheduleStreamingUpdate = () => {
			const now = Date.now();
			if (now - lastUpdateTime >= AGENT_STREAM_UPDATE_INTERVAL_MS) {
				updateStreamingMessage();
				lastUpdateTime = now;
				return;
			}
			if (!pendingUpdate) {
				pendingUpdate = true;
				setTimeout(
					() => {
						if (pendingUpdate) {
							updateStreamingMessage();
							lastUpdateTime = Date.now();
						}
					},
					AGENT_STREAM_UPDATE_INTERVAL_MS - (now - lastUpdateTime),
				);
			}
		};

		const persistSessionMessageById = (messageId: string) => {
			if (
				!chatSettings.persistEnabled ||
				!boundAgentSessionId ||
				boundAgentSessionId.startsWith("local-")
			) {
				return;
			}

			const latestState = chatStoreInstance.getState();
			const latestSession = latestState.sessions.find(
				(s) => s.id === session.id,
			);
			const latestMessage = latestSession?.messages.find(
				(m) => m.id === messageId,
			);
			if (!latestMessage) return;

			void persistChatMessageToAgentSession(
				boundAgentSessionId,
				latestMessage,
			).then((record) => {
				if (record?.id) {
					chatStore.updateMessage(session.id, messageId, {
						metadata: { agentMessageId: record.id },
					});
				}
			});
		};

		ensureStreamingMessage();

		try {
			const clearWatchdog = () => {
				if (watchdogTimer !== null) {
					clearInterval(watchdogTimer);
					watchdogTimer = null;
				}
			};

			const finalizeFromRawText = (rawText: string, source: string) => {
				if (forcedFinalized) return;
				forcedFinalized = true;
				streamBuilder.flushParser();
				const finalRawText = rawText || getStreamText();
				const forcedFinalState = agentStore.getState();
				const forcedTokenUsage = (forcedFinalState.currentTask?.metadata as any)
					?.tokenUsage as
					| {
							promptTokens: number;
							completionTokens: number;
							totalTokens: number;
					  }
					| undefined;

				const protocol = parseDocProtocolFinal(finalRawText, {
					activeDocContent: workspaceStore.getActiveDocContent() || "",
					hasActiveDoc: Boolean(workspaceStore.getState().activeDocId),
					prompt: command?.name || content.slice(0, 50),
				});
				const result = replaceDataImageMarkdownWithPaths(
					normalizeRuntimeText(protocol.displayContent),
					getTaskImageArtifactPaths(
						agentStore.getState().currentTask?.artifacts,
					),
				);

				if (streamingMsgId) {
					chatStore.updateMessage(session.id, streamingMsgId, {
						content: result,
						isStreaming: false,
						metadata: {
							blocks: filterThoughtBlocksForPersistence(
								buildFinalBlocks(result, protocol),
								true,
							),
							...(protocol.kind === "create" || protocol.kind === "update"
								? { fileUpdates: [protocol.fileUpdate] }
								: null),
							...(forcedTokenUsage ? { tokenUsage: forcedTokenUsage } : null),
							taskId: forcedFinalState.currentTask?.id,
							sandboxDir: (forcedFinalState.currentTask?.metadata as any)
								?.sandboxDir,
						},
					});
					persistSessionMessageById(streamingMsgId);
				}

				if (protocol.kind === "update") {
					events.emit(EVENTS.AI_DOC_UPDATE_END, protocol.eventPayload);
				} else if (protocol.kind === "create") {
					queueCreateProposal(protocol.eventPayload);
				}

				chatStore.setStatus("idle");
				try {
					agentExecutor.cancel();
				} catch {}

				if (detachAgentEvent) {
					detachAgentEvent();
					detachAgentEvent = null;
				}
				debugWarn("[CopilotSidebar] Forced finalize agent message", {
					source,
				});
			};

			watchdogTimer = window.setInterval(() => {
				if (forcedFinalized) return;
				if (!streamingMsgId) return;
				const now = Date.now();
				if (now - lastActivityAt < 20000) return;

				const live = agentStore.getState();
				const liveTaskStatus = live.currentTask?.status;
				if (
					live.isExecuting ||
					live.isWaitingForLLM ||
					liveTaskStatus === "planning" ||
					liveTaskStatus === "executing" ||
					(live.currentSkill &&
						live.currentSkill.status !== "completed" &&
						live.currentSkill.status !== "error")
				) {
					return;
				}
				const hasRunningTools = streamBuilder
					.getBlocks()
					.some(
						(b) =>
							b.type === "tool_call" &&
							(b.status === "running" || b.status === "pending"),
					);
				if (hasRunningTools) return;
				const raw = getStreamText();
				if (!raw.trim()) return;
				finalizeFromRawText(raw, "watchdog_inactivity");
			}, 1000);

			const activeDocContent = workspaceStore.getActiveDocContent() || "";
			const hasActiveDoc = Boolean(workspaceStore.getState().activeDocId);
			const chatPromptWithBudget = await getChatSystemPromptWithBudget({
				documentContent: activeDocContent,
				hasActiveDoc,
			});
			const systemPrompt = chatPromptWithBudget.prompt;
			const conversationMessagesForAgent = buildConversationMessagesForAgentRun(
				{
					sessionMessages: session.messages,
					currentUserMessage: userMessage,
					skipUserMessage,
				},
			);
			const conversationContext = buildAgentConversationContext(
				conversationMessagesForAgent,
				content,
			);
			const fallbackSearchQuery = guessFallbackSearchQuery(
				conversationMessagesForAgent,
			);
			// 获取用户附加的上下文（文档、资料等）
			const contexts = workspaceStore.getState().contexts;
			const attachedContexts: Array<{ title: string; content: string }> = [];
			const attachedFiles: Array<{
				title: string;
				path: string;
				type: "file" | "document";
				mimeType?: string;
				size?: number;
				isBinary?: boolean;
			}> = [];

			const resolvedContexts = await Promise.all(
				contexts.map(async (ctx) => {
					let content = ctx.content;
					if (!content && ctx.sourceId) {
						try {
							const detail = await getSourceDetail(ctx.sourceId);
							content = detail.note?.content || detail.source.description || "";
							debugLog(
								"[CopilotSidebar] 加载资料内容:",
								ctx.title,
								content.slice(0, 100),
							);
						} catch (err) {
							console.error("[CopilotSidebar] 加载资料内容失败:", err);
						}
					}
					return { ...ctx, content };
				}),
			);
			for (const ctx of resolvedContexts) {
				const content = ctx.content || "";
				const filePath = ctx.filePath;
				const fileSize = ctx.size;
				if (filePath) {
					const isText =
						(typeof ctx.mimeType === "string" &&
							ctx.mimeType.startsWith("text/")) ||
						content.trim().length > 0;
					attachedFiles.push({
						title: ctx.title,
						path: filePath,
						type: ctx.type === "source" ? "document" : "file",
						mimeType: ctx.mimeType,
						size: fileSize,
						isBinary: !isText,
					});
				}

				if (!filePath && content.trim()) {
					attachedContexts.push({ title: ctx.title, content });
				}
			}

			debugLog("[CopilotSidebar] 附件聚合统计:", {
				contextCount: contexts.length,
				attachedFiles: attachedFiles.map((f) => ({
					title: f.title,
					type: f.type,
					path: f.path,
					size: f.size,
				})),
				attachedContextsCount: attachedContexts.length,
			});

			// 将附件信息更新到用户消息的 metadata 中（以便在 UI 中显示）
			if (attachedFiles.length > 0 || attachedContexts.length > 0) {
				const attachedFilesForUI = [
					...attachedFiles.map((f) => ({
						title: f.title,
						path: f.path,
						type: f.type,
						size: f.size,
					})),
					// 从 attachedContexts 中提取（这些是小型上下文）
					...attachedContexts
						.filter((c) => !attachedFiles.find((f) => f.title === c.title))
						.map((c) => ({
							title: c.title,
							path: "",
							type: "document" as const,
						})),
				];

				if (attachedFilesForUI.length > 0) {
					chatStore.updateMessage(session.id, userMessage.id, {
						metadata: {
							...userMessage.metadata,
							attachedFiles: attachedFilesForUI,
							contextCharsAfter:
								chatPromptWithBudget.budget.stats.injectedChars,
						},
					});
				}
			}

			detachAgentEvent = agentStore.onEvent((event) => {
				touchActivity();
				if (event.type === "task_started") {
					currentTaskId = event.task.id;
					// 让托管模式在运行中也能"跟着会话走"：一旦拿到 taskId / sandboxDir，立刻写入流式消息 metadata
					ensureStreamingMessage();
					if (streamingMsgId) {
						const sandboxDir = (event.task?.metadata as any)?.sandboxDir as
							| string
							| undefined;
						chatStore.updateMessage(session.id, streamingMsgId, {
							metadata: {
								blocks: buildSkillBlocks(),
								taskId: currentTaskId,
								sandboxDir,
							},
						});
					}
					return;
				}

				if (!chatSettings.inlineTraceEnabled) return;

				if (event.type === "tool_started") {
					const toolCallId = event.toolCall?.id;
					if (!toolCallId || insertedToolCallIds.has(toolCallId)) return;
					insertedToolCallIds.add(toolCallId);

					const toolCallBlock: Extract<
						ChatMessageBlock,
						{ type: "tool_call" }
					> = {
						type: "tool_call",
						taskId: event.taskId,
						toolCallId,
						toolType: event.toolCall?.type,
						name: event.toolCall?.name,
						status: event.toolCall?.status,
						input: event.toolCall?.input,
					};

					streamBuilder.startToolCall(toolCallBlock);

					updateStreamingMessage();
					return;
				}

				if (event.type === "tool_completed" || event.type === "tool_error") {
					if (event.type === "tool_completed") {
						streamBuilder.updateToolCall(event.toolCallId, (b) => ({
							...b,
							status: "completed",
							output: event.result.data,
						}));
					} else {
						streamBuilder.updateToolCall(event.toolCallId, (b) => ({
							...b,
							status: "error",
							error: event.error,
						}));
					}
					updateStreamingMessage();
				}
			});

			const onChunk = (chunk: string) => {
				touchActivity();
				streamBuilder.appendTextChunk(chunk);
				const snapshot = getStreamText();
				if (docProtocolMode === "none") {
					if (snapshot.includes(":::update-doc")) {
						docProtocolMode = "update";
						events.emit(EVENTS.AI_DOC_UPDATE_START, {});
					} else if (snapshot.includes(":::create-doc")) {
						docProtocolMode = "create";
						events.emit(EVENTS.AI_DOC_CREATE_START, {});
					}
				}
				if (docProtocolMode === "update") {
					const startIdx = snapshot.indexOf(":::update-doc");
					if (startIdx >= 0) {
						const after = snapshot.slice(startIdx + ":::update-doc".length);
						const endRel = after.indexOf(":::");
						const partial = (
							endRel >= 0 ? after.slice(0, endRel) : after
						).trim();
						events.emit(EVENTS.AI_DOC_UPDATE_STREAM, partial);
					}
				}
				scheduleStreamingUpdate();
			};

			const agentRun = await agentExecutor.executeCustomTask(
				content,
				systemPrompt,
				undefined,
				{
					conversationContext,
					fallbackSearchQuery,
					hasActiveDoc: Boolean(workspaceStore.getState().activeDocId),
					activeDocContent: workspaceStore.getActiveDocContent() || "",
					attachedContexts,
					attachedFiles, // 传递文件路径
					conversationSessionId: session.id,
					sandboxKey: boundAgentSessionId || session.id,
					resumeSessionId: (() => {
						if (!session.sdkSessionId) return undefined;
						if (isSdkSessionId(session.sdkSessionId))
							return session.sdkSessionId;
						chatStore.setSessionSdkSessionId(session.id, undefined);
						return undefined;
					})(),
					persistSession: true,
					forkSession: forceForkSession,
					parentSdkSessionId: parentSdkSessionIdForRun,
					documentContextInjected: true,
					forcedSkillName: forcedSkillId, // 传递强制 skill 名称
					planMode: planModeStore.getState().enabled,
					confirmedPlan:
						planModeStore.getState().currentPlan?.status === "confirmed"
							? planModeStore.getState().currentPlan ?? undefined
							: undefined,
					onChunk, // 流式输出回调
					onThoughtChunk: (chunk, meta) => {
						touchActivity();
						streamBuilder.appendThoughtChunk(chunk, meta);
						scheduleStreamingUpdate();
					},
				},
			);
			workspaceStore.clearContexts();

			if (agentRun?.sdkSessionId) {
				chatStore.setSessionSdkSessionId(session.id, agentRun.sdkSessionId);
			}

			clearWatchdog();
			if (forcedFinalized) return;
			streamBuilder.flushParser();

			// 如果有流式消息，更新最终内容并标记为完成
			if (streamingMsgId) {
				// 确保最终内容完整显示
				chatStore.updateMessage(session.id, streamingMsgId, {
					content: getStreamText(),
					isStreaming: false,
					metadata: {
						blocks: buildSkillBlocks(),
					},
				});
			}

			// Plan Mode：如果启用了规划模式，尝试从 Agent 输出中解析计划
			if (planModeStore.getState().enabled) {
				const finalText = getStreamText();
				const plan = parsePlanFromAgentOutput(finalText);
				if (plan) {
					setPlan(plan);
				}
			}

			const finalState = agentStore.getState();
			const tokenUsage = (finalState.currentTask?.metadata as any)
				?.tokenUsage as
				| {
						promptTokens: number;
						completionTokens: number;
						totalTokens: number;
				  }
				| undefined;

			// 检查任务是否失败（LLM API 错误等会导致 failTask 被调用）
			if (finalState.currentTask?.status === "error") {
				const taskError = finalState.currentTask.error || "任务执行失败";
				throw new Error(taskError);
			}

			// 检查是否有图片生成
			const toolCalls = finalState.currentTask?.toolCalls || [];
			const hasImages = toolCalls.some((tc) => {
				const output = tc.output as any;
				const paths = Array.isArray(output?.image_paths)
					? (output.image_paths as string[])
					: [];
				return paths.some((p) => typeof p === "string" && p.trim().length > 0);
			});

			// 如果有图片生成但没有文本，使用空白或简短提示；否则使用默认失败消息
			const rawText = getStreamText();
			const rawResult = (() => {
				if (rawText) return rawText;
				if (hasImages) return "";
				// 检查 agentStore 中是否有更详细的错误信息
				const taskMeta = finalState.currentTask?.metadata as any;
				const taskError = finalState.currentTask?.error;
				if (taskError) return `⚠️ ${taskError}`;
				if (taskMeta?.lastStderrError) return `⚠️ ${taskMeta.lastStderrError}`;
				return "⚠️ 任务已完成，但未能生成文本结果。可能是模型响应格式不兼容，请尝试切换模型或重新发送。";
			})();

			const protocol = parseDocProtocolFinal(rawResult, {
				activeDocContent: workspaceStore.getActiveDocContent() || "",
				hasActiveDoc: Boolean(workspaceStore.getState().activeDocId),
				prompt: command?.name || content.slice(0, 50),
			});
			const result = replaceDataImageMarkdownWithPaths(
				normalizeRuntimeText(protocol.displayContent),
				getTaskImageArtifactPaths(agentStore.getState().currentTask?.artifacts),
			);

			// Agent 模式下我们总是走"流式消息"，但这会导致 create-doc / update-doc 协议没有被执行。
			// 这里统一在完成后应用协议、更新消息、并触发 EditorCanvas 的创建/审查流程。
			if (streamingMsgId) {
				const finalBlocks = buildFinalBlocks(result, protocol);
				chatStore.updateMessage(session.id, streamingMsgId, {
					content: result,
					isStreaming: false,
					metadata: {
						blocks: filterThoughtBlocksForPersistence(finalBlocks, true),
						...(protocol.kind === "create" || protocol.kind === "update"
							? { fileUpdates: [protocol.fileUpdate] }
							: null),
						...(tokenUsage ? { tokenUsage } : null),
						...(parentSdkSessionIdForRun
							? { parentSdkSessionId: parentSdkSessionIdForRun }
							: null),
						// 保存 taskId 和 sandboxDir 到消息，用于历史记录恢复
						taskId: finalState.currentTask?.id,
						sandboxDir: (finalState.currentTask?.metadata as any)?.sandboxDir,
						contextCharsBefore: (finalState.currentTask?.metadata as any)
							?.contextCharsBefore,
						contextCharsAfter: (finalState.currentTask?.metadata as any)
							?.contextCharsAfter,
						attachedFilesBefore: (finalState.currentTask?.metadata as any)
							?.attachedFilesBefore,
						attachedFilesAfter: (finalState.currentTask?.metadata as any)
							?.attachedFilesAfter,
						dedupeHitCount: (finalState.currentTask?.metadata as any)
							?.dedupeHitCount,
						degradeLevel: (finalState.currentTask?.metadata as any)
							?.degradeLevel,
					},
				});
				persistSessionMessageById(streamingMsgId);

				if (protocol.kind === "update") {
					events.emit(EVENTS.AI_DOC_UPDATE_END, protocol.eventPayload);
				} else if (protocol.kind === "create") {
					queueCreateProposal(protocol.eventPayload);
				}
			}

			// 任务完成后尝试把最终摘要写回后端 task
			try {
				const currentTask = finalState.currentTask;
				const backendTaskId = (currentTask?.metadata as any)?.backendTaskId as
					| string
					| undefined;
				if (backendTaskId && boundAgentSessionId) {
					await (await import("../../../lib/agent/api")).updateAgentTask(
						backendTaskId,
						{
							status: "succeeded",
							result_summary: result,
						},
					);
				}
			} catch (e) {
				console.warn("[CopilotSidebar] 更新后端 Agent task 结果失败", e);
			}

			// 如果是 Skill 执行（已通过 onChunk 创建了流式消息），跳过创建新消息
			if (!streamingMsgId) {
				const assistantMessage = createMessage("assistant", result, {
					isStreaming: false,
					model: activeModel ?? undefined,
					metadata:
						protocol.kind === "create" || protocol.kind === "update"
							? { fileUpdates: [protocol.fileUpdate] }
							: undefined,
				});

				const finalSkillState = agentStore.getState().currentSkill;
				const skillBlocks = finalSkillState
					? [
							{
								type: "skill_execution" as const,
								skillName: finalSkillState.skillName,
								skillPath: finalSkillState.skillPath,
								status: finalSkillState.status,
								steps: finalSkillState.steps,
								loadedFiles: finalSkillState.loadedFiles,
								detectedScene: finalSkillState.detectedScene,
							},
						]
					: [];

				const baseBlocks: any[] = [
					...(assistantMessage.content.trim()
						? [{ type: "text" as const, text: assistantMessage.content }]
						: []),
					...skillBlocks,
				];

				// 成功时也把工具调用轨迹挂到消息 blocks，方便用户端直接看到 code_execute 等执行情况
				if (currentTaskId) {
					const toolCalls = finalState.currentTask?.toolCalls || [];
					const toolCallBlocks = toolCalls.map((tc) => ({
						type: "tool_call" as const,
						taskId: currentTaskId,
						toolCallId: tc.id,
						name: tc.name,
						status: tc.status,
					}));

					const imageBlocks = toolCalls
						.flatMap((tc) => {
							const output = tc.output as any;
							const paths = Array.isArray(output?.image_paths)
								? (output.image_paths as string[])
								: [];
							return paths
								.filter(
									(p) =>
										typeof p === "string" &&
										p.trim().length > 0 &&
										!p.trim().startsWith("data:image/") &&
										!p.trim().startsWith("http://") &&
										!p.trim().startsWith("https://"),
								)
								.map((p) => ({
									type: "image" as const,
									path: p,
									title: tc.name || "图片",
								}));
						})
						.filter((b) => !!b.path);

					// 去重，避免多次收集同一张图
					const uniqueImageBlocks: typeof imageBlocks = [];
					const seenImg = new Set<string>();
					for (const b of imageBlocks) {
						if (seenImg.has(b.path)) continue;
						seenImg.add(b.path);
						uniqueImageBlocks.push(b);
					}
					const fileUpdateBlocks = Array.isArray(
						(assistantMessage.metadata as any)?.fileUpdates,
					)
						? (assistantMessage.metadata as any).fileUpdates.map(
								(update: any) => ({ type: "file_update" as const, update }),
							)
						: [];
					assistantMessage.metadata = {
						...(assistantMessage.metadata || {}),
						...(chatSettings.inlineTraceEnabled
							? {}
							: { trace: { type: "agent_task", taskId: currentTaskId } }),
						blocks: [
							...baseBlocks,
							...uniqueImageBlocks,
							...(chatSettings.inlineTraceEnabled ? [] : toolCallBlocks),
							...fileUpdateBlocks,
						],
					};
				} else if (baseBlocks.length > 0) {
					assistantMessage.metadata = {
						...(assistantMessage.metadata || {}),
						blocks: baseBlocks,
					};
				}
				chatStore.addMessage(session.id, assistantMessage);
				if (protocol.kind === "update") {
					events.emit(EVENTS.AI_DOC_UPDATE_END, protocol.eventPayload);
				} else if (protocol.kind === "create") {
					queueCreateProposal(protocol.eventPayload);
				}
				if (
					chatSettings.persistEnabled &&
					boundAgentSessionId &&
					!boundAgentSessionId.startsWith("local-")
				) {
					void persistChatMessageToAgentSession(
						boundAgentSessionId,
						assistantMessage,
					).then((record) => {
						if (record?.id) {
							chatStore.updateMessage(session.id, assistantMessage.id, {
								metadata: { agentMessageId: record.id },
							});
						}
					});
				}
			}
			chatStore.setStatus("idle");
			// 附件已在消息发送后立即清除（第835行）
		} catch (error) {
			if (watchdogTimer !== null) {
				clearInterval(watchdogTimer);
				watchdogTimer = null;
			}
			if (forcedFinalized) return;
			const errorMessage = error instanceof Error ? error.message : "未知错误";
			const taskId = currentTaskId || null;
			const errorState = agentStore.getState();
			// 构造用户友好的错误消息
			const friendlyError = (() => {
				if (/stream closed/i.test(errorMessage)) {
					return "Agent 内部通信流已断开。这通常是因为所用模型与 Agent SDK 不完全兼容，建议切换到 Claude 系列模型重试。";
				}
				if (/aborted/i.test(errorMessage)) {
					return "Agent 任务已取消。";
				}
				if (/timeout|timed out/i.test(errorMessage)) {
					return "Agent 请求超时，请检查网络连接后重试。";
				}
				return errorMessage;
			})();
			const assistantMessage = createMessage(
				"assistant",
				`⚠️ Agent 执行失败: ${friendlyError}`,
				{
					isStreaming: false,
					model: activeModel ?? undefined,
					metadata:
						taskId && !chatSettings.inlineTraceEnabled
							? { trace: { type: "agent_task", taskId } }
							: undefined,
				},
			);
			if (taskId && chatSettings.inlineTraceEnabled) {
				const fileUpdateBlocks = Array.isArray(
					(assistantMessage.metadata as any)?.fileUpdates,
				)
					? (assistantMessage.metadata as any).fileUpdates.map(
							(update: any) => ({ type: "file_update" as const, update }),
						)
					: [];
				assistantMessage.metadata = {
					...(assistantMessage.metadata || {}),
					blocks: [
						...(assistantMessage.content.trim()
							? [{ type: "text" as const, text: assistantMessage.content }]
							: []),
						...fileUpdateBlocks,
					],
				};
			}
			if (assistantMessage.metadata) {
				const trace = assistantMessage.metadata.trace;
				const taskIdForBlocks =
					trace?.type === "agent_task" ? trace.taskId : undefined;
				if (taskIdForBlocks) {
					const toolCalls = errorState.currentTask?.toolCalls || [];
					const toolCallBlocks = toolCalls.map((tc) => ({
						type: "tool_call" as const,
						taskId: taskIdForBlocks,
						toolCallId: tc.id,
						name: tc.name,
						status: tc.status,
					}));
					const fileUpdateBlocks = Array.isArray(
						assistantMessage.metadata.fileUpdates,
					)
						? assistantMessage.metadata.fileUpdates.map((update) => ({
								type: "file_update" as const,
								update,
							}))
						: [];
					assistantMessage.metadata = {
						...assistantMessage.metadata,
						blocks: [
							...(assistantMessage.content.trim()
								? [{ type: "text" as const, text: assistantMessage.content }]
								: []),
							...toolCallBlocks,
							...fileUpdateBlocks,
						],
					};
				} else {
					assistantMessage.metadata = {
						...assistantMessage.metadata,
						blocks:
							encodeChatMessageToAgentContentJson(assistantMessage).blocks,
					};
				}
			}
			chatStore.addMessage(session.id, assistantMessage);
			if (
				chatSettings.persistEnabled &&
				boundAgentSessionId &&
				!boundAgentSessionId.startsWith("local-")
			) {
				void persistChatMessageToAgentSession(
					boundAgentSessionId,
					assistantMessage,
				).then((record) => {
					if (record?.id) {
						chatStore.updateMessage(session.id, assistantMessage.id, {
							metadata: { agentMessageId: record.id },
						});
					}
				});
			}
			chatStore.setStatus("error", errorMessage);
		} finally {
			if (watchdogTimer !== null) {
				clearInterval(watchdogTimer);
				watchdogTimer = null;
			}
			if (detachAgentEvent) {
				detachAgentEvent();
				detachAgentEvent = null;
			}
			setAbortController(null);
			setAbortController(null);
		}
	};

	return { handleAgentModeMessage };
}
