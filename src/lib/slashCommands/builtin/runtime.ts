/**
 * Claude Code 风格斜杠命令 —— 运行时组内置命令（Phase 5）。
 *
 * 覆盖任务：T5.1–T5.5。
 *
 * 依赖事实源：
 * - `planModeStore.setPlanModeEnabled` —— /mode 与 /plan
 * - `agentExecutor.setRuntimePermissionMode` / `permissionStore.updatePolicy` —— /approvals
 * - `themeManager.setColorTheme` + `settingsStore.setPref("slashCommands.defaultColorThemeId", id)` —— /theme
 * - `ctx.invokeSelectModel` —— /model（由 ChatInput 通过 SlashCommandContext 注入）
 */

import { setPlanModeEnabled } from "../../agent/planModeStore";
import { agentExecutor } from "../../agent/executor";
import { permissionStore } from "../../agent/permissionStore";
import type { PermissionMode, ToolPermissionPolicy } from "../../agent/types";
import { dispatchToSdk } from "../dispatchToSdk";
import { settingsStore } from "../../settingsStore";
import { SLASH_COMMAND_PREF_KEYS } from "../settingsSnapshot";
import { themeManager } from "../../theme";
import { SLASH_MESSAGES } from "../messages";
import { notify } from "../toast";
import type {
	CommandContext,
	SlashCommandDefinition,
	SlashCommandSubOption,
} from "../types";

// ---------------------------------------------------------------------------
// /model（submenu）
// ---------------------------------------------------------------------------

export const modelCommand: SlashCommandDefinition = {
	id: "model",
	name: SLASH_MESSAGES.commands.model.name,
	description: SLASH_MESSAGES.commands.model.description,
	group: "runtime",
	kind: "submenu",
	availability(ctx: CommandContext) {
		if (ctx.availableModels.length === 0) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noAvailableModels,
			};
		}
		return { state: "available" };
	},
	getSubmenu(ctx: CommandContext) {
		return ctx.availableModels.map((m) => ({
			id: m.id,
			// Model 类型只含 id/provider；name 以 id 展示，provider 作为说明
			label: m.id,
			description: m.provider ?? "",
		}));
	},
	async execute(ctx: CommandContext, option?: SlashCommandSubOption) {
		if (!option) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
			};
		}
		ctx.invokeSelectModel(option.id);
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /mode（submenu：plan / code）
// ---------------------------------------------------------------------------

const MODE_OPTIONS: readonly SlashCommandSubOption[] = [
	{ id: "plan", label: "规划模式", description: "先出结构化计划，再执行。" },
	{ id: "code", label: "编码模式", description: "直接编码、立即落盘。" },
];

export const modeCommand: SlashCommandDefinition = {
	id: "mode",
	name: SLASH_MESSAGES.commands.mode.name,
	description: SLASH_MESSAGES.commands.mode.description,
	group: "runtime",
	kind: "submenu",
	availability() {
		return { state: "available" };
	},
	getSubmenu() {
		return [...MODE_OPTIONS];
	},
	async execute(_ctx: CommandContext, option?: SlashCommandSubOption) {
		if (!option) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
			};
		}
		if (option.id === "plan") {
			setPlanModeEnabled(true);
			return { kind: "ok" as const };
		}
		if (option.id === "code") {
			setPlanModeEnabled(false);
			return { kind: "ok" as const };
		}
		return {
			kind: "failed" as const,
			message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
		};
	},
};

// ---------------------------------------------------------------------------
// /plan（等价 /mode plan）
// ---------------------------------------------------------------------------

