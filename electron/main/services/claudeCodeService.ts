/**
 * Claude Code CLI 服务
 *
 * 参照 codexService.ts 的模式，直接 spawn 用户本地安装的 `claude` CLI 二进制文件，
 * 使用 `--print --output-format stream-json` 获得结构化流式输出。
 *
 * 与 agentSdk.ts (SDK API 模式) 不同，本服务让用户真正使用自己安装的 Claude Code CLI，
 * 我们的应用只是提供一个更好的可视化壳。
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { ClaudeCodeApprovalMode } from "../../shared/coding-workspace";
import { detectCliBinary, type DetectOptions } from "./cliBinaryDetector";
import { toUIEvents } from "../ipc/handlers/agentSdk/eventTransformer";
import { isSdkSessionId } from "../ipc/handlers/agentSdk/sessionId";

// ─── CLI 检测 ─────────────────────────────────────────────────────

export async function findClaudeCodeBinary(
	options?: DetectOptions,
): Promise<string | null> {
	const result = await detectCliBinary("claude-code", options);
	return result.path;
}

export async function getClaudeCodeVersion(
	binary?: string | null,
): Promise<string | null> {
	if (!binary) return null;
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFile);
	try {
		const { stdout } = await execFileAsync(binary, ["--version"], {
			timeout: 10000,
			maxBuffer: 1024 * 1024,
		});
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

// ─── 类型 ─────────────────────────────────────────────────────────

export interface ClaudeCodeSessionOptions {
	prompt: string;
	cwd: string;
	model?: string;
	permissionMode?: ClaudeCodeApprovalMode;
	systemPrompt?: string;
	allowedTools?: string[];
	disallowedTools?: string[];
	additionalDirectories?: string[];
	mcpConfig?: string;
	resumeSessionId?: string;
	continueSession?: boolean;
	maxTurns?: number;
	maxBudgetUsd?: number;
	settingSources?: string[];
	betas?: string[];
	agents?: Record<string, unknown>;
	/** 直接跳过所有权限检查（不推荐，仅用于沙箱环境） */
	dangerouslySkipPermissions?: boolean;
	/** 额外的 CLI 参数 */
	extraArgs?: string[];
}

/**
 * 统一的 Claude Code 输出事件。
 * 前端 claudeCodeSessionManager 监听这些事件来更新 UI。
 */
export interface ClaudeCodeOutputEvent {
	/** 事件的顶层类型标识 */
	type:
		| "ui_events"
		| "done"
		| "error"
		| "stderr"
		| "session_init"
		| "permission_request";
	/** 转换后的 UIEvent 数组（当 type=ui_events 时） */
	events?: unknown[];
	/** 会话 ID（当 type=session_init 时） */
	sessionId?: string;
	/** 最终结果对象（当 type=done 时） */
	result?: unknown;
	/** 错误/日志内容 */
	content?: string;
	isError?: boolean;
	/** 用量信息（当 type=done 时） */
	usage?: {
		inputTokens: number;
		outputTokens: number;
		costUsd?: number;
	};
	/** 权限请求相关字段（当 type=permission_request 时） */
	requestId?: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	description?: string;
	timeoutMs?: number;
}

// ─── CLI 参数构建 ──────────────────────────────────────────────────

function mapPermissionMode(
	mode?: ClaudeCodeApprovalMode,
): string | undefined {
	if (!mode) return undefined;
	// Claude Code CLI 接受的 --permission-mode 值
	const modeMap: Record<string, string> = {
		default: "default",
		acceptEdits: "acceptEdits",
		bypassPermissions: "bypassPermissions",
		dontAsk: "dontAsk",
		plan: "plan",
		auto: "auto",
	};
	return modeMap[mode] || mode;
}

