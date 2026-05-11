/**
 * Claude Code 风格斜杠命令 —— 公共入口与内置命令注册器。
 *
 * 负责：
 * 1. 导出核心 API（Registry / Executor / Context / React 桥接 / 类型）；
 * 2. 提供 `registerBuiltinSlashCommands()` 一次性注入全部内置命令；
 * 3. 防重复注入（以 `doctor` 命令的 id 是否存在为幂等信号 —— 2026-05 新增的最后一条诊断命令）。
 */

import { commandRegistry } from "./registry";
import { DIAGNOSTICS_COMMANDS } from "./builtin/diagnostics";
import { SESSION_COMMANDS } from "./builtin/session";
import { INSPECT_COMMANDS } from "./builtin/inspect";
import { RUNTIME_COMMANDS } from "./builtin/runtime";
import { WORKSPACE_COMMANDS } from "./builtin/workspace";

// ---------------------------------------------------------------------------
// Re-exports（核心 API）
// ---------------------------------------------------------------------------

export { commandRegistry, type IndexedCommand } from "./registry";
export {
	getRecentCommandIds,
	executeSlashCommand,
	useExecuteSlashCommand,
} from "./executor";
export { buildCommandContext } from "./context";
export {
	SlashCommandContext,
	SlashCommandProvider,
	useSlashCommandContext,
	type SlashCommandBridge,
} from "./reactContext";
export { matchFilter, type MatchedCommand } from "./filter";
export { SLASH_MESSAGES } from "./messages";
export {
	SLASH_COMMAND_PREF_KEYS,
	buildSlashCommandsSettingsSnapshot,
	onSlashCommandsPrefsChanged,
	type PrefsChangeListener,
} from "./settingsSnapshot";
export {
	markFork,
	takeFork,
	peekFork,
	clearFork,
} from "./forkIntentStore";
export type {
	CommandAvailability,
	CommandContext,
	CommandGroupId,
	CommandKind,
	ExecuteOutcome,
	ResumableSessionBrief,
	SlashCommandDefinition,
	SlashCommandSubOption,
	SlashCommandsSettingsSnapshot,
} from "./types";
export { SlashCommandConflictError } from "./types";
export {
	getRightPanelTab,
	setRightPanelTab,
	rightPanelTabStore,
	useRightPanelTab,
	useRightPanelTabSelector,
	type RightPanelTab,
	type RightPanelTabState,
} from "../stores/rightPanelTabStore";

// ---------------------------------------------------------------------------
// 一次性注入全部内置命令
// ---------------------------------------------------------------------------

/**
 * 注入全部内置命令到单例 `commandRegistry`；
 * **幂等**：若 `doctor` 已在注册表中则视为已注入，直接返回（doctor 是 2026-05
 * 追加的最后一条命令，能可靠区分新旧注册状态）。
 *
 * 不在此处抛错：所有错误写入 `console.warn`，避免启动期因注册表异常拖垮整个应用。
 */
export function registerBuiltinSlashCommands(): void {
	if (commandRegistry.byId("doctor") !== null) {
		// 已注入，直接返回
		return;
	}
	try {
		commandRegistry.registerAll([
			...SESSION_COMMANDS,
			...RUNTIME_COMMANDS,
			...INSPECT_COMMANDS,
			...WORKSPACE_COMMANDS,
			...DIAGNOSTICS_COMMANDS,
		]);
	} catch (err) {
		console.warn(
			"[slashCommands] registerBuiltinSlashCommands 注入失败。",
			err,
		);
	}
}
