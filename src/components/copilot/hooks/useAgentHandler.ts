// Agent 模式消息处理 Hook

import type { SlashCommand } from "@/components/chat/SlashCommand";
import type { ChatStoreLike } from "@/components/copilot/types";
import {
	encodeChatMessageToAgentContentJson,
	persistChatMessageToAgentSession,
} from "@/lib/agent/chatBridge";
import { buildConversationMessagesForAgentRun } from "@/lib/agent/context/conversationMessages";
import { isSdkSessionId } from "@/lib/agent/context/sessionId";
import { agentExecutor } from "@/lib/agent/executor";
import { parsePlanFromAgentOutput } from "@/lib/agent/planModePrompt";
import { planModeStore, setPlan } from "@/lib/agent/planModeStore";
import {
	buildAgentInterruptionNote,
	buildAgentNoTextCompletionSummary,
	toFriendlyAgentRuntimeError,
} from "@/lib/agent/runtimeText";
import { sessionStore } from "@/lib/agent/sessionManager";
import { agentStore } from "@/lib/agent/store";
import {
	buildAgentConversationContext,
	guessFallbackSearchQuery,
	parseDocProtocolFinal,
} from "@/lib/chat/docProtocol";
import { chatStore as chatStoreInstance } from "@/lib/chat/store";
import {
	filterThoughtBlocksForPersistence,
	StreamBlocksBuilder,
} from "@/lib/chat/streamBlocksBuilder";
import {
	getTaskImageArtifactPaths,
	normalizeRuntimeText,
	replaceDataImageMarkdownWithPaths,
} from "@/lib/chat/streamHelpers";
import { createMessage } from "@/lib/chat/types";
import { EVENTS, events } from "@/lib/events";
import { takeFork as takeForkIntent } from "@/lib/slashCommands/forkIntentStore";
import { workspaceStore } from "@/lib/workspaceStore";
import {
	buildAttachedFilesForUI,
	resolveAttachmentsFromContexts,
} from "./agentHandler/attachments";
import {
	type AgentBlocksDeps,
	buildAgentFinalBlocks,
	buildAgentSkillBlocks,
	type SkillBlockHolder,
} from "./agentHandler/blocks";
import { buildCompletionAssistantMessage } from "./agentHandler/completionMessage";
import { createAgentChunkHandler } from "./agentHandler/docProtocolChunks";
import { createInlineToolMessageHandler } from "./agentHandler/inlineToolMessages";
import {
	bindAgentSession,
	prepareUserMessage,
} from "./agentHandler/sessionBinding";
import { createStreamingMessageController } from "./agentHandler/streamingMessage";
import { createAgentWatchdogProbe } from "./agentHandler/watchdogProbe";
import {
	AGENT_WATCHDOG_IDLE_FINALIZE_MS,
	AGENT_WATCHDOG_STALLED_EXECUTION_MS,
	appendStallFinalizeNote,
	createAgentWatchdog,
} from "./agentWatchdog";

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
		_forcedSkillId: string | undefined,
		skipUserMessage: boolean | undefined,
		forceForkSession: boolean,
		parentSdkSessionIdForRun: string | undefined,
	) => {
		const boundAgentSessionId = await bindAgentSession({ chatStore, session });

		// 如果当前 session 尚无 cwd，从 sessionStore 获取当前工作目录并记录
		if (!session.cwd) {
			const currentAgentSession = sessionStore.getCurrentSession();
			if (currentAgentSession?.cwd) {
				chatStore.setSessionCwd(session.id, currentAgentSession.cwd);
			}
		}

		// 创建或获取用户消息
		const userMessage = prepareUserMessage({
			chatStore,
			session,
			content,
			userTextForChat,
			skipUserMessage,
			activeModel,
			persistEnabled: chatSettings.persistEnabled,
			boundAgentSessionId,
			onFirstUserMessage,
		});
		if (!userMessage) return;
		chatStore.setStatus("streaming");

		let detachAgentEvent: (() => void) | null = null;
		let currentTaskId: string | null = null;
		let forcedFinalized = false;
		let lastActivityAt = Date.now();

		const touchActivity = () => {
			lastActivityAt = Date.now();
		};

		const lastSkillBlockHolder: SkillBlockHolder = { current: null };
		const streamBuilder = new StreamBlocksBuilder({
			thoughtMaxChars: 64 * 1024,
		});

		const getStreamText = () => streamBuilder.getText();

		const blockDeps: AgentBlocksDeps = {
			streamBuilder,
			getCurrentTaskId: () => currentTaskId,
			lastSkillBlockHolder,
		};
		const buildSkillBlocks = () => buildAgentSkillBlocks(blockDeps);
		const buildFinalBlocks = (
			finalText: string,
			protocol: ReturnType<typeof parseDocProtocolFinal>,
		) => buildAgentFinalBlocks(finalText, protocol, blockDeps);

		const streaming = createStreamingMessageController({
			chatStore,
			sessionId: session.id,
			activeModel,
			getStreamText,
			buildSkillBlocks,
		});
		const {
			ensureStreamingMessage,
			updateStreamingMessage,
			scheduleStreamingUpdate,
		} = streaming;

		// Watchdog：判定逻辑与计时都在 ./agentWatchdog 里，这里只负责采集快照 +
		// 把收口动作接回 finalizeFromRawText（后者定义在下方的 try 块里，
		// 用函数声明提升不了，所以经由 watchdogFinalize 这个可变引用转发）
		let watchdogFinalize: ((rawText: string, source: string) => void) | null =
			null;
		const watchdog = createAgentWatchdog({
			thresholds: {
				idleFinalizeMs: AGENT_WATCHDOG_IDLE_FINALIZE_MS,
				stalledExecutionMs: AGENT_WATCHDOG_STALLED_EXECUTION_MS,
			},
			probe: createAgentWatchdogProbe({
				isFinalized: () => forcedFinalized,
				getStreamingMsgId: () => streaming.getStreamingMsgId(),
				getLastActivityAt: () => lastActivityAt,
				streamBuilder,
				getStreamText,
			}),
			onFinalize: (action) => {
				watchdogFinalize?.(
					getStreamText(),
					action === "finalize_stall"
						? "watchdog_stall"
						: "watchdog_inactivity",
				);
			},
		});

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

		const getCurrentInlineTaskId = () =>
			currentTaskId || agentStore.getState().currentTask?.id || "agent-task";

		const getCurrentWorkingDirectory = () =>
			session.cwd || sessionStore.getCurrentSession()?.cwd || undefined;

		const handleSdkInlineMessage = createInlineToolMessageHandler({
			streamBuilder,
			inlineTraceEnabled: chatSettings.inlineTraceEnabled,
			getCurrentInlineTaskId,
			getCurrentWorkingDirectory,
			ensureStreamingMessage,
			updateStreamingMessage,
			touchActivity,
		});

		ensureStreamingMessage();

		try {
			const clearWatchdog = () => watchdog.clear();

			const finalizeFromRawText = (rawText: string, source: string) => {
				if (forcedFinalized) return;
				forcedFinalized = true;
				streamBuilder.flushParser();
				const finalRawText = rawText || getStreamText();

				const protocol = parseDocProtocolFinal(finalRawText, {
					activeDocContent: "",
					hasActiveDoc: false,
					prompt: command?.name || content.slice(0, 50),
				});
				let result = replaceDataImageMarkdownWithPaths(
					normalizeRuntimeText(protocol.displayContent),
					getTaskImageArtifactPaths(
						agentStore.getState().currentTask?.artifacts,
					),
				);
				const forcedByStall = source === "watchdog_stall";
				if (forcedByStall) {
					result = appendStallFinalizeNote(result);
					agentStore.completeTask(result);
				}
				const forcedFinalState = agentStore.getState();
				const forcedTokenUsage = (forcedFinalState.currentTask?.metadata as any)
					?.tokenUsage as
					| {
							promptTokens: number;
							completionTokens: number;
							totalTokens: number;
					  }
					| undefined;

				if (protocol.kind === "update") {
					events.emit(EVENTS.AI_DOC_UPDATE_END, protocol.eventPayload);
				} else if (protocol.kind === "create") {
					queueCreateProposal(protocol.eventPayload);
				}

				const streamingMsgId = streaming.getStreamingMsgId();
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

				chatStore.setStatus("idle");
				try {
					agentExecutor.cancel({ updateStore: !forcedByStall });
				} catch {}

				if (detachAgentEvent) {
					detachAgentEvent();
					detachAgentEvent = null;
				}
				debugWarn("[CopilotSidebar] Forced finalize agent message", {
					source,
				});
			};

			watchdogFinalize = finalizeFromRawText;
			watchdog.start();

			const systemPrompt = undefined;
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
			const { attachedContexts, attachedFiles } =
				await resolveAttachmentsFromContexts(contexts, debugLog);

			// 将附件信息更新到用户消息的 metadata 中（以便在 UI 中显示）
			if (attachedFiles.length > 0 || attachedContexts.length > 0) {
				const attachedFilesForUI = buildAttachedFilesForUI(
					attachedFiles,
					attachedContexts,
				);

				if (attachedFilesForUI.length > 0) {
					chatStore.updateMessage(session.id, userMessage.id, {
						metadata: {
							...userMessage.metadata,
							attachedFiles: attachedFilesForUI,
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
					const streamingMsgId = streaming.getStreamingMsgId();
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

				// 聊天正文里的工具卡片由 SDK transformed events 直接驱动。
				// agentStore 事件仍用于任务面板/中间栏状态，但不再作为正文卡片的时序源。
			});

			const onChunk = createAgentChunkHandler({
				streamBuilder,
				getStreamText,
				touchActivity,
				scheduleStreamingUpdate,
			});

			// 如果有存活的 run，用 followup 模式（不重开进程，利用 prompt cache）
			const agentRun = agentExecutor.canFollowup
				? await agentExecutor.executeFollowup(content, {
						workingDirectory:
							session.cwd || sessionStore.getCurrentSession()?.cwd || undefined,
						attachedContexts,
						attachedFiles,
						onChunk,
						onMessage: handleSdkInlineMessage,
						onThoughtChunk: (chunk, meta) => {
							touchActivity();
							streamBuilder.appendThoughtChunk(chunk, meta);
							scheduleStreamingUpdate();
						},
					})
				: await agentExecutor.executeCustomTask(
						content,
						systemPrompt,
						undefined,
						(() => {
							// 读取并消费一次 /fork 意图（若有）；必须先算好 base 以注入参数
							const forkIntentBase = takeForkIntent(session.id);
							const resumeSessionIdForRun = (() => {
								if (forkIntentBase) return forkIntentBase;
								if (!session.sdkSessionId) return undefined;
								if (isSdkSessionId(session.sdkSessionId))
									return session.sdkSessionId;
								chatStore.setSessionSdkSessionId(session.id, undefined);
								return undefined;
							})();
							const effectiveForkSession = Boolean(
								forkIntentBase || forceForkSession,
							);
							return {
								// 直接把用户选定的真实目录（session.cwd）作为 agent 工作目录，
								// 与 Claude Code CLI 一致：agent 在用户目录里操作原文件。
								workingDirectory:
									session.cwd ||
									sessionStore.getCurrentSession()?.cwd ||
									undefined,
								conversationContext,
								fallbackSearchQuery,
								hasActiveDoc: false,
								activeDocContent: "",
								attachedContexts,
								attachedFiles, // 传递文件路径
								conversationSessionId: session.id,
								sandboxKey: boundAgentSessionId || session.id,
								resumeSessionId: resumeSessionIdForRun,
								persistSession: true,
								forkSession: effectiveForkSession,
								parentSdkSessionId: parentSdkSessionIdForRun,
								documentContextInjected: true,
								planMode: planModeStore.getState().enabled,
								confirmedPlan:
									planModeStore.getState().currentPlan?.status === "confirmed"
										? (planModeStore.getState().currentPlan ?? undefined)
										: undefined,
								onChunk, // 流式输出回调
								onMessage: handleSdkInlineMessage,
								onThoughtChunk: (
									chunk: string,
									meta?: {
										title?: string;
										source?: string;
										phase?: string;
										durationMs?: number;
									},
								) => {
									touchActivity();
									streamBuilder.appendThoughtChunk(chunk, meta);
									scheduleStreamingUpdate();
								},
							};
						})(),
					);
			workspaceStore.clearContexts();

			if (agentRun?.sdkSessionId) {
				chatStore.setSessionSdkSessionId(session.id, agentRun.sdkSessionId);
			}

			clearWatchdog();
			if (forcedFinalized) return;
			streamBuilder.flushParser();

			const streamingMsgId = streaming.getStreamingMsgId();

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

			const taskError =
				finalState.currentTask?.status === "error"
					? finalState.currentTask.error || "任务执行失败"
					: "";

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
			if (taskError && !rawText.trim() && !hasImages) {
				throw new Error(taskError);
			}
			const rawResult = (() => {
				if (rawText) return rawText;
				if (hasImages) return "";
				// 检查 agentStore 中是否有更详细的错误信息
				const taskMeta = finalState.currentTask?.metadata as any;
				if (taskError) return `⚠️ ${taskError}`;
				if (taskMeta?.lastStderrError) return `⚠️ ${taskMeta.lastStderrError}`;
				const noTextSummary = buildAgentNoTextCompletionSummary(
					finalState.currentTask,
				);
				if (noTextSummary) return noTextSummary;
				return "⚠️ 任务已完成，但未能生成文本结果。可能是模型响应格式不兼容，请尝试切换模型或重新发送。";
			})();

			const protocol = parseDocProtocolFinal(rawResult, {
				activeDocContent: "",
				hasActiveDoc: false,
				prompt: command?.name || content.slice(0, 50),
			});
			let result = replaceDataImageMarkdownWithPaths(
				normalizeRuntimeText(protocol.displayContent),
				getTaskImageArtifactPaths(agentStore.getState().currentTask?.artifacts),
			);
			if (taskError) {
				const interruptionNote = buildAgentInterruptionNote(taskError);
				result = result.trim()
					? `${result}\n\n> ${interruptionNote}`
					: `> ${interruptionNote}`;
			}

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
					await (await import("@/lib/agent/api")).updateAgentTask(
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
				const assistantMessage = buildCompletionAssistantMessage({
					result,
					protocol,
					activeModel,
					inlineTraceEnabled: chatSettings.inlineTraceEnabled,
					currentTaskId,
					finalState,
					currentSkill: agentStore.getState().currentSkill,
				});
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
			watchdog.clear();
			if (forcedFinalized) return;
			const errorMessage = error instanceof Error ? error.message : "未知错误";
			const taskId = currentTaskId || null;
			const errorState = agentStore.getState();
			const friendlyError = toFriendlyAgentRuntimeError(errorMessage);
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
			watchdog.clear();
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