export const planCommand: SlashCommandDefinition = {
	id: "plan",
	name: SLASH_MESSAGES.commands.plan.name,
	description: SLASH_MESSAGES.commands.plan.description,
	group: "runtime",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute() {
		setPlanModeEnabled(true);
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /approvals（submenu）
// ---------------------------------------------------------------------------

/**
 * SDK 的审批模式 id 与本项目 `permissionStore.policy.defaultMode` 枚举对齐映射：
 *
 * - `default`            → `ask`
 * - `acceptEdits`        → `auto_approve`
 * - `bypassPermissions`  → `auto_approve`
 * - `dontAsk`            → `auto_approve`
 * - `plan`               → `ask`（plan 语义由 planMode 承担，审批仍走 ask）
 *
 * 这样保证 Settings 中读到的 `policy.defaultMode` 永远是 `PermissionMode`
 * 合法枚举。
 */
const APPROVAL_MODE_TO_PERMISSION: Record<string, PermissionMode> = {
	default: "ask",
	acceptEdits: "auto_approve",
	bypassPermissions: "auto_approve",
	dontAsk: "auto_approve",
	plan: "ask",
};

const APPROVAL_SUB_OPTIONS: readonly SlashCommandSubOption[] = [
	{
		id: "default",
		label: SLASH_MESSAGES.commands.approvals.subOptions.default,
	},
	{
		id: "acceptEdits",
		label: SLASH_MESSAGES.commands.approvals.subOptions.acceptEdits,
	},
	{
		id: "bypassPermissions",
		label: SLASH_MESSAGES.commands.approvals.subOptions.bypassPermissions,
	},
	{
		id: "dontAsk",
		label: SLASH_MESSAGES.commands.approvals.subOptions.dontAsk,
	},
	{ id: "plan", label: SLASH_MESSAGES.commands.approvals.subOptions.plan },
];

function persistPermissionFallback(sdkModeId: string): boolean {
	const mapped = APPROVAL_MODE_TO_PERMISSION[sdkModeId];
	if (!mapped) return false;
	try {
		const updates: Partial<ToolPermissionPolicy> = { defaultMode: mapped };
		permissionStore.updatePolicy(updates);
		return true;
	} catch (err) {
		console.warn("[slashCommands] permissionStore.updatePolicy 失败。", err);
		return false;
	}
}

export const approvalsCommand: SlashCommandDefinition = {
	id: "approvals",
	name: SLASH_MESSAGES.commands.approvals.name,
	description: SLASH_MESSAGES.commands.approvals.description,
	group: "runtime",
	kind: "submenu",
	availability() {
		return { state: "available" };
	},
	getSubmenu() {
		return [...APPROVAL_SUB_OPTIONS];
	},
	async execute(_ctx: CommandContext, option?: SlashCommandSubOption) {
		if (!option) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
			};
		}

		// 优先：把模式推送到运行时 SDK；无存活 run 时返回 false，此时回退到 policy 写入
		let runtimeApplied = false;
		try {
			runtimeApplied = await agentExecutor.setRuntimePermissionMode(option.id);
		} catch (err) {
			console.warn(
				"[slashCommands] agentExecutor.setRuntimePermissionMode 抛错。",
				err,
			);
			runtimeApplied = false;
		}
		if (!runtimeApplied) {
			const ok = persistPermissionFallback(option.id);
			if (!ok) {
				return {
					kind: "failed" as const,
					message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
				};
			}
		}

		notify.success(SLASH_MESSAGES.toast.approvals.switched(option.label));
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /theme（submenu）
// ---------------------------------------------------------------------------

export const themeCommand: SlashCommandDefinition = {
	id: "theme",
	name: SLASH_MESSAGES.commands.theme.name,
	description: SLASH_MESSAGES.commands.theme.description,
	group: "runtime",
	kind: "submenu",
	availability() {
		return { state: "available" };
	},
	getSubmenu() {
		try {
			return themeManager.getAllThemes().map((t) => ({
				id: t.id,
				label: t.name,
				description: "",
			}));
		} catch (err) {
			console.warn("[slashCommands] themeManager.getAllThemes 失败。", err);
			return [];
		}
	},
	async execute(_ctx: CommandContext, option?: SlashCommandSubOption) {
		if (!option) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
			};
		}
		try {
			themeManager.setColorTheme(option.id);
		} catch (err) {
			console.warn("[slashCommands] themeManager.setColorTheme 失败。", err);
			return {
				kind: "failed" as const,
				message: `切换主题失败：${err instanceof Error ? err.message : String(err)}`,
				cause: err,
			};
		}
		try {
			await settingsStore.setPref(
				SLASH_COMMAND_PREF_KEYS.defaultColorThemeId,
				option.id,
			);
		} catch (err) {
			console.warn("[slashCommands] 持久化 defaultColorThemeId 失败。", err);
		}
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /output-style（submenu）—— 切换 Claude 输出风格，交给 SDK 真实生效
// ---------------------------------------------------------------------------

const OUTPUT_STYLE_OPTIONS: readonly SlashCommandSubOption[] = [
	{
		id: "default",
		label: SLASH_MESSAGES.commands.outputStyle.subOptions.default,
		description: "标准回复风格。",
	},
	{
		id: "explanatory",
		label: SLASH_MESSAGES.commands.outputStyle.subOptions.explanatory,
		description: "在回复中加入教学式讲解。",
	},
	{
		id: "learning",
		label: SLASH_MESSAGES.commands.outputStyle.subOptions.learning,
		description: "以对话式互动促进学习。",
	},
];

export const outputStyleCommand: SlashCommandDefinition = {
	id: "output-style",
	name: SLASH_MESSAGES.commands.outputStyle.name,
	description: SLASH_MESSAGES.commands.outputStyle.description,
	group: "runtime",
	kind: "submenu",
	availability() {
		return { state: "available" };
	},
	getSubmenu() {
		return [...OUTPUT_STYLE_OPTIONS];
	},
	async execute(ctx: CommandContext, option?: SlashCommandSubOption) {
		if (!option) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
			};
		}
		// 与 Claude Code CLI 一致：`/output-style <id>`
		const outcome = await dispatchToSdk(`/output-style ${option.id}`, {
			workingDirectory:
				(ctx.activeSession?.cwd && ctx.activeSession.cwd.trim()) ||
				ctx.workspacePath ||
				undefined,
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 30_000,
			loadingMessage: SLASH_MESSAGES.toast.outputStyle.switched(option.label),
		});
		if (outcome.kind === "ok") {
			notify.success(SLASH_MESSAGES.toast.outputStyle.switched(option.label));
		}
		return outcome;
	},
};

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export const RUNTIME_COMMANDS: readonly SlashCommandDefinition[] = [
	modelCommand,
	modeCommand,
	planCommand,
	approvalsCommand,
	themeCommand,
	outputStyleCommand,
];