function buildClaudeCodeArgs(options: ClaudeCodeSessionOptions): string[] {
	const args: string[] = [
		"--print",
		"--output-format",
		"stream-json",
	];

	// 模型
	if (options.model?.trim()) {
		args.push("--model", options.model.trim());
	}

	// 权限模式
	if (options.dangerouslySkipPermissions) {
		args.push("--dangerously-skip-permissions");
	} else {
		const permMode = mapPermissionMode(options.permissionMode);
		if (permMode) {
			args.push("--permission-mode", permMode);
		}
	}

	// 系统提示词
	if (options.systemPrompt?.trim()) {
		args.push("--system-prompt", options.systemPrompt.trim());
	}

	// 允许的工具
	if (options.allowedTools?.length) {
		args.push("--allowed-tools", ...options.allowedTools);
	}

	// 禁止的工具
	if (options.disallowedTools?.length) {
		args.push("--disallowed-tools", ...options.disallowedTools);
	}

	// 额外目录
	if (options.additionalDirectories?.length) {
		args.push("--add-dir", ...options.additionalDirectories);
	}

	// MCP 配置
	if (options.mcpConfig?.trim()) {
		args.push("--mcp-config", options.mcpConfig.trim());
	}

	// 会话恢复
	if (options.resumeSessionId?.trim()) {
		args.push("--resume", options.resumeSessionId.trim());
	} else if (options.continueSession) {
		args.push("--continue");
	}

	// 预算限制
	if (
		typeof options.maxBudgetUsd === "number" &&
		options.maxBudgetUsd > 0
	) {
		args.push("--max-budget-usd", String(options.maxBudgetUsd));
	}

	// 设置来源
	if (options.settingSources?.length) {
		args.push("--setting-sources", options.settingSources.join(","));
	}

	// Beta 功能
	if (options.betas?.length) {
		args.push("--betas", ...options.betas);
	}

	// 自定义 agents
	if (
		options.agents &&
		typeof options.agents === "object" &&
		Object.keys(options.agents).length > 0
	) {
		args.push("--agents", JSON.stringify(options.agents));
	}

	// 额外参数
	if (options.extraArgs?.length) {
		args.push(...options.extraArgs);
	}

	// 最后放 prompt
	args.push(options.prompt);

	return args;
}

// ─── JSON 行解析 ──────────────────────────────────────────────────

function parseJsonLine(line: string): unknown | null {
	try {
		return JSON.parse(line);
	} catch {
		return null;
	}
}

// ─── 从原始事件中提取用量信息 ────────────────────────────────────

function extractUsage(
	raw: Record<string, unknown>,
): ClaudeCodeOutputEvent["usage"] | undefined {
	// result 事件中可能包含 usage 信息
	const usage = raw.usage as Record<string, unknown> | undefined;
	if (!usage) return undefined;

	const toNum = (v: unknown): number => {
		const n =
			typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
		return Number.isFinite(n) ? n : 0;
	};

	const inputTokens =
		toNum(usage.input_tokens) || toNum(usage.prompt_tokens) || 0;
	const outputTokens =
		toNum(usage.output_tokens) || toNum(usage.completion_tokens) || 0;
	const costUsd =
		toNum(raw.total_cost_usd) ||
		toNum(raw.cost_usd) ||
		toNum(usage.cost_usd) ||
		0;

	if (inputTokens > 0 || outputTokens > 0) {
		return { inputTokens, outputTokens, costUsd: costUsd || undefined };
	}
	return undefined;
}

// ─── 从原始事件中提取 session ID ──────────────────────────────────

function extractSessionId(raw: Record<string, unknown>): string | undefined {
	const sid = raw.session_id;
	if (typeof sid === "string" && isSdkSessionId(sid)) {
		return sid;
	}
	return undefined;
}

// ─── stderr 内部日志过滤 ──────────────────────────────────────────

/**
 * 判断 stderr 中的一行是否属于 CLI 内部日志 / 敏感信息，
 * 返回 true 表示应该被过滤掉，不发送给前端。
 */
