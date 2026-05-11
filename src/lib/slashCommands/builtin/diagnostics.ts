/**
 * Claude Code 风格斜杠命令 —— 诊断类命令（2026-05 新增）。
 *
 * 这一组命令都是 Tier A：把 `/xxx` 整条字符串发给 Claude Code CLI，让 CLI 自己
 * 真实输出结果（命令列表 / token 用量 / 健康检查）；不在本地造数据。
 *
 * 设计理由：这些信息只有 CLI 自己最权威（它持有真实的 token 用量记账、配置探测
 * 与命令清单），本地复刻一份既容易过时又会和 CLI 失同步。
 *
 * 注意：/help 在分组上放 `inspect` 而非 `session`，因为它本质属于"查看类"命令，
 * 与 /cost /doctor 同一类。priority 设负值让它在 inspect 组里最靠前。
 */

import { dispatchToSdk } from "../dispatchToSdk";
import { SLASH_MESSAGES } from "../messages";
import type {
	CommandContext,
	ExecuteOutcome,
	SlashCommandDefinition,
} from "../types";

// ---------------------------------------------------------------------------
// 共用
// ---------------------------------------------------------------------------

function pickWorkingDirectory(ctx: CommandContext): string | undefined {
	const fromSession = ctx.activeSession?.cwd;
	if (fromSession && fromSession.trim()) return fromSession;
	if (ctx.workspacePath && ctx.workspacePath.trim()) return ctx.workspacePath;
	return undefined;
}

// ---------------------------------------------------------------------------
// /help —— 让 CLI 列出全部命令
// ---------------------------------------------------------------------------

export const helpCommand: SlashCommandDefinition = {
	id: "help",
	name: SLASH_MESSAGES.commands.help.name,
	description: SLASH_MESSAGES.commands.help.description,
	group: "inspect",
	kind: "action",
	priority: -100, // 让它在 inspect 组里最靠前
	availability() {
		return { state: "available" };
	},
	async execute(ctx: CommandContext): Promise<ExecuteOutcome> {
		return dispatchToSdk("/help", {
			workingDirectory: pickWorkingDirectory(ctx),
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 30_000,
			loadingMessage: SLASH_MESSAGES.toast.help.loading,
		});
	},
};

// ---------------------------------------------------------------------------
// /cost —— 让 CLI 输出当前会话的 token 用量与花费
// ---------------------------------------------------------------------------

export const costCommand: SlashCommandDefinition = {
	id: "cost",
	name: SLASH_MESSAGES.commands.cost.name,
	description: SLASH_MESSAGES.commands.cost.description,
	group: "inspect",
	kind: "action",
	availability(ctx: CommandContext) {
		if (!ctx.sdkSessionId) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noSdkSession,
			};
		}
		return { state: "available" };
	},
	async execute(ctx: CommandContext): Promise<ExecuteOutcome> {
		return dispatchToSdk("/cost", {
			workingDirectory: pickWorkingDirectory(ctx),
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 30_000,
			loadingMessage: SLASH_MESSAGES.toast.cost.loading,
		});
	},
};

// ---------------------------------------------------------------------------
// /doctor —— 让 CLI 跑健康检查
// ---------------------------------------------------------------------------

export const doctorCommand: SlashCommandDefinition = {
	id: "doctor",
	name: SLASH_MESSAGES.commands.doctor.name,
	description: SLASH_MESSAGES.commands.doctor.description,
	group: "inspect",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute(ctx: CommandContext): Promise<ExecuteOutcome> {
		return dispatchToSdk("/doctor", {
			workingDirectory: pickWorkingDirectory(ctx),
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 60_000,
			loadingMessage: SLASH_MESSAGES.toast.doctor.loading,
		});
	},
};

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export const DIAGNOSTICS_COMMANDS: readonly SlashCommandDefinition[] = [
	helpCommand,
	costCommand,
	doctorCommand,
];
