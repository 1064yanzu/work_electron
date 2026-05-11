/**
 * Claude Code 风格斜杠命令 —— 把命令真实派发到 Claude Agent SDK。
 *
 * 核心思想：Claude Agent SDK 本质上是 Claude Code CLI 的可编程包装。CLI 原生
 * 识别 `/init` `/cost` `/help` `/doctor` 等命令，所以把命令字符串当成 prompt
 * 发给 SDK，就能让 CLI 真正执行（而不是本地"假执行"出一个固定 UI 状态）。
 *
 * 本模块抽出 `builtin/session.ts /compact` 已经验证过的成熟模式：
 * 1. `agentExecutor.executeCustomTask(commandLine, ...)` 启动 SDK；
 * 2. `agentStore.onEvent` 监听 `task_completed` / `task_error`；
 * 3. 30~60s 超时兜底，loading toast 自动出/收。
 *
 * 设计约束：
 * - 零业务知识：调用方传入命令行字符串与 cwd / resumeSessionId 即可；
 * - 失败不抛错：所有错误返回 `ExecuteOutcome.kind === "failed"`；
 * - 不耦合 UI：toast 由本模块按需出，不依赖调用方；
 * - 复用现有 toast / SLASH_MESSAGES，不引入新的渲染器。
 */

import { agentExecutor } from "../agent/executor";
import { agentStore } from "../agent/store";
import { SLASH_MESSAGES } from "./messages";
import { showLoading } from "./toast";
import type { ExecuteOutcome } from "./types";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 默认 SDK 调用超时（ms）；与 /compact 历史口径一致。 */
const DEFAULT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// 共用：SDK 会话失效判定
// ---------------------------------------------------------------------------

/**
 * 判断错误字符串是否属于"SDK session 已失效"类型。
 *
 * Claude Code CLI 的会话按 `cwd + uuid` 存文件，渲染端 chatStore 的
 * `sdkSessionId` 可能与 CLI 侧不同步（例如 CLI 清理过会话目录、cwd 变了、用户
 * 手动删除了 `.claude/projects/...`）。此时 resume 会报 "No conversation
 * found" —— 这不是用户的错，要单独识别。
 */
export function isSdkSessionMissingError(message: string): boolean {
	const m = String(message || "");
	return (
		m.includes("No conversation found with session ID") ||
		m.includes("--resume requires a valid session ID")
	);
}

// ---------------------------------------------------------------------------
// 共用：等待 agentStore 的 task 落定
// ---------------------------------------------------------------------------

/** 等待 agentStore 触发 `task_completed` / `task_error` 或超时。 */
export function waitForAgentTaskSettlement(
	options: { timeoutMs?: number } = {},
): Promise<
	| { kind: "completed"; result: string }
	| { kind: "error"; error: string }
	| { kind: "timeout" }
> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return new Promise((resolve) => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		const off = agentStore.onEvent((event) => {
			if (event.type === "task_completed") {
				if (timer) clearTimeout(timer);
				off();
				resolve({ kind: "completed", result: event.result ?? "" });
			} else if (event.type === "task_error") {
				if (timer) clearTimeout(timer);
				off();
				resolve({ kind: "error", error: event.error ?? "未知错误" });
			}
		});
		timer = setTimeout(() => {
			off();
			resolve({ kind: "timeout" });
		}, timeoutMs);
	});
}

// ---------------------------------------------------------------------------
// dispatchToSdk
// ---------------------------------------------------------------------------

export interface DispatchToSdkOptions {
	/** 锁定 SDK 会话的工作目录；不传则用 process.cwd（不推荐）。 */
	workingDirectory?: string;
	/** 续聊使用的 SDK 会话 id。 */
	resumeSessionId?: string;
	/** 超时（ms），默认 60s。 */
	timeoutMs?: number;
	/** loading toast 的中文文案。 */
	loadingMessage?: string;
	/** 成功后的中文文案（不传则使用通用文案）。 */
	successMessage?: string;
	/**
	 * 是否等到 SDK 完成才返回；默认 true。
	 * 若 false，则只触发 executeCustomTask 后立即返回 ok，由调用方自己监听 stream。
	 */
	waitForSettlement?: boolean;
	/**
	 * 当 SDK session 找不到时的提示文案；不传则使用默认文案。
	 * 仅在 waitForSettlement=true 时有效。
	 */
	sessionMissingHint?: string;
}

/**
 * 把一条 `/xxx [args]` 字符串当成用户输入交给 Claude Agent SDK 执行。
 *
 * 返回值：
 * - `{ kind: "ok", toast? }`：SDK 成功完成；toast 用于 executor 统一展示；
 * - `{ kind: "failed", message, retryable?, cause? }`：超时、session 失效或 CLI 报错。
 *
 * 调用方典型用法：
 * ```ts
 * async execute(ctx) {
 *   return dispatchToSdk("/init", {
 *     workingDirectory: ctx.workspacePath ?? undefined,
 *     resumeSessionId: ctx.sdkSessionId ?? undefined,
 *     loadingMessage: "正在让 Claude 分析项目并生成 CLAUDE.md…",
 *     successMessage: "已生成 CLAUDE.md。",
 *   });
 * }
 * ```
 */
export async function dispatchToSdk(
	commandLine: string,
	options: DispatchToSdkOptions = {},
): Promise<ExecuteOutcome> {
	const command = String(commandLine ?? "").trim();
	if (!command) {
		return {
			kind: "failed",
			message: "命令为空，无法发送到 SDK。",
		};
	}

	const {
		workingDirectory,
		resumeSessionId,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		loadingMessage,
		successMessage,
		waitForSettlement = true,
		sessionMissingHint,
	} = options;

	const handle = loadingMessage ? showLoading(loadingMessage) : null;

	const settlePromise = waitForSettlement
		? waitForAgentTaskSettlement({ timeoutMs })
		: null;

	try {
		await agentExecutor.executeCustomTask(
			command,
			undefined,
			{ autoExecute: true },
			{
				resumeSessionId,
				workingDirectory,
			},
		);
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		const failMessage = SLASH_MESSAGES.toast.generic.failed(reason);
		handle?.replaceFailed(failMessage);
		return {
			kind: "failed",
			message: failMessage,
			cause: err,
		};
	}

	if (!settlePromise) {
		// fire-and-forget：UI 自己跟流就行
		handle?.dismiss();
		return { kind: "ok" };
	}

	const settlement = await settlePromise;

	if (settlement.kind === "completed") {
		if (successMessage) {
			handle?.replaceSuccess(successMessage);
		} else {
			handle?.dismiss();
		}
		return { kind: "ok" };
	}

	if (settlement.kind === "timeout") {
		const msg = "命令执行超时，请稍后重试。";
		handle?.replaceFailed(msg);
		return { kind: "failed", message: msg };
	}

	// settlement.kind === "error"
	if (isSdkSessionMissingError(settlement.error)) {
		const hint =
			sessionMissingHint ??
			"Claude Code 无法在当前工作目录下找到该会话记录。这通常是因为当前会话的工作目录与会话最初创建时不同（CLI 按 cwd+sessionId 定位会话文件）。请确认会话工作目录是否正确，或发起一条新消息重建会话。";
		handle?.replaceFailed(hint);
		return { kind: "failed", message: hint };
	}

	const failMessage = SLASH_MESSAGES.toast.generic.failed(settlement.error);
	handle?.replaceFailed(failMessage, { retryable: true });
	return {
		kind: "failed",
		message: failMessage,
		retryable: true,
	};
}
