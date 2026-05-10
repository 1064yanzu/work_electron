/**
 * Claude Code 风格斜杠命令 —— 工作区组内置命令（Phase 6）。
 *
 * 覆盖任务：T6.1–T6.3。
 */

import type { IPCSchema } from "../../../../electron/shared/ipc-schema";
import { EVENTS, events } from "../../events";
import { safeInvoke } from "../../tauriBridge";
import { SLASH_MESSAGES } from "../messages";
import { showLoading } from "../toast";
import type {
	CommandContext,
	ExecuteOutcome,
	SlashCommandDefinition,
} from "../types";

// ---------------------------------------------------------------------------
// /review
// ---------------------------------------------------------------------------

/** 构建中文代码审查 prompt（六维度）。 */
function buildReviewPrompt(diff: string, stat: string): string {
	const { reviewPrompt } = SLASH_MESSAGES;
	const dimensions = reviewPrompt.dimensions
		.map((d, i) => `${i + 1}. ${d}`)
		.join("\n");
	return [
		reviewPrompt.header,
		"",
		"## 变更摘要 (git diff --stat)",
		"```",
		stat.trim() || "(空)",
		"```",
		"",
		"## 变更内容 (git diff)",
		"```diff",
		diff.trim() || "(空)",
		"```",
		"",
		"## 审查维度",
		dimensions,
		"",
		reviewPrompt.footer,
	].join("\n");
}

export const reviewCommand: SlashCommandDefinition = {
	id: "review",
	name: SLASH_MESSAGES.commands.review.name,
	description: SLASH_MESSAGES.commands.review.description,
	group: "workspace",
	kind: "action",
	availability(ctx: CommandContext) {
		if (!ctx.workspacePath) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}
		return { state: "available" };
	},
	async execute(ctx: CommandContext): Promise<ExecuteOutcome> {
		const workspace = ctx.workspacePath;
		const lockedSessionId = ctx.activeSession?.id ?? null;
		if (!workspace) {
			return {
				kind: "failed",
				message: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}
		const handle = showLoading(SLASH_MESSAGES.toast.review.loading);
		try {
			const result = await safeInvoke<
				IPCSchema["slash_commands_git_diff"]["output"]
			>("slash_commands_git_diff", {
				workspace_dir: workspace,
				max_bytes: 2 * 1024 * 1024,
			});
			if (!result.has_changes) {
				handle.dismiss();
				return {
					kind: "ok",
					toast: {
						type: "info",
						message: SLASH_MESSAGES.toast.review.noChanges,
					},
				};
			}
			const message = buildReviewPrompt(result.diff, result.stat);
			// 触发时会话守恒：如果用户在 git diff 等待期间切了会话，强制切回
			// 触发时会话，再提交审查消息，避免把 review 发到错的会话。
			if (lockedSessionId) {
				try {
					const { chatStore } = await import("../../chat/store");
					if (chatStore.getState().activeSessionId !== lockedSessionId) {
						chatStore.setActiveSession(lockedSessionId);
					}
				} catch (err) {
					console.warn("[slashCommands] /review 对齐触发时会话失败。", err);
				}
			}
			events.emit(EVENTS.SLASH_SUBMIT_MESSAGE, {
				sessionId: lockedSessionId,
				message,
				auto: true,
			});
			handle.replaceSuccess(SLASH_MESSAGES.toast.review.success);
			return { kind: "ok" };
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			handle.replaceFailed(SLASH_MESSAGES.toast.review.failed(reason), {
				retryable: true,
			});
			return {
				kind: "failed",
				message: SLASH_MESSAGES.toast.review.failed(reason),
				retryable: true,
				cause: err,
			};
		}
	},
};

// ---------------------------------------------------------------------------
// /init
// ---------------------------------------------------------------------------

/**
 * 弹窗确认（浏览器 `window.confirm`）。
 *
 * 不引入额外 UI 依赖，保持"最小侵入"；后续若需要换成 ConfirmDialog 组件，
 * 只需替换本函数即可。
 */
async function confirmOverwrite(): Promise<boolean> {
	if (typeof window === "undefined" || typeof window.confirm !== "function") {
		// 无窗口环境：默认视为"不覆盖"，避免误覆盖
		return false;
	}
	return Promise.resolve(
		window.confirm(SLASH_MESSAGES.toast.init.existsPrompt),
	);
}

export const initCommand: SlashCommandDefinition = {
	id: "init",
	name: SLASH_MESSAGES.commands.init.name,
	description: SLASH_MESSAGES.commands.init.description,
	group: "workspace",
	kind: "action",
	availability(ctx: CommandContext) {
		if (!ctx.workspacePath) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}
		return { state: "available" };
	},
	async execute(ctx: CommandContext): Promise<ExecuteOutcome> {
		const workspace = ctx.workspacePath;
		if (!workspace) {
			return {
				kind: "failed",
				message: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}
		const handle = showLoading(SLASH_MESSAGES.toast.init.loading);
		try {
			let result = await safeInvoke<
				IPCSchema["slash_commands_write_init"]["output"]
			>("slash_commands_write_init", {
				workspace_dir: workspace,
				overwrite: false,
			});
			if (result.error === "exists") {
				handle.dismiss();
				const proceed = await confirmOverwrite();
				if (!proceed) {
					return { kind: "ok" };
				}
				const retryHandle = showLoading(SLASH_MESSAGES.toast.init.loading);
				try {
					result = await safeInvoke<
						IPCSchema["slash_commands_write_init"]["output"]
					>("slash_commands_write_init", {
						workspace_dir: workspace,
						overwrite: true,
					});
					retryHandle.replaceSuccess(
						SLASH_MESSAGES.toast.init.overwrittenSuccess,
					);
					return { kind: "ok" };
				} catch (err2) {
					const reason = err2 instanceof Error ? err2.message : String(err2);
					retryHandle.replaceFailed(
						SLASH_MESSAGES.toast.init.failed(reason),
						{ retryable: true },
					);
					return {
						kind: "failed",
						message: SLASH_MESSAGES.toast.init.failed(reason),
						retryable: true,
						cause: err2,
					};
				}
			}
			handle.replaceSuccess(SLASH_MESSAGES.toast.init.success);
			return { kind: "ok" };
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			handle.replaceFailed(SLASH_MESSAGES.toast.init.failed(reason), {
				retryable: true,
			});
			return {
				kind: "failed",
				message: SLASH_MESSAGES.toast.init.failed(reason),
				retryable: true,
				cause: err,
			};
		}
	},
};

// ---------------------------------------------------------------------------
// /settings
// ---------------------------------------------------------------------------

export const settingsCommand: SlashCommandDefinition = {
	id: "settings",
	name: SLASH_MESSAGES.commands.settings.name,
	description: SLASH_MESSAGES.commands.settings.description,
	group: "workspace",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute() {
		events.emit(EVENTS.OPEN_SETTINGS, { tab: "agent" });
		// /settings 本身不产出 toast（面板打开自带可见变化）
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export const WORKSPACE_COMMANDS: readonly SlashCommandDefinition[] = [
	reviewCommand,
	initCommand,
	settingsCommand,
];