function isInternalStderrLine(text: string): boolean {
	const lower = text.toLowerCase();

	// 系统提示词泄露
	if (lower.includes("system prompt")) return true;

	// API Key / 凭证
	if (lower.includes("anthropic_api_key")) return true;
	if (lower.includes("api_key") || lower.includes("apikey")) return true;

	// Token + 认证上下文
	if (lower.includes("token") && (lower.includes("auth") || lower.includes("bearer")))
		return true;

	// CLI 加载信息
	if (text.startsWith("Loading")) return true;

	// 模型信息
	if (text.startsWith("Using model")) return true;

	// 会话 ID 行（Session 后跟一串 ID 格式）
	if (/^Session\s+[a-zA-Z0-9_-]{8,}/.test(text)) return true;

	// DEBUG / TRACE 日志级别
	if (lower.includes("debug") || lower.includes("trace")) return true;

	// OAuth / 凭证信息
	if (lower.includes("oauth") || lower.includes("credential")) return true;

	// 权限配置信息（但保留 "denied" 相关的实际错误）
	if (lower.includes("permission") && !lower.includes("denied")) return true;

	// 日志行 [2024-01-01 ...]
	if (/^\[\d{4}-\d{2}-\d{2}/.test(text)) return true;

	// 终端 UI 绘制字符
	if (/^[╭│╰╮╯─┌┐└┘├┤┬┴┼]/.test(text)) return true;

	return false;
}

// ─── 核心：spawn Claude Code CLI ──────────────────────────────────

export function spawnClaudeCodeSession(
	binary: string,
	options: ClaudeCodeSessionOptions,
	onEvent: (event: ClaudeCodeOutputEvent) => void,
): ChildProcess {
	const args = buildClaudeCodeArgs(options);

	// 诊断日志
	console.log(`[claude-code] spawn binary: ${binary}`);
	console.log(`[claude-code] spawn args: ${JSON.stringify(args).slice(0, 500)}`);
	console.log(`[claude-code] model: ${options.model?.trim() || "(default)"}`);
	console.log(`[claude-code] cwd: ${options.cwd}`);
	console.log(
		`[claude-code] permission_mode: ${options.permissionMode || "(default)"}`,
	);

	const proc = spawn(binary, args, {
		cwd: options.cwd,
		env: {
			...process.env,
			TERM: "dumb",
			NO_COLOR: "1",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdoutBuffer = "";
	let stderrBuffer = "";
	let emittedDone = false;

	// content_block_start 的 index → kind 映射（用于区分 thinking/text）
	const contentBlockKindByIndex = new Map<number, string>();

	const flushStdout = (final = false) => {
		const lines = stdoutBuffer.split(/\r?\n/);
		stdoutBuffer = final ? "" : lines.pop() || "";
		for (const line of final ? lines.filter(Boolean) : lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			const raw = parseJsonLine(trimmed);
			if (!raw || typeof raw !== "object") {
				// 非 JSON 行 — 可能是纯文本输出
				onEvent({
					type: "ui_events",
					events: [{ type: "text_delta", content: trimmed }],
				});
				continue;
			}

			const rawObj = raw as Record<string, unknown>;

			// 提取 session ID
			const sessionId = extractSessionId(rawObj);
			if (sessionId) {
				onEvent({ type: "session_init", sessionId });
			}

			// 将 CLI 的 stream-json 事件转换为 UIEvent
			const uiEvents = toUIEvents(rawObj, { contentBlockKindByIndex });

			if (uiEvents.length > 0) {
				// 检查是否包含 result 事件（表示完成）
				const resultEvent = uiEvents.find(
					(e: any) => e.type === "result",
				);
				if (resultEvent) {
					emittedDone = true;
					const usage = extractUsage(rawObj);
					// 先发 UI 事件
					onEvent({ type: "ui_events", events: uiEvents });
					// 再发 done 事件
					onEvent({
						type: "done",
						result: rawObj,
						usage,
					});
				} else {
					onEvent({ type: "ui_events", events: uiEvents });
				}
			}
		}
	};

	proc.stdout?.on("data", (chunk: Buffer) => {
		stdoutBuffer += chunk.toString("utf-8");
		flushStdout(false);
	});

	proc.stderr?.on("data", (chunk: Buffer) => {
		stderrBuffer += chunk.toString("utf-8");
		const lines = stderrBuffer.split(/\r?\n/);
		stderrBuffer = lines.pop() || "";
		for (const line of lines) {
			const text = line.trim();
			if (!text) continue;
			// 过滤掉 Claude CLI 内部日志和系统信息
			if (isInternalStderrLine(text)) continue;
			onEvent({
				type: "stderr",
				content: text,
				isError: text.includes("ERROR") || text.includes("error"),
			});
		}
	});

	proc.on("close", (code) => {
		flushStdout(true);
		if (stderrBuffer.trim()) {
			onEvent({ type: "stderr", content: stderrBuffer.trim() });
		}
		if (code !== 0) {
			onEvent({
				type: "error",
				content: `Claude Code 进程退出，代码: ${code}`,
				isError: true,
			});
			return;
		}
		if (!emittedDone) {
			onEvent({ type: "done" });
		}
	});

	proc.on("error", (error) => {
		onEvent({ type: "error", content: error.message, isError: true });
	});

	return proc;
}

// ─── SDK 调用类型 ──────────────────────────────────────────────────

export type SdkPermissionCallback = (
	requestId: string,
	toolName: string,
	toolInput: Record<string, unknown>,
	timeoutMs: number,
) => Promise<boolean>;

export interface SdkSessionCallbacks {
	onEvent: (event: ClaudeCodeOutputEvent) => void;
	onPermissionRequest: SdkPermissionCallback;
}

// ─── SDK 模式：使用 @anthropic-ai/claude-agent-sdk ────────────────

/**
 * 使用 @anthropic-ai/claude-agent-sdk query() 启动 Claude Code 会话。
 * 支持交互式权限审批（canUseTool 回调），返回 AbortController 用于中止。
 *
 * @param _binary - 暂未使用（SDK 自动管理可执行文件），保留用于向前兼容
 */
export async function spawnClaudeCodeSessionSdk(
	_binary: string,
	options: ClaudeCodeSessionOptions,
	callbacks: SdkSessionCallbacks,
): Promise<AbortController> {
	const sdk = await import("@anthropic-ai/claude-agent-sdk");
	const abortController = new AbortController();
	const { onEvent, onPermissionRequest } = callbacks;
	const contentBlockKindByIndex = new Map<number, string>();

	console.log(`[claude-code-sdk] Starting SDK session, cwd=${options.cwd}`);
	console.log(
		`[claude-code-sdk] model=${options.model?.trim() || "(default)"}, permissionMode=${options.permissionMode || "(default)"}`,
	);

	(async () => {
		try {
			// 构建 SDK Options
			const queryOptions: Record<string, unknown> = {
				abortController,
				cwd: options.cwd,
				canUseTool: async (
					toolName: string,
					toolInput: unknown,
					_extra: unknown,
				) => {
					if (abortController.signal.aborted) {
						return { behavior: "deny", message: "aborted" };
					}
					const requestId = `perm_${Date.now()}_${Math.random()
						.toString(36)
						.slice(2, 8)}`;
					const normalizedInput: Record<string, unknown> =
						toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)
							? (toolInput as Record<string, unknown>)
							: {};
					try {
						const allow = await onPermissionRequest(
							requestId,
							toolName,
							normalizedInput,
							60000,
						);
						return allow
							? { behavior: "allow" }
							: { behavior: "deny", message: "用户拒绝" };
					} catch {
						return { behavior: "deny", message: "Permission check failed" };
					}
				},
			};

			if (options.model?.trim()) queryOptions.model = options.model.trim();
			if (options.permissionMode) queryOptions.permissionMode = options.permissionMode;
			if (options.systemPrompt?.trim()) queryOptions.systemPrompt = options.systemPrompt.trim();
			if (options.resumeSessionId?.trim()) queryOptions.resume = options.resumeSessionId.trim();
			else if (options.continueSession) queryOptions.continue = true;
			if (options.settingSources?.length) queryOptions.settingSources = options.settingSources;
			if (options.allowedTools?.length) queryOptions.allowedTools = options.allowedTools;
			if (options.disallowedTools?.length) queryOptions.disallowedTools = options.disallowedTools;
			if (options.maxTurns != null) queryOptions.maxTurns = options.maxTurns;
			if (options.maxBudgetUsd != null && options.maxBudgetUsd > 0)
				queryOptions.maxBudgetUsd = options.maxBudgetUsd;
			if (options.betas?.length) queryOptions.betas = options.betas;
			if (options.additionalDirectories?.length)
				queryOptions.additionalDirectories = options.additionalDirectories;
			if (options.dangerouslySkipPermissions)
				queryOptions.allowDangerouslySkipPermissions = true;

			const q = sdk.query({
				prompt: options.prompt,
				options: queryOptions as Parameters<typeof sdk.query>[0]["options"],
			});

			let emittedDone = false;
			let accumulatedInputTokens = 0;
			let accumulatedOutputTokens = 0;

			for await (const msg of q) {
				if (abortController.signal.aborted) break;

				const msgAny = msg as Record<string, unknown>;

				// system init → session_init
				if (
					msgAny?.type === "system" &&
					typeof msgAny.session_id === "string"
				) {
					onEvent({
						type: "session_init",
						sessionId: msgAny.session_id as string,
					});
				}

				// assistant / stream_event → ui_events
				if (
					msgAny?.type === "assistant" ||
					msgAny?.type === "stream_event" ||
					msgAny?.type === "user"
				) {
					const uiEvents = toUIEvents(msgAny as Record<string, unknown>, {
						contentBlockKindByIndex,
					});
					if (uiEvents.length > 0) {
						onEvent({ type: "ui_events", events: uiEvents });
					}
				}

				// 累积 token 用量（stream_event 内）
				if (msgAny?.type === "stream_event") {
					const ev = msgAny.event as Record<string, unknown> | undefined;
					if (ev?.type === "message_start") {
						const usage = (ev.message as Record<string, unknown>)?.usage as
							| Record<string, unknown>
							| undefined;
						if (typeof usage?.input_tokens === "number") {
							accumulatedInputTokens += usage.input_tokens as number;
						}
					}
					if (ev?.type === "message_delta") {
						const usage = ev?.usage as Record<string, unknown> | undefined;
						if (typeof usage?.output_tokens === "number") {
							accumulatedOutputTokens += usage.output_tokens as number;
						}
					}
				}

				// result → done
				if (msgAny?.type === "result") {
					emittedDone = true;
					const resultObj = msgAny as Record<string, unknown>;
					const costUsd =
						typeof resultObj.total_cost_usd === "number"
							? (resultObj.total_cost_usd as number)
							: undefined;
					onEvent({
						type: "done",
						result: resultObj,
						usage:
							accumulatedInputTokens > 0 || accumulatedOutputTokens > 0
								? {
										inputTokens: accumulatedInputTokens,
										outputTokens: accumulatedOutputTokens,
										costUsd,
									}
								: undefined,
					});
				}
			}

			if (!emittedDone) {
				onEvent({ type: "done" });
			}
		} catch (err: unknown) {
			if (
				abortController.signal.aborted ||
				(err instanceof Error && err.name === "AbortError")
			) {
				onEvent({ type: "done" });
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			console.error("[claude-code-sdk] Session error:", message);
			onEvent({ type: "error", content: message, isError: true });
		}
	})();

	return abortController;
}
