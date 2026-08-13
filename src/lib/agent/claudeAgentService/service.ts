import type {
	SDKMessage,
	SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { isSdkSessionId } from "@/lib/agent/context/sessionId";
import { getMcpConfigForSdk } from "@/lib/agent/mcpConfig";
import { isClaudeFamilyModel } from "@/lib/agent/modelGuards";
import { toFriendlyAgentRuntimeError } from "@/lib/agent/runtimeText";
import { AgentStreamState, type UIEvent } from "@/lib/agent/streamState";
import { settingsStore } from "@/lib/settingsStore";
import { invoke } from "@/lib/tauriCompat";
import { listen } from "@/lib/tauriEventCompat";
import { resolveExecutionSettings } from "./executionSettings";
import {
	handleInteractionRequest,
	type InteractionRequestPayload,
} from "./interactionRequests";
import { VisibleTextReplayGuard } from "./replayDedupe";
import { emitSubagentActivityMessages } from "./subagentActivity";
import { isTaskListToolName, TaskListTracker } from "./taskListTracker";
import { ToolErrorLoopGuard } from "./toolErrorGuard";
import type {
	AgentMessage,
	AgentUsageStats,
	ClaudeAgentExecutionOptions,
} from "./types";
import { mapNotificationEventToMessage } from "./uiEventMessages";
import { parseUsageStatsFromResult } from "./usage";

/**
 * Claude Agent Service
 *
 * Wraps the Claude Agent SDK and provides a simplified interface
 * for executing agent queries with streaming support.
 */
export class ClaudeAgentService {
	private _activeRunId: string | null = null;
	private _alive: boolean = false;

	get activeRunId(): string | null {
		return this._activeRunId;
	}

	get alive(): boolean {
		return this._alive;
	}

	// Followup turn signal：当 execute 内部收到 done 时 resolve，
	// sendFollowup 可以 await 这个 promise 等待当前 turn 完成。
	private _followupTurnResolve: (() => void) | null = null;
	private _followupTurnReject: ((err: Error) => void) | null = null;

	/**
	 * 标记 run 为 alive（由 execute 的 finally 中调用）。
	 */
	private _markAlive() {
		this._alive = true;
	}

	/**
	 * 标记 run 为 dead（由 execute 的 finally 中调用）。
	 */
	private _markDead() {
		this._alive = false;
		this._activeRunId = null;
		this._followupTurnResolve = null;
		this._followupTurnReject = null;
	}

	/**
	 * 发送 followup 消息到正在存活的 run。
	 * 复用已有的 IPC 事件监听，等待下一个 done 事件。
	 */
	async sendFollowup(options: {
		message: string;
		attachments?: Array<{ path: string; title?: string }>;
		onChunk?: (text: string) => void;
		onMessage?: (message: AgentMessage) => void;
		onComplete?: (result: {
			success: boolean;
			summary?: string;
			sessionId?: string;
			usage?: AgentUsageStats;
		}) => void;
		abortController?: AbortController;
	}): Promise<void> {
		if (!this._activeRunId || !this._alive) {
			throw new Error("No alive run to send followup to");
		}

		// 更新回调（让持久事件处理器使用新的回调）
		if (options.onChunk) this._currentOnChunk = options.onChunk;
		if (options.onMessage) this._currentOnMessage = options.onMessage;
		if (options.onComplete) this._currentOnComplete = options.onComplete;

		// Abort 处理
		const abortHandler = () => {
			void invoke("agent_sdk_abort", { runId: this._activeRunId });
			this._followupTurnReject?.(new Error("Aborted"));
		};
		options.abortController?.signal.addEventListener("abort", abortHandler, {
			once: true,
		});

		try {
			const result = await invoke<{ success: boolean; error?: string }>(
				"agent_sdk_send_followup",
				{
					runId: this._activeRunId,
					message: options.message,
					attachments: options.attachments,
				},
			);

			if (!result.success) {
				this._markDead();
				throw new Error(result.error || "Followup failed");
			}

			// 等待本轮 done 事件（由持久事件处理器 resolve）
			await new Promise<void>((resolve, reject) => {
				this._followupTurnResolve = resolve;
				this._followupTurnReject = reject;
			});
		} finally {
			options.abortController?.signal.removeEventListener(
				"abort",
				abortHandler,
			);
		}
	}

	/**
	 * 检查后端 run 是否仍然 alive。
	 */
	async checkAlive(runId?: string): Promise<boolean> {
		const id = runId || this._activeRunId;
		if (!id) return false;
		try {
			const result = await invoke<{ alive: boolean }>("agent_sdk_check_alive", {
				runId: id,
			});
			return result.alive;
		} catch {
			return false;
		}
	}

	// 持久事件处理器的可替换回调（用于 followup 模式）
	private _currentOnChunk?: (text: string) => void;
	private _currentOnMessage?: (message: AgentMessage) => void;
	private _currentOnComplete?: (result: {
		success: boolean;
		summary?: string;
		sessionId?: string;
		usage?: AgentUsageStats;
	}) => void;
	private _persistentUnlisten: (() => void) | null = null;

	async control(input: {
		action:
			| "set_permission_mode"
			| "set_model"
			| "interrupt"
			| "mcp_status"
			| "mcp_reconnect"
			| "mcp_toggle"
			| "mcp_set_servers";
		mode?: string;
		model?: string;
		serverName?: string;
		enabled?: boolean;
		servers?: Record<string, unknown>;
	}): Promise<{ success: boolean; data?: unknown; error?: string }> {
		if (!this.activeRunId) {
			return { success: false, error: "No active run" };
		}
		return invoke("agent_sdk_control", {
			runId: this.activeRunId,
			...input,
		});
	}

	/**
	 * Execute an agent query with streaming results
	 */
	async execute(options: ClaudeAgentExecutionOptions): Promise<void> {
		const {
			prompt,
			workingDirectory,
			resumeSessionId,
			persistSession,
			forkSession,
			resumeSessionAt,
			model: userModel,
			skills,
			sandbox,
			onChunk,
			onMessage,
			onComplete,
			onTodoUpdate,
			abortController = new AbortController(),
		} = options;

		// Use user-specified model, or fall back to settings, or default
		const model =
			userModel || settingsStore.getActiveModel() || "claude-sonnet-4-5";
		console.log("[ClaudeAgentService] Using model for SDK:", model);
		const isClaudeModel = isClaudeFamilyModel(model);
		const {
			permissionModeForRun: resolvedPermissionModeForRun,
			interactiveApprovalForRun,
			mergedAdditionalDirectories,
			mergedPlugins,
			resolvedMaxTurns,
			resolvedThinkingLevel,
			resolvedMaxBudgetUsd,
			resolvedSettingSources,
			resolvedBetas,
			resolvedContextPolicy,
			resolvedSubagentContextMode,
			resolvedContextBudget,
			resolvedEnableToolSearch,
			resolvedAllowedTools,
			resolvedMcpServerLimit,
			resolvedSystemPrompt,
		} = await resolveExecutionSettings(options, isClaudeModel);

		let unlisten: (() => void) | null = null;
		let runId: string | null = null;
		let sessionId: string | null = null;
		let settle: ((err?: Error) => void) | null = null;
		let sawNonThoughtProgress = false;
		let thoughtOnlyStartedAt: number | null = null;
		let emittedLongThinkingWarning = false;
		const debug = import.meta.env?.VITE_AGENT_DEBUG === "1";
		const toolNamesById = new Map<string, string>();
		const toolErrorGuard = new ToolErrorLoopGuard(toolNamesById, debug);
		const taskListTracker = new TaskListTracker(onTodoUpdate, debug);
		const streamState = new AgentStreamState();
		const replayGuard = new VisibleTextReplayGuard((delta) => {
			// followup 模式下优先使用可替换引用
			(this._currentOnChunk || onChunk)?.(delta);
		});
		const bufferedEvents: Array<{
			runId: string;
			type: string;
			message?: SDKMessage;
			result?: SDKResultMessage;
			error?: string;
		}> = [];

		// 重试相关状态
		let retryAttempt = 0;
		const maxRetries = 3;
		const baseDelayMs = 1000;

		// 可替换回调引用——followup 模式下 sendFollowup 会替换这些引用，
		// 持久事件处理器通过 this._currentOn* 读取最新值。
		this._currentOnChunk = onChunk;
		this._currentOnMessage = onMessage;
		this._currentOnComplete = onComplete;

		const finished = new Promise<void>((resolve, reject) => {
			settle = (err?: Error) => (err ? reject(err) : resolve());
		});

		const abortHandler = () => {
			if (runId) void invoke("agent_sdk_abort", { runId });
			settle?.(new Error("Aborted"));
			this._followupTurnReject?.(new Error("Aborted"));
			this._markDead();
			if (this._persistentUnlisten) {
				this._persistentUnlisten();
				this._persistentUnlisten = null;
			}
		};
		abortController.signal.addEventListener("abort", abortHandler, {
			once: true,
		});

		try {
			const handleEvent = (payload: {
				runId: string;
				type: string;
				message?: SDKMessage;
				result?: SDKResultMessage;
				error?: string;
			}) => {
				// Followup 模式下，sendFollowup 会替换 _currentOn*，
				// 读取最新引用。active* 是 execute 局部 let，sendFollowup 通过
				// this._currentOn* 的 setter 间接更新它们。
				if (debug) {
					console.log("[ClaudeAgentService] handleEvent:", {
						payloadRunId: payload.runId,
						currentRunId: runId,
						type: payload.type,
					});
				}
				if (!runId) {
					if (debug) {
						console.log(
							"[ClaudeAgentService] runId not set yet, buffering event",
						);
					}
					bufferedEvents.push(payload);
					return;
				}
				if (payload.runId !== runId) {
					if (debug) console.log("[ClaudeAgentService] runId mismatch, ignore");
					return;
				}
				if (debug)
					console.log("[ClaudeAgentService] Processing:", payload.type);

				if (payload.type === "sdk_message" && payload.message) {
					// 核心目标：捕获子代理的内部活动并转化为 tool_progress 事件
					emitSubagentActivityMessages(payload.message, (m) =>
						this._currentOnMessage?.(m),
					);

					// 工具失败会持续反馈给模型自行恢复，这里只做死循环保护，不再过早中断任务。
					if ((payload.message as any)?.type === "user") {
						const { warnings, abortGuidance } =
							toolErrorGuard.recordUserMessage(payload.message as any);
						for (const warning of warnings) {
							this._currentOnMessage?.({
								type: "system",
								content: warning,
								status: "running",
							});
						}
						if (abortGuidance) {
							void invoke("agent_sdk_abort", { runId });
							this._currentOnMessage?.({
								type: "system",
								content: abortGuidance,
								status: "error",
							});
							this._currentOnComplete?.({
								success: false,
								summary: abortGuidance,
								sessionId: sessionId ?? undefined,
								usage: undefined,
							});
							if (unlisten) unlisten();
							unlisten = null;
							settle?.(new Error(abortGuidance));
							return;
						}
					}
					return;
				}

				if (payload.type === "stderr" && payload.error) {
					this._currentOnMessage?.({
						type: "system",
						content: payload.error,
						status: "error",
					});
					return;
				}

				if (
					payload.type === "interaction_request" &&
					(payload as any).request
				) {
					void handleInteractionRequest(
						(payload as any).request as InteractionRequestPayload,
						runId,
					);
					return;
				}

				// 处理转换后的 UI 事件
				if (payload.type === "transformed" && (payload as any).events) {
					const events = (payload as any).events as UIEvent[];
					streamState.processEvents(events);

					// 处理各种事件类型
					for (const event of events) {
						if (event.type === "session_init") {
							if (isSdkSessionId(event.sessionId)) {
								sessionId = event.sessionId;
							}
							continue;
						}
						const notification = mapNotificationEventToMessage(event);
						if (notification) {
							this._currentOnMessage?.(notification);
							continue;
						}
						if (event.type === "text_delta") {
							const delta =
								typeof event.content === "string" ? event.content : "";
							if (!delta) {
								continue;
							}
							sawNonThoughtProgress = true;
							thoughtOnlyStartedAt = null;
							replayGuard.handleDelta(delta);
						} else if (event.type === "thought_delta") {
							replayGuard.flushPending();
							if (!sawNonThoughtProgress) {
								if (thoughtOnlyStartedAt === null) {
									thoughtOnlyStartedAt = Date.now();
								} else if (
									!emittedLongThinkingWarning &&
									Date.now() - thoughtOnlyStartedAt >= 45_000
								) {
									emittedLongThinkingWarning = true;
									this._currentOnMessage?.({
										type: "system",
										content: !isClaudeModel
											? "当前模型长时间停留在思考通道，通常说明它与 Claude Agent SDK 的 reasoning 行为兼容性一般；我已经限制了默认思考预算，建议优先改用 Claude 模型执行托管任务。"
											: "当前任务已长时间停留在思考通道，正在等待模型进入执行阶段。",
										status: "running",
										metadata: {
											longThinking: true,
											model,
											thinkingLevel: resolvedThinkingLevel,
										},
									});
								}
							}
							this._currentOnMessage?.({
								type: "thought_delta",
								content: event.content,
								thoughtMeta: {
									title: event.title,
									source: event.source,
								},
								status: "running",
							});
						} else if (event.type === "tool_call_start") {
							replayGuard.flushPending();
							sawNonThoughtProgress = true;
							thoughtOnlyStartedAt = null;
							toolNamesById.set(event.id, event.name);
							// 检查是否是 TodoWrite 工具
							if (event.name === "TodoWrite" && event.input && onTodoUpdate) {
								const todos = (event.input as any).todos;
								if (Array.isArray(todos)) {
									onTodoUpdate(todos);
								}
								// TodoWrite 是任务列表更新，不作为普通 tool_call 渲染，避免误显示为“已创建文件”等。
								continue;
							}
							// TaskCreate/TaskUpdate/TaskGet/TaskList：TodoWrite 的新代，同样不作为普通
							// tool_call 渲染，而是回它的 tool_call_end 去维护任务列表快照
							// （taskId 只在返回值里，开始时还没有）。
							if (isTaskListToolName(event.name)) {
								if (event.input)
									taskListTracker.registerToolInput(event.id, event.input);
								continue;
							}
							// 构建工具调用描述，包含工具名称和参数
							const inputStr =
								event.input && Object.keys(event.input).length > 0
									? JSON.stringify(event.input, null, 2)
									: "";
							const description = inputStr
								? `${event.name}(${Object.keys(event.input).join(", ")})`
								: event.name;

							this._currentOnMessage?.({
								type: "tool_call",
								toolCallId: event.id,
								content: description,
								toolName: event.name,
								toolInput: event.input,
								status: "running",
							});
						} else if (event.type === "tool_call_end") {
							replayGuard.flushPending();
							sawNonThoughtProgress = true;
							thoughtOnlyStartedAt = null;
							// TodoWrite 的结果对 UI 没有必要展示为 tool_result（任务列表已经更新）
							if (toolNamesById.get(event.id) === "TodoWrite") {
								toolNamesById.delete(event.id);
								continue;
							}
							const taskToolName = toolNamesById.get(event.id);
							if (isTaskListToolName(taskToolName)) {
								taskListTracker.handleToolCallEnd(taskToolName, event);
								toolNamesById.delete(event.id);
								continue;
							}
							toolNamesById.delete(event.id);
							this._currentOnMessage?.({
								type: "tool_result",
								toolCallId: event.id,
								content:
									typeof event.output === "string"
										? event.output
										: JSON.stringify(event.output),
								toolOutput: event.output,
								status: event.isError ? "error" : "completed",
							});
						} else if (event.type === "result") {
							replayGuard.flushPending();
							// 不再作为可见消息显示 result 事件，避免任务完成后出现重复文本
							// result 事件仅用于标记任务完成，其内容已通过 text_delta 显示过
							// this._currentOnMessage?.({
							// 	type: "result",
							// 	content: event.result || "",
							// 	status: event.isError ? "error" : "completed",
							// });
						} else if (event.type === "tool_input_complete") {
							replayGuard.flushPending();
							// 工具输入流式传输完成，发送更新消息以更新工具调用的 input 字段
							this._currentOnMessage?.({
								type: "tool_input_update",
								toolCallId: event.id,
								content: "",
								toolInput: event.input,
							} as any);
						}
						// 忽略 'text' 事件，因为 'text_delta' 已经处理了增量内容
					}
					return;
				}

				if (payload.type === "done") {
					replayGuard.flushPending();
					const subtype = payload.result?.subtype;
					const resultAny = payload.result as any;
					if (
						typeof resultAny?.session_id === "string" &&
						isSdkSessionId(resultAny.session_id)
					) {
						sessionId = resultAny.session_id;
					}
					const sdkErrors =
						Array.isArray(resultAny?.errors) && resultAny.errors.length > 0
							? resultAny.errors.join("\n")
							: "";
					const resultText =
						typeof resultAny?.result === "string" ? resultAny.result : "";
					const ok =
						subtype === "success" && !resultAny?.is_error && !payload.error;
					const failureSummary =
						sdkErrors ||
						payload.error ||
						resultText ||
						subtype ||
						"Task finished";
					const usage = parseUsageStatsFromResult(resultAny);
					const runStillAlive = resultAny?.run_alive === true;

					this._currentOnComplete?.({
						success: ok,
						summary: ok ? resultText || "Task completed" : failureSummary,
						sessionId: sessionId ?? undefined,
						usage,
					});

					if (runStillAlive) {
						// 进程继续存活，等待 followup 消息。
						// 不 unlisten，不 settle——resolve followup turn promise 让 sendFollowup 返回。
						this._markAlive();
						this._followupTurnResolve?.();
						this._followupTurnResolve = null;
						this._followupTurnReject = null;
						// 重置本轮状态以准备下一轮
						replayGuard.reset();
						toolErrorGuard.reset();
						sawNonThoughtProgress = false;
						thoughtOnlyStartedAt = null;
						emittedLongThinkingWarning = false;
						toolNamesById.clear();
						return;
					}

					// Run 已终止，正常清理
					this._markDead();
					if (unlisten) unlisten();
					unlisten = null;
					settle?.(ok ? undefined : new Error(failureSummary));
					return;
				}

				if (payload.type === "error") {
					replayGuard.flushPending();
					const err = payload.error || "Unknown error";
					const retryable = (payload as any).retryable === true;

					// 检查是否应该重试
					if (retryable && retryAttempt < maxRetries) {
						retryAttempt++;
						const delayMs = baseDelayMs * Math.pow(2, retryAttempt - 1);

						// 通知用户正在重试
						this._currentOnMessage?.({
							type: "system",
							content: `⚠️ 请求失败 (${err})，正在重试 ${retryAttempt}/${maxRetries}...`,
							status: "running",
						});

						console.log(
							`[ClaudeAgentService] Retrying in ${delayMs}ms (attempt ${retryAttempt}/${maxRetries})`,
						);

						// 延迟后重试
						setTimeout(async () => {
							if (abortController.signal.aborted) {
								settle?.(new Error("Aborted during retry"));
								return;
							}

							try {
								// 清空缓冲区
								bufferedEvents.length = 0;

								// 重新获取 MCP 配置（按任务意图排序 + 可选上限）
								const mcpServers = await getMcpConfigForSdk({
									taskPrompt: prompt,
									maxServers: resolvedMcpServerLimit,
								});

								// 重新启动 SDK
								runId = await invoke<string>("agent_sdk_start", {
									payload: {
										prompt,
										model,
										cwd: workingDirectory,
										resume_session_id: isSdkSessionId(resumeSessionId)
											? resumeSessionId
											: undefined,
										persist_session: persistSession,
										permission_mode: resolvedPermissionModeForRun,
										allowed_tools: resolvedAllowedTools,
										system_prompt: resolvedSystemPrompt,
										skills,
										mcp_servers: mcpServers,
										additional_directories:
											mergedAdditionalDirectories.length > 0
												? mergedAdditionalDirectories
												: undefined,
										plugins:
											mergedPlugins.length > 0 ? mergedPlugins : undefined,
										sandbox: sandbox,
										interactive_approval: interactiveApprovalForRun,
										fork_session: forkSession,
										resume_session_at: resumeSessionAt,
										max_turns: resolvedMaxTurns,
										thinking_level: resolvedThinkingLevel,
										max_budget_usd: resolvedMaxBudgetUsd,
										setting_sources: resolvedSettingSources,
										betas: resolvedBetas,
										context_policy: resolvedContextPolicy,
										subagent_context_mode: resolvedSubagentContextMode,
										context_budget: resolvedContextBudget,
										enable_tool_search: resolvedEnableToolSearch,
									},
								});
								this._activeRunId = runId;

								// 重放缓冲事件
								for (const e of bufferedEvents) {
									handleEvent(e);
								}
							} catch (retryError) {
								const retryErrMsg =
									retryError instanceof Error
										? retryError.message
										: String(retryError);
								this._currentOnMessage?.({
									type: "system",
									content: `Error: ${retryErrMsg}`,
									status: "error",
								});
								this._currentOnComplete?.({
									success: false,
									summary: retryErrMsg,
									sessionId: sessionId ?? undefined,
								});
								settle?.(new Error(retryErrMsg));
							}
						}, delayMs);

						return; // 不立即 settle，等待重试
					}

					// 不可重试或已达到最大重试次数
					const finalError =
						retryAttempt > 0 ? `${err} (已重试 ${retryAttempt} 次)` : err;

					this._currentOnMessage?.({
						type: "system",
						content: toFriendlyAgentRuntimeError(finalError),
						status: "error",
					});
					this._currentOnComplete?.({
						success: false,
						summary: toFriendlyAgentRuntimeError(finalError),
						sessionId: sessionId ?? undefined,
					});
					if (unlisten) unlisten();
					unlisten = null;
					settle?.(new Error(toFriendlyAgentRuntimeError(finalError)));
				}
			};

			unlisten = await listen("agent-sdk-event", (event) => {
				if (debug) {
					console.log("[ClaudeAgentService] Received event:", event);
				}
				handleEvent(event.payload as any);
			});

			// 获取 MCP 配置（来自设置页 DB 配置，按任务意图排序 + 可选上限）
			const mcpServers = await getMcpConfigForSdk({
				taskPrompt: prompt,
				maxServers: resolvedMcpServerLimit,
			});
			console.log("[ClaudeAgentService] MCP servers:", Object.keys(mcpServers));

			runId = await invoke<string>("agent_sdk_start", {
				payload: {
					prompt,
					model,
					cwd: workingDirectory,
					resume_session_id: isSdkSessionId(resumeSessionId)
						? resumeSessionId
						: undefined,
					persist_session: persistSession,
					permission_mode: resolvedPermissionModeForRun,
					allowed_tools: resolvedAllowedTools,
					system_prompt: resolvedSystemPrompt,
					skills,
					mcp_servers: mcpServers, // 传递 MCP 配置给 SDK
					additional_directories:
						mergedAdditionalDirectories.length > 0
							? mergedAdditionalDirectories
							: undefined,
					plugins: mergedPlugins.length > 0 ? mergedPlugins : undefined,
					sandbox: sandbox,
					interactive_approval: interactiveApprovalForRun,
					fork_session: forkSession,
					resume_session_at: resumeSessionAt,
					max_turns: resolvedMaxTurns,
					thinking_level: resolvedThinkingLevel,
					max_budget_usd: resolvedMaxBudgetUsd,
					setting_sources: resolvedSettingSources,
					betas: resolvedBetas,
					context_policy: resolvedContextPolicy,
					subagent_context_mode: resolvedSubagentContextMode,
					context_budget: resolvedContextBudget,
					enable_tool_search: resolvedEnableToolSearch,
				},
			});
			this._activeRunId = runId;

			// Replay anything that arrived before we got the runId back (race on fast failures).
			for (const e of bufferedEvents) {
				handleEvent(e);
			}

			await finished;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			// Notify about the error
			this._currentOnMessage?.({
				type: "system",
				content: `Error: ${errorMessage}`,
				status: "error",
			});

			this._currentOnComplete?.({
				success: false,
				summary: errorMessage,
				sessionId: sessionId ?? undefined,
			});
		} finally {
			abortController.signal.removeEventListener("abort", abortHandler);
			// 如果 run 仍 alive（等待 followup），保持事件监听器和 activeRunId
			if (this._alive) {
				this._persistentUnlisten = unlisten;
				// 保持 _currentOn* — 持久事件处理器需要它们。
				// sendFollowup 会在发送新消息前更新它们。
			} else {
				if (unlisten) unlisten();
				this._activeRunId = null;
				this._currentOnChunk = undefined;
				this._currentOnMessage = undefined;
				this._currentOnComplete = undefined;
			}
		}
	}

	/**
	 * Check if the SDK is properly configured
	 */
	async checkHealth(): Promise<{ ok: boolean; message: string }> {
		try {
			const runId = await invoke<string>("agent_sdk_start", {
				payload: {
					prompt: 'Say "SDK OK" and nothing else.',
					model: settingsStore.getActiveModel() || "gpt-4o",
					permission_mode: "plan",
					allowed_tools: [],
				},
			});
			await invoke("agent_sdk_abort", { runId });
			return {
				ok: true,
				message: "Claude Agent SDK runner started successfully",
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return { ok: false, message: `SDK runner check failed: ${errorMessage}` };
		}
	}
}

// Export a singleton instance for convenience
export const claudeAgent = new ClaudeAgentService();
