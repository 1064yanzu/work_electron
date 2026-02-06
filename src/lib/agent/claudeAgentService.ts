/**
 * Claude Agent SDK Service
 *
 * Wrapper around @anthropic-ai/claude-agent-sdk to integrate with our existing UI.
 * This provides a clean abstraction that converts SDK messages to our internal format.
 *
 * Uses local Anthropic proxy server (port 8765) to support ALL models through SDK.
 */

import type {
	SDKMessage,
	SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { invoke } from "../tauriCompat";
import { listen } from "../tauriEventCompat";
import { getConfig } from "../config";
import { isSdkSessionId } from "./context/sessionId";
import { getMcpConfigForSdk } from "./mcpConfig";
import { askUserQuestionStore } from "./askUserQuestionStore";
import {
	type ExternalPermissionDecision,
	permissionStore,
} from "./permissionStore";
import { AgentStreamState, type UIEvent } from "./streamState";

/**
 * Message types that our UI understands
 */
export interface AgentMessage {
	type:
		| "assistant"
		| "tool_call"
		| "tool_result"
		| "thought_delta"
		| "tool_progress"
		| "tool_input_update"
		| "system"
		| "result";
	content: string;
	taskId?: string;
	toolCallId?: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	toolOutput?: unknown;
	progress?: number;
	message?: string;
	thoughtMeta?: {
		title?: string;
		source?: string;
		phase?: string;
		durationMs?: number;
	};
	status?: "running" | "completed" | "error";
}

/**
 * Execution options for the Claude Agent
 */
export interface ClaudeAgentExecutionOptions {
	/** The prompt/query to execute */
	prompt: string;

	/** Optional system prompt override */
	systemPrompt?: string;

	/** Working directory for file operations */
	workingDirectory?: string;

	/** Resume an existing Claude Agent SDK session (enables SDK context management across turns) */
	resumeSessionId?: string;

	/** Whether the SDK should persist sessions to disk (defaults to true in SDK) */
	persistSession?: boolean;

	/** Model to use for this execution (e.g., 'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5') */
	model?: string;

	/** Enabled skills list (used for skill routing and subagents) */
	skills?: string[];

	/** Additional absolute directories for SDK file access */
	additionalDirectories?: string[];

	/** Local plugins loaded into SDK runtime */
	plugins?: Array<{ type: "local"; path: string }>;

	/** Optional sandbox settings pass-through */
	sandbox?: Record<string, unknown>;

	/** Whether to enable canUseTool interactive approval broker */
	interactiveApproval?: boolean;

	/** SDK permission mode */
	permissionMode?: string;

	/** Callback for streaming text chunks */
	onChunk?: (text: string) => void;

	/** Callback for each message from the SDK */
	onMessage?: (message: AgentMessage) => void;

	/** Callback when execution completes */
	onComplete?: (result: {
		success: boolean;
		summary?: string;
		sessionId?: string;
		usage?: {
			promptTokens: number;
			completionTokens: number;
			totalTokens: number;
		};
	}) => void;

	/** Callback for todo list updates */
	onTodoUpdate?: (
		todos: Array<{
			content: string;
			status: "pending" | "in_progress" | "completed";
			activeForm?: string;
		}>,
	) => void;

	/** Abort controller for cancellation */
	abortController?: AbortController;
}

/**
 * Default tools that are always available
 */
const DEFAULT_TOOLS = [
	"Read",
	"Edit",
	"Write",
	"Glob",
	"Grep",
	"Bash",
	"Skill", // Enable skills support
	"Task", // Enable subagents
	"WebSearch",
	"WebFetch",
	"AskUserQuestion",
] as const;

// Import settings store to respect user's model selection
import { settingsStore } from "../settingsStore";

/**
 * Claude Agent Service
 *
 * Wraps the Claude Agent SDK and provides a simplified interface
 * for executing agent queries with streaming support.
 */
export class ClaudeAgentService {
	private activeRunId: string | null = null;

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
			systemPrompt,
			workingDirectory,
			resumeSessionId,
			persistSession,
			model: userModel,
			skills,
			additionalDirectories,
			plugins,
			sandbox,
			interactiveApproval,
			permissionMode: explicitPermissionMode,
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
		const [
			configInteractiveApproval,
			configPermissionMode,
			configAdditionalDirs,
			configPluginPaths,
			configCompatMode,
		] = await Promise.all([
			getConfig("agent.sdk.interactive_approval_enabled").catch(() => null),
			getConfig("agent.sdk.default_permission_mode").catch(() => null),
			getConfig("agent.sdk.additional_directories").catch(() => null),
			getConfig("agent.sdk.plugin_paths").catch(() => null),
			getConfig("agent.sdk.compat_mode").catch(() => null),
		]);
		const parseStringArray = (value: unknown): string[] =>
			Array.isArray(value)
				? value.filter((v): v is string => typeof v === "string")
				: [];
		const sdkAdditionalDirectories = parseStringArray(configAdditionalDirs);
		const sdkPluginsFromConfig = parseStringArray(configPluginPaths).map(
			(pluginPath) => ({
				type: "local" as const,
				path: pluginPath,
			}),
		);
		const resolvedInteractiveApproval =
			typeof interactiveApproval === "boolean"
				? interactiveApproval
				: typeof configInteractiveApproval === "boolean"
					? configInteractiveApproval
					: true;
		const resolvedPermissionMode =
			typeof explicitPermissionMode === "string" &&
			explicitPermissionMode.trim().length > 0
				? explicitPermissionMode.trim()
				: typeof configPermissionMode === "string" &&
						configPermissionMode.trim().length > 0
					? configPermissionMode.trim()
					: "default";
		const compatModeEnabled = configCompatMode === true;
		const permissionModeForRun = compatModeEnabled
			? "acceptEdits"
			: resolvedPermissionMode;
		const interactiveApprovalForRun = compatModeEnabled
			? false
			: resolvedInteractiveApproval;
		const mergedAdditionalDirectories = Array.from(
			new Set(
				[
					...sdkAdditionalDirectories,
					...(Array.isArray(additionalDirectories)
						? additionalDirectories
						: []),
				].filter((item) => typeof item === "string" && item.trim().length > 0),
			),
		);
		const mergedPlugins = Array.from(
			new Map(
				[...sdkPluginsFromConfig, ...(Array.isArray(plugins) ? plugins : [])]
					.filter(
						(item): item is { type: "local"; path: string } =>
							!!item &&
							item.type === "local" &&
							typeof item.path === "string" &&
							item.path.trim().length > 0,
					)
					.map((item) => [item.path, item] as const),
			).values(),
		);

		let unlisten: (() => void) | null = null;
		let runId: string | null = null;
		let sessionId: string | null = null;
		let settle: ((err?: Error) => void) | null = null;
		let toolUseErrorCount = 0;
		let lastToolUseError: string | null = null;
		let lastToolUseId: string | null = null;
		const debug = import.meta.env?.VITE_AGENT_DEBUG === "1";
		const toolNamesById = new Map<string, string>();
		const streamState = new AgentStreamState();
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

		const finished = new Promise<void>((resolve, reject) => {
			settle = (err?: Error) => (err ? reject(err) : resolve());
		});

		const abortHandler = () => {
			if (runId) void invoke("agent_sdk_abort", { runId });
			settle?.(new Error("Aborted"));
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
					// 核心目标：捕获子代理的内部活动（通过 parent_tool_use_id 关联到 Task 工具）
					// 并将其转化为 tool_progress 事件，从而在前端 SubagentCard 中展示
					const msgAny = payload.message as any;

					// 检查是否有关联的父级工具调用（即子代理所属的 Task）
					const parentToolUseId = msgAny?.parent_tool_use_id;
					if (parentToolUseId) {
						// 尝试查找 SDK 的 tool_use_id 对应的内部工具 ID
						// 注意：这里需要一个反向映射，或者我们在 tool_call_start 时记录了 sdk_tool_use_id
						// 目前 toolNamesById 存储的是 sdk_tool_use_id -> toolName
						// 我们直接使用 sdk_tool_use_id (即 parentToolUseId) 作为关联键，因为 AgentStore 里已规范化 ID
						// 但前端 AgentStore 使用的 ID 是 `sdk-tool-${sdkId}`

						const internalToolCallId = `sdk-tool-${parentToolUseId}`;

						// 提取子代理的活动内容
						if (
							msgAny.type === "assistant" &&
							Array.isArray(msgAny.message?.content)
						) {
							for (const block of msgAny.message.content) {
								if (
									block.type === "text" &&
									typeof block.text === "string" &&
									block.text.trim()
								) {
									// 子代理的思考/回复
									onMessage?.({
										type: "tool_progress",
										content: block.text,
										taskId: "", // context 中没有 taskId，前端需根据 toolCallId 匹配
										toolCallId: internalToolCallId,
										progress: -1, // -1 表示非进度条更新，而是活动流更新
										message: JSON.stringify({
											type: "thinking", // 复用 AgentThinkingStep 类型
											phase: "executing",
											content: block.text,
											timestamp: Date.now(),
										}),
									});
								} else if (block.type === "tool_use") {
									// 子代理调用工具
									const toolName = block.name;
									const inputDetails = Object.keys(block.input || {}).join(
										", ",
									);
									const toolUseMessage = `调用工具: ${toolName}(${inputDetails})`;
									onMessage?.({
										type: "tool_progress",
										content: toolUseMessage,
										taskId: "",
										toolCallId: internalToolCallId,
										progress: -1,
										message: JSON.stringify({
											type: "executing", // 借用 phase 类型，或者在前端解析时处理
											phase: "executing",
											content: toolUseMessage,
											timestamp: Date.now(),
										}),
									});
								}
							}
						}
					}

					// Claude Code can get stuck retrying invalid tool inputs (e.g. Skill tool).
					// Detect repeated tool validation errors and abort with the last error string.
					if ((payload.message as any)?.type === "user") {
						const msgAny = payload.message as any;
						const blocks = Array.isArray(msgAny?.message?.content)
							? msgAny.message.content
							: [];
						const toolErrorBlocks = blocks.filter(
							(b: any) =>
								b?.type === "tool_result" &&
								typeof b?.content === "string" &&
								String(b.content).includes("<tool_use_error>"),
						);
						const toolErrors = toolErrorBlocks.map((b: any) =>
							typeof b?.content === "string" ? b.content : "",
						);

						if (toolErrors.length > 0) {
							toolUseErrorCount += toolErrors.length;
							lastToolUseError =
								toolErrors[toolErrors.length - 1] ?? lastToolUseError;
							lastToolUseId =
								String(
									toolErrorBlocks[toolErrorBlocks.length - 1]?.tool_use_id ||
										"",
								) || lastToolUseId;

							if (debug) {
								console.error(
									`[ClaudeAgentService] Tool use error (${toolUseErrorCount}/10):`,
									{
										errorCount: toolErrors.length,
										totalErrors: toolUseErrorCount,
										lastError: lastToolUseError,
										lastToolUseId,
									},
								);
							}

							// Increased threshold from 3 to 10
							if (toolUseErrorCount >= 10) {
								const errRaw =
									lastToolUseError ||
									"Tool call failed repeatedly (10+ errors)";
								const errText = String(errRaw)
									.replace(/<tool_use_error>/g, "")
									.replace(/<\/tool_use_error>/g, "")
									.trim();
								const toolName = lastToolUseId
									? toolNamesById.get(lastToolUseId)
									: undefined;
								const guidance = [
									"工具调用多次失败，为避免无限重试，我已停止本次任务。",
									toolName || lastToolUseId
										? `最后一次失败的工具：${toolName || "unknown"}（tool_use_id=${lastToolUseId || "unknown"}）`
										: null,
									errText ? `错误信息：${errText}` : null,
									"建议：请先用 Glob 列出沙盒目录下的实际文件名，再用 Read 读取；或确认引用的文件路径是否在当前沙盒目录内。",
									"你也可以把上面失败的工具卡片展开，查看当时发送的参数。",
								]
									.filter(Boolean)
									.join("\n");
								console.error(
									"[ClaudeAgentService] Aborting due to repeated tool errors:",
									{
										totalErrors: toolUseErrorCount,
										lastError: errText,
										lastToolUseId,
									},
								);
								void invoke("agent_sdk_abort", { runId });
								onMessage?.({
									type: "system",
									content: guidance,
									status: "error",
								});
								onComplete?.({
									success: false,
									summary: guidance,
									sessionId: sessionId ?? undefined,
									usage: undefined,
								});
								if (unlisten) unlisten();
								unlisten = null;
								settle?.(new Error(guidance));
								return;
							}
						}
					}
					return;
				}

				if (payload.type === "stderr" && payload.error) {
					onMessage?.({
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
					void (async () => {
						const request = (payload as any).request as {
							requestId?: unknown;
							toolName?: unknown;
							toolInput?: unknown;
							toolUseId?: unknown;
							runId?: unknown;
							expiresAt?: unknown;
						};
						const requestId =
							typeof request.requestId === "string" ? request.requestId : "";
						const toolName =
							typeof request.toolName === "string" ? request.toolName : "";
						const toolInput =
							request.toolInput && typeof request.toolInput === "object"
								? (request.toolInput as Record<string, unknown>)
								: {};
						if (!requestId || !toolName || !runId) return;

						try {
							if (toolName === "AskUserQuestion") {
								const normalizeQuestions = (
									value: unknown,
								): Array<{
									question: string;
									header: string;
									options: Array<{ label: string; description: string }>;
									multiSelect?: boolean;
									id?: string;
								}> => {
									if (!Array.isArray(value)) return [];
									const normalized: Array<{
										question: string;
										header: string;
										options: Array<{ label: string; description: string }>;
										multiSelect?: boolean;
										id?: string;
									}> = [];
									for (const item of value) {
										if (!item || typeof item !== "object") continue;
										const typed = item as Record<string, unknown>;
										const question =
											typeof typed.question === "string" ? typed.question : "";
										const header =
											typeof typed.header === "string" ? typed.header : "";
										if (!question || !header) continue;
										const options: Array<{
											label: string;
											description: string;
										}> = [];
										if (Array.isArray(typed.options)) {
											for (const opt of typed.options) {
												if (!opt || typeof opt !== "object") continue;
												const option = opt as Record<string, unknown>;
												const label =
													typeof option.label === "string" ? option.label : "";
												const description =
													typeof option.description === "string"
														? option.description
														: "";
												if (!label) continue;
												options.push({ label, description });
											}
										}
										if (options.length < 2) continue;
										normalized.push({
											question,
											header,
											options,
											multiSelect: typed.multiSelect === true || undefined,
											id: typeof typed.id === "string" ? typed.id : undefined,
										});
									}
									return normalized;
								};

								const expiresAt =
									typeof request.expiresAt === "number"
										? request.expiresAt
										: Date.now() + 55_000;
								const questions = normalizeQuestions(toolInput.questions);
								if (questions.length === 0) {
									await invoke("agent_sdk_resolve_interaction", {
										runId,
										requestId,
										decision: {
											behavior: "deny",
											message: "Invalid AskUserQuestion payload",
										},
									});
									return;
								}

								const decision = await askUserQuestionStore.request({
									requestId,
									runId,
									questions,
									expiresAt,
								});
								await invoke("agent_sdk_resolve_interaction", {
									runId,
									requestId,
									decision,
								});
								return;
							}

							const decision: ExternalPermissionDecision =
								await permissionStore.requestExternalPermission({
									requestId,
									toolCallId:
										typeof request.toolUseId === "string"
											? request.toolUseId
											: requestId,
									toolName,
									toolInput,
								});
							await invoke("agent_sdk_resolve_interaction", {
								runId,
								requestId,
								decision,
							});
						} catch (interactionError) {
							const message =
								interactionError instanceof Error
									? interactionError.message
									: String(interactionError);
							await invoke("agent_sdk_resolve_interaction", {
								runId,
								requestId,
								decision: {
									behavior: "deny",
									message,
								},
							});
						}
					})();
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
						if (event.type === "session_start") {
							onMessage?.({
								type: "system",
								content: `会话开始（source=${String(event.source || "unknown")}）`,
								status: "running",
							});
							continue;
						}
						if (event.type === "session_end") {
							onMessage?.({
								type: "system",
								content: `会话结束（reason=${String(event.reason || "unknown")}）`,
								status: "running",
							});
							continue;
						}
						if (event.type === "subagent_start") {
							onMessage?.({
								type: "system",
								content: `子代理启动：${String(event.agentType || event.agentId || "unknown")}`,
								status: "running",
							});
							continue;
						}
						if (event.type === "subagent_stop") {
							onMessage?.({
								type: "system",
								content: `子代理结束：${String(event.agentType || event.agentId || "unknown")}`,
								status: "running",
							});
							continue;
						}
						if (event.type === "system_notice") {
							onMessage?.({
								type: "system",
								content: event.content,
								status: event.level === "error" ? "error" : "running",
							});
							continue;
						}
						if (event.type === "task_notification") {
							const summary =
								typeof event.summary === "string" && event.summary.trim()
									? event.summary
									: typeof event.message === "string" && event.message.trim()
										? event.message
										: "任务通知";
							onMessage?.({
								type: "system",
								content: summary,
								status:
									event.status === "failed" || event.status === "stopped"
										? "error"
										: "running",
							});
							continue;
						}
						if (event.type === "tool_use_summary") {
							onMessage?.({
								type: "system",
								content: event.summary || "",
								status: "running",
							});
							continue;
						}
						if (event.type === "files_persisted") {
							const fileCount = Array.isArray(event.files)
								? event.files.length
								: 0;
							const failedCount = Array.isArray(event.failed)
								? event.failed.length
								: 0;
							onMessage?.({
								type: "system",
								content: `文件持久化完成：成功 ${fileCount}，失败 ${failedCount}`,
								status: failedCount > 0 ? "error" : "running",
							});
							continue;
						}
						if (event.type === "auth_status") {
							const base = event.isAuthenticating
								? "认证中…"
								: event.error
									? "认证失败"
									: "认证状态更新";
							onMessage?.({
								type: "system",
								content: event.error ? `${base}: ${event.error}` : base,
								status: event.error ? "error" : "running",
							});
							continue;
						}
						if (event.type === "text_delta") {
							// 只处理增量文本，忽略完整 text 事件避免重复
							onChunk?.(event.content);
						} else if (event.type === "thought_delta") {
							onMessage?.({
								type: "thought_delta",
								content: event.content,
								thoughtMeta: {
									title: event.title,
									source: event.source,
								},
								status: "running",
							});
						} else if (event.type === "tool_call_start") {
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
							// 构建工具调用描述，包含工具名称和参数
							const inputStr =
								event.input && Object.keys(event.input).length > 0
									? JSON.stringify(event.input, null, 2)
									: "";
							const description = inputStr
								? `${event.name}(${Object.keys(event.input).join(", ")})`
								: event.name;

							onMessage?.({
								type: "tool_call",
								toolCallId: event.id,
								content: description,
								toolName: event.name,
								toolInput: event.input,
								status: "running",
							});
						} else if (event.type === "tool_call_end") {
							// TodoWrite 的结果对 UI 没有必要展示为 tool_result（任务列表已经更新）
							if (toolNamesById.get(event.id) === "TodoWrite") {
								toolNamesById.delete(event.id);
								continue;
							}
							toolNamesById.delete(event.id);
							onMessage?.({
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
							// 不再作为可见消息显示 result 事件，避免任务完成后出现重复文本
							// result 事件仅用于标记任务完成，其内容已通过 text_delta 显示过
							// onMessage?.({
							// 	type: "result",
							// 	content: event.result || "",
							// 	status: event.isError ? "error" : "completed",
							// });
						} else if (event.type === "tool_input_complete") {
							// 工具输入流式传输完成，发送更新消息以更新工具调用的 input 字段
							onMessage?.({
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
					const usageAny = resultAny?.usage;
					const toFiniteNumber = (v: unknown): number | null => {
						const n =
							typeof v === "number"
								? v
								: typeof v === "string"
									? Number(v)
									: NaN;
						return Number.isFinite(n) ? n : null;
					};
					const promptTokens =
						toFiniteNumber(usageAny?.prompt_tokens) ??
						toFiniteNumber(usageAny?.input_tokens) ??
						toFiniteNumber(usageAny?.inputTokens) ??
						null;
					const completionTokens =
						toFiniteNumber(usageAny?.completion_tokens) ??
						toFiniteNumber(usageAny?.output_tokens) ??
						toFiniteNumber(usageAny?.outputTokens) ??
						null;
					const usage =
						promptTokens !== null && completionTokens !== null
							? {
									promptTokens,
									completionTokens,
									totalTokens: promptTokens + completionTokens,
								}
							: undefined;
					onComplete?.({
						success: ok,
						summary: ok ? resultText || "Task completed" : failureSummary,
						sessionId: sessionId ?? undefined,
						usage,
					});
					if (unlisten) unlisten();
					unlisten = null;
					settle?.(ok ? undefined : new Error(failureSummary));
					return;
				}

				if (payload.type === "error") {
					const err = payload.error || "Unknown error";
					const retryable = (payload as any).retryable === true;

					// 检查是否应该重试
					if (retryable && retryAttempt < maxRetries) {
						retryAttempt++;
						const delayMs = baseDelayMs * Math.pow(2, retryAttempt - 1);

						// 通知用户正在重试
						onMessage?.({
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

								// 重新获取 MCP 配置
								const mcpServers = await getMcpConfigForSdk();

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
										permission_mode: permissionModeForRun,
										allowed_tools: [...DEFAULT_TOOLS],
										system_prompt: systemPrompt,
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
									},
								});
								this.activeRunId = runId;

								// 重放缓冲事件
								for (const e of bufferedEvents) {
									handleEvent(e);
								}
							} catch (retryError) {
								const retryErrMsg =
									retryError instanceof Error
										? retryError.message
										: String(retryError);
								onMessage?.({
									type: "system",
									content: `Error: ${retryErrMsg}`,
									status: "error",
								});
								onComplete?.({
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

					onMessage?.({
						type: "system",
						content: `Error: ${finalError}`,
						status: "error",
					});
					onComplete?.({
						success: false,
						summary: finalError,
						sessionId: sessionId ?? undefined,
					});
					if (unlisten) unlisten();
					unlisten = null;
					settle?.(new Error(finalError));
				}
			};

			unlisten = await listen("agent-sdk-event", (event) => {
				console.log("[ClaudeAgentService] Received event:", event);
				handleEvent(event.payload as any);
			});

			// 获取 MCP 配置（来自设置页 DB 配置）
			const mcpServers = await getMcpConfigForSdk();
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
					permission_mode: permissionModeForRun,
					allowed_tools: [...DEFAULT_TOOLS],
					system_prompt: systemPrompt,
					skills,
					mcp_servers: mcpServers, // 传递 MCP 配置给 SDK
					additional_directories:
						mergedAdditionalDirectories.length > 0
							? mergedAdditionalDirectories
							: undefined,
					plugins: mergedPlugins.length > 0 ? mergedPlugins : undefined,
					sandbox: sandbox,
					interactive_approval: interactiveApprovalForRun,
				},
			});
			this.activeRunId = runId;

			// Replay anything that arrived before we got the runId back (race on fast failures).
			for (const e of bufferedEvents) {
				handleEvent(e);
			}

			await finished;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			// Notify about the error
			onMessage?.({
				type: "system",
				content: `Error: ${errorMessage}`,
				status: "error",
			});

			onComplete?.({
				success: false,
				summary: errorMessage,
				sessionId: sessionId ?? undefined,
			});
		} finally {
			abortController.signal.removeEventListener("abort", abortHandler);
			if (unlisten) unlisten();
			this.activeRunId = null;
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
