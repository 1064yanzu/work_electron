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
import { isUuid } from "../uuid";
import { getMcpConfigForSdk } from "./mcpConfig";
import { AgentStreamState, type UIEvent } from "./streamState";

/**
 * Message types that our UI understands
 */
export interface AgentMessage {
	type: "assistant" | "tool_call" | "tool_result" | "system" | "result";
	content: string;
	toolCallId?: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	toolOutput?: unknown;
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

	/** Enabled skills list (used for skill routing and subagents) */
	skills?: string[];

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
	"TodoWrite",
	"WebSearch",
	"WebFetch",
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
			skills,
			onChunk,
			onMessage,
			onComplete,
			onTodoUpdate,
			abortController = new AbortController(),
		} = options;

		const model = settingsStore.getActiveModel() || "gpt-4o";
		console.log("[ClaudeAgentService] Active model for SDK:", model);

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
					// 我们主要依赖 'transformed' 事件来驱动 UI 更新 (onChunk, onMessage for tools)
					// 为避免 tool_call/tool_result 被重复上报导致 UI 卡片重复渲染，这里不再从 sdk_message 分发到 onMessage/onChunk。
					// sdk_message 仅用于错误检测与调试；真正驱动 UI 的事件来自 'transformed'。

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

				// 处理转换后的 UI 事件
				if (payload.type === "transformed" && (payload as any).events) {
					const events = (payload as any).events as UIEvent[];
					streamState.processEvents(events);

					// 处理各种事件类型
					for (const event of events) {
						if (event.type === "session_init") {
							if (isUuid(event.sessionId)) {
								sessionId = event.sessionId;
							}
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
						if (event.type === "text_delta") {
							// 只处理增量文本，忽略完整 text 事件避免重复
							onChunk?.(event.content);
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
							onMessage?.({
								type: "result",
								content: event.result || "",
								status: event.isError ? "error" : "completed",
							});
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
						isUuid(resultAny.session_id)
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
						const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
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
					onMessage?.({
						type: "system",
						content: `Error: ${err}`,
						status: "error",
					});
					onComplete?.({
						success: false,
						summary: err,
						sessionId: sessionId ?? undefined,
					});
					if (unlisten) unlisten();
					unlisten = null;
					settle?.(new Error(err));
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
					resume_session_id: isUuid(resumeSessionId) ? resumeSessionId : undefined,
					persist_session: persistSession,
					permission_mode: "acceptEdits",
					allowed_tools: [...DEFAULT_TOOLS],
					system_prompt: systemPrompt,
					skills,
					mcp_servers: mcpServers, // 传递 MCP 配置给 SDK
				},
			});

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
