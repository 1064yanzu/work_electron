import type { AgentMessage } from "@/lib/agent/claudeAgentService";
import { saveCheckpoint } from "@/lib/agent/api";
import { generateErrorRecoveryStrategy } from "@/lib/agent/errorRecoveryStrategies";
import { extractToolErrorMessageFromUnknown } from "@/lib/agent/runtimeText";
import { agentStore } from "@/lib/agent/store";
import type { AgentTaskStep, ToolCall, ToolType } from "@/lib/agent/types";
import { EVENTS, events } from "@/lib/events";
import { isHtmlPreviewPath } from "@/lib/frontendPreview";
import { managedModeStore } from "@/lib/managedModeStore";
import { previewServerStore } from "@/lib/previewServerStore";
import {
	DATA_IMAGE_URL_LIMIT,
	collectDataImageUrlsFromUnknown,
	collectImageFilePathsFromToolOutput,
	mergeImagePathsIntoToolOutput,
	persistDataImageUrlToSandbox,
} from "./imageArtifacts";
import { getBasename } from "./pathUtils";

export interface CustomTaskRunState {
	toolStepCounter: number;
	lastToolCallId: string | null;
}

export function createCustomTaskMessageHandler(ctx: {
	taskId: string;
	sandboxDir?: string;
	activeModel: string;
	query: string;
	systemPrompt?: string;
	conversationSessionId?: string;
	runState: CustomTaskRunState;
	processedToolResultIds: Set<string>;
	completedToolCalls: string[];
	getSdkSessionId: () => string | undefined;
	getFinalResult: () => string;
	onMessage?: (message: AgentMessage) => void;
	onThoughtChunk?: (
		chunk: string,
		meta?: {
			title?: string;
			source?: string;
			phase?: string;
			durationMs?: number;
		},
	) => void;
}): (message: AgentMessage) => Promise<void> {
	const {
		taskId,
		sandboxDir,
		activeModel,
		query,
		systemPrompt,
		conversationSessionId,
		runState,
		processedToolResultIds,
		completedToolCalls,
	} = ctx;

	return async (message: AgentMessage) => {
		ctx.onMessage?.(message);
		// Update UI based on message type
		switch (message.type) {
			case "tool_call": {
				runState.toolStepCounter++;
				const toolCallIdBase =
					typeof message.toolCallId === "string" && message.toolCallId.trim()
						? message.toolCallId.trim()
						: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
				const toolCallId = `sdk-tool-${toolCallIdBase}`;

				const truncate = (s: string, max = 180) => {
					const t = String(s || "")
						.replace(/\s+/g, " ")
						.trim();
					return t.length > max ? `${t.slice(0, max)}…` : t;
				};

				// 构建工具描述，包含参数信息（避免把超长 command/content 直接塞进 UI）
				let description =
					message.content || `Calling ${message.toolName || "Tool"}...`;
				if (message.toolInput && Object.keys(message.toolInput).length > 0) {
					const toolLower = String(message.toolName || "").toLowerCase();
					if (toolLower === "bash") {
						const cmd =
							typeof (message.toolInput as any)?.command === "string"
								? String((message.toolInput as any).command)
								: "";
						const desc =
							typeof (message.toolInput as any)?.description === "string"
								? String((message.toolInput as any).description)
								: "";
						description = desc ? truncate(desc, 160) : truncate(cmd, 160);
					} else {
						const inputDesc = Object.entries(message.toolInput)
							.map(([k, v]) => {
								if (typeof v === "string") return `${k}: ${truncate(v, 120)}`;
								return `${k}: ${truncate(JSON.stringify(v), 120)}`;
							})
							.slice(0, 3) // 最多显示3个参数
							.join(", ");
						description = inputDesc || description;
					}
				}

				// 推断工具类型
				const inferToolType = (name: string): ToolType => {
					const lower = name?.toLowerCase() || "";
					// claude-agent-sdk 0.3.142+：TaskCreate/TaskUpdate/TaskGet/TaskList 族替代 TodoWrite
					if (
						lower === "todowrite" ||
						lower === "taskcreate" ||
						lower === "taskupdate" ||
						lower === "taskget" ||
						lower === "tasklist"
					)
						return "custom";
					if (
						lower === "bash" ||
						lower.includes("terminal") ||
						lower.includes("shell")
					)
						return "code_execute";
					if (lower.includes("skill")) return "skill_call";
					if (lower.includes("search")) return "web_search";
					if (lower.includes("read") || lower.includes("view"))
						return "file_read";
					if (lower.includes("write") || lower.includes("edit"))
						return "file_write";
					if (lower.includes("list") || lower.includes("ls"))
						return "file_list";
					return "custom";
				};

				// 创建并添加 ToolCall 到 store，这会触发 tool_started 事件
				const toolCall: ToolCall = {
					id: toolCallId,
					type: inferToolType(message.toolName || ""),
					name: message.toolName || "Tool",
					description: description,
					input: message.toolInput || {},
					status: "running",
					startedAt: Date.now(),
				};
				console.log("[AgentExecutor SDK] Adding ToolCall to store:", {
					id: toolCall.id,
					name: toolCall.name,
					type: toolCall.type,
					hasCurrentTask: !!agentStore.getState().currentTask,
				});
				agentStore.addToolCall(toolCall);

				// 同时添加任务步骤到 UI
				const toolStep: AgentTaskStep = {
					id: `tool-step-${runState.toolStepCounter}`,
					title: message.toolName || "Tool",
					description: description,
					status: "running",
					kind: "custom",
				};

				// Get current steps and append
				const currentSteps = agentStore.getState().currentTask?.steps || [];
				agentStore.setTaskSteps([...currentSteps, toolStep]);

				// 保存 toolCallId 以便 tool_result 使用
				runState.lastToolCallId = toolCallId;
				break;
			}

			case "tool_result": {
				const resolvedToolCallId =
					typeof message.toolCallId === "string" && message.toolCallId.trim()
						? `sdk-tool-${message.toolCallId.trim()}`
						: runState.lastToolCallId;
				if (resolvedToolCallId) {
					if (processedToolResultIds.has(resolvedToolCallId)) {
						break;
					}
					processedToolResultIds.add(resolvedToolCallId);
				}
				let normalizedToolOutput = message.toolOutput;

				// 子代理/工具若返回 data:image;base64，先落盘到沙盒并改写为 image_paths，避免上下文和 UI 被 base64 污染
				try {
					const dataUrls = collectDataImageUrlsFromUnknown(
						message.toolOutput,
						DATA_IMAGE_URL_LIMIT,
					);
					if (dataUrls.length > 0 && sandboxDir) {
						const savedPaths: string[] = [];
						for (const dataUrl of dataUrls) {
							try {
								const saved = await persistDataImageUrlToSandbox({
									dataUrl,
									sandboxDir,
									prefix: "subagent-image",
								});
								if (saved) savedPaths.push(saved);
							} catch {
								// 单条失败不影响其他图片
							}
						}
						if (savedPaths.length > 0) {
							normalizedToolOutput = mergeImagePathsIntoToolOutput(
								message.toolOutput,
								savedPaths,
							);
						}
					}
				} catch {
					// 静默失败，回退使用原始工具输出
				}

				const toolErrorMessage =
					message.status === "error"
						? extractToolErrorMessageFromUnknown(normalizedToolOutput) ||
							"工具调用失败"
						: undefined;
				const displayToolOutput =
					message.status === "error" && toolErrorMessage
						? toolErrorMessage
						: normalizedToolOutput;

				// 更新工具调用状态（优先使用 SDK 的 tool_use_id）
				if (resolvedToolCallId) {
					agentStore.updateToolCall(resolvedToolCallId, {
						output: displayToolOutput,
						error: toolErrorMessage,
						status: message.status === "error" ? "error" : "completed",
						completedAt: Date.now(),
					});

					if (toolErrorMessage) {
						const currentToolCall =
							agentStore
								.getState()
								.currentTask?.toolCalls.find(
									(tc) => tc.id === resolvedToolCallId,
								) || null;
						if (currentToolCall) {
							agentStore.setPendingErrorRecovery(
								resolvedToolCallId,
								generateErrorRecoveryStrategy(
									toolErrorMessage,
									currentToolCall.type,
									currentToolCall.name,
									currentToolCall.retryCount || 0,
								),
							);
						}
					}
				}

				// 更新最新的工具步骤状态和描述
				const steps = agentStore.getState().currentTask?.steps || [];
				if (steps.length > 0) {
					const lastStep = steps[steps.length - 1];
					if (lastStep.status === "running" || lastStep.status === "pending") {
						// 格式化输出内容
						const outputStr =
							typeof displayToolOutput === "string"
								? displayToolOutput
								: JSON.stringify(displayToolOutput, null, 2);

						// 追加结果到描述中（限制长度避免 UI 爆炸）
						const truncatedOutput =
							outputStr.length > 1000
								? outputStr.slice(0, 1000) + "\n...(truncated)"
								: outputStr;

						const newDescription = `${lastStep.description}\n\n**Result:**\n\`\`\`\n${truncatedOutput}\n\`\`\``;

						const updatedSteps = [...steps];
						updatedSteps[updatedSteps.length - 1] = {
							...lastStep,
							description: newDescription,
							status: message.status === "error" ? "error" : "completed",
						};
						agentStore.setTaskSteps(updatedSteps);
					}
				}

				// 从工具输出中提取图片文件路径并创建产物（兼容子代理/自定义工具）
				try {
					const imagePaths = collectImageFilePathsFromToolOutput(
						normalizedToolOutput,
						sandboxDir,
					);
					const existing = new Set(
						(agentStore.getState().currentTask?.artifacts || [])
							.filter((a) => a.type === "image")
							.map((a) => String(a.url || "").trim()),
					);
					if (imagePaths.length > 0) {
						for (const imagePath of imagePaths) {
							const normalized = String(imagePath || "").trim();
							if (!normalized || existing.has(normalized)) continue;
							existing.add(normalized);

							const cleanForName = normalized.split("#")[0].split("?")[0];
							const fileName =
								getBasename(cleanForName) ||
								`generated-image-${Date.now()}.png`;

							agentStore.addArtifact({
								id: `artifact-img-${Date.now()}-${Math.random()
									.toString(36)
									.slice(2, 7)}`,
								type: "image",
								title: fileName,
								url: normalized,
								metadata: {
									...(resolvedToolCallId
										? { toolCallId: resolvedToolCallId }
										: {}),
									source: "tool_output",
								},
							});
						}
					}

					// 同步中间栏文件树；自动预览交由 SandboxWorkspace 统一仲裁
					if (sandboxDir && imagePaths.length > 0) {
						await managedModeStore.scanSandboxDir(sandboxDir);
						const firstPath = String(imagePaths[0] || "").trim();
						if (firstPath) {
							events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
								toolCallId: resolvedToolCallId,
								artifactUrl: firstPath,
								autoPreview: true,
							});
						}
					}

					// 对非图片类文件写入（Write/Edit 工具）也触发沙箱刷新和自动预览
					if (sandboxDir && imagePaths.length === 0) {
						const currentArtifacts =
							agentStore.getState().currentTask?.artifacts || [];
						const latestArtifact = currentArtifacts.find(
							(a) =>
								a?.metadata?.toolCallId === resolvedToolCallId &&
								(a.type === "file" || a.type === "code"),
						);
						if (latestArtifact?.url) {
							await managedModeStore.scanSandboxDir(sandboxDir);
							if (isHtmlPreviewPath(latestArtifact.url)) {
								events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
									toolCallId: resolvedToolCallId,
									artifactUrl: latestArtifact.url,
									autoPreview: true,
								});
							}

							// 自动启动预览服务器（如果检测到 package.json 或多文件项目）
							const fileName = latestArtifact.url.split("/").pop() || "";
							const isPackageJson = fileName === "package.json";
							const isHtmlFile = isHtmlPreviewPath(latestArtifact.url);
							const isCssOrJs = /\.(css|js|jsx|ts|tsx)$/.test(fileName);

							if (isPackageJson || isHtmlFile || isCssOrJs) {
								const serverState =
									previewServerStore.getState().servers[taskId];
								if (!serverState?.running) {
									previewServerStore.start(taskId, sandboxDir);
								}
							}
						}
					}
				} catch {
					// 静默失败
				}

				// 检查点：记录已完成的工具调用并保存
				if (resolvedToolCallId && message.status !== "error") {
					completedToolCalls.push(resolvedToolCallId);
					// 异步保存检查点（不阻塞主流程）
					saveCheckpoint({
						task_id: taskId,
						session_id: conversationSessionId || taskId,
						sdk_session_id: ctx.getSdkSessionId(),
						sandbox_dir: sandboxDir,
						last_tool_call_id: resolvedToolCallId,
						tool_calls_completed: completedToolCalls,
						accumulated_result: ctx.getFinalResult(),
						metadata: { query, systemPrompt, model: activeModel },
					}).catch((err) => {
						console.warn("[AgentExecutor] Failed to save checkpoint:", err);
					});
				}

				break;
			}

			case "assistant":
				// Text content - already handled by onChunk
				break;

			case "thought_delta":
				ctx.onThoughtChunk?.(message.content, message.thoughtMeta);
				break;

			case "tool_input_update": {
				// 更新工具调用的 input 字段（工具输入流式传输完成）
				const resolvedId =
					typeof message.toolCallId === "string" && message.toolCallId.trim()
						? `sdk-tool-${message.toolCallId.trim()}`
						: null;
				if (resolvedId && message.toolInput) {
					agentStore.updateToolCall(resolvedId, {
						input: message.toolInput,
					});
				}
				break;
			}

			case "tool_progress": {
				const resolvedId =
					typeof message.toolCallId === "string" && message.toolCallId.trim()
						? `sdk-tool-${message.toolCallId.trim()}`
						: null;
				const progressMessage =
					typeof message.message === "string" && message.message.trim()
						? message.message
						: typeof message.content === "string" && message.content.trim()
							? message.content
							: "";
				if (resolvedId && progressMessage) {
					agentStore.updateToolProgress(
						resolvedId,
						progressMessage,
						message.progress,
					);
				}
				break;
			}

			case "result":
				if (message.status === "completed") {
					agentStore.updateTaskStepByKind("analysis", "completed");
				}
				break;

			case "system":
				console.log("[AgentExecutor SDK] System message:", message.content);
				if (message.metadata && typeof message.metadata === "object") {
					agentStore.setTaskMetadata(message.metadata);
				}
				if (
					/压缩上下文|compacting|compact/i.test(String(message.content || ""))
				) {
					const currentCount = Number(
						(agentStore.getState().currentTask?.metadata as any)
							?.compactionCount || 0,
					);
					agentStore.setTaskMetadata({
						compactionCount: currentCount + 1,
					});
				}
				break;
		}
	};
}
