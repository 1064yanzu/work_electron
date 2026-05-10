/**
 * Claude Code 风格斜杠命令 —— 与 `settingsStore` 的偏好桥接层。
 *
 * 任务：T8.1 的"快照辅助"部分。
 *
 * 本模块只负责：
 * 1. 把散在 `settingsStore.prefs` 下的 `slashCommands.*` 偏好装配成
 *    {@link SlashCommandsSettingsSnapshot}，供 `context.ts` 直接使用；
 * 2. 暴露一组**最小**的订阅 API（`onPrefsChanged`）给 UI 消费；
 * 3. 内部也复用 `settingsStore` 的持久化能力（MVP 走 `localStorage`），
 *    读取异常时返回默认值 + `console.warn`。
 *
 * 之所以放在 `slashCommands/` 而不是 `settingsStore.ts` 内，是为了避免把
 * 斜杠命令专属的 key 常量泄漏到全局 settingsStore；后者只暴露通用的
 * `getPref/setPref/onPrefsChanged` API。
 */

import { settingsStore } from "../settingsStore";
import { themeManager } from "../theme";
import type { SlashCommandsSettingsSnapshot } from "./types";

// ---------------------------------------------------------------------------
// 持久化键（单一事实源）
// ---------------------------------------------------------------------------

export const SLASH_COMMAND_PREF_KEYS = {
	enabled: "slashCommands.enabled",
	visibility: "slashCommands.visibility",
	defaultColorThemeId: "slashCommands.defaultColorThemeId",
	customScanEnabled: "slashCommands.customScanEnabled",
} as const;

/** 订阅回调形状。 */
export type PrefsChangeListener = () => void;

// ---------------------------------------------------------------------------
// 默认值与类型守护
// ---------------------------------------------------------------------------

function defaultColorThemeId(): string {
	try {
		return themeManager.getColorThemeId() ?? "";
	} catch {
		return "";
	}
}

function readVisibility(): Record<string, "show" | "hide"> {
	const raw = settingsStore.getPref<Record<string, unknown>>(
		SLASH_COMMAND_PREF_KEYS.visibility,
		{},
	);
	if (!raw || typeof raw !== "object") return {};
	const out: Record<string, "show" | "hide"> = {};
	for (const [k, v] of Object.entries(raw)) {
		if (v === "show" || v === "hide") {
			out[k] = v;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// 主要 API
// ---------------------------------------------------------------------------

/**
 * 装配当前 `SlashCommandsSettingsSnapshot`。
 *
 * 非法值容错：
 * - `enabled` / `customScanEnabled`：非布尔 → 默认 `true`；
 * - `defaultColorThemeId`：非字符串 → 当前主题 id；
 * - `visibility`：非对象或含非 `"show"/"hide"` 值 → 仅保留合法键。
 */
export function buildSlashCommandsSettingsSnapshot(): SlashCommandsSettingsSnapshot {
	const enabled = settingsStore.getPref<boolean>(
		SLASH_COMMAND_PREF_KEYS.enabled,
		true,
	);
	const customScanEnabled = settingsStore.getPref<boolean>(
		SLASH_COMMAND_PREF_KEYS.customScanEnabled,
		true,
	);
	const colorThemeDefault = defaultColorThemeId();
	const defaultColorThemeIdPref = settingsStore.getPref<string>(
		SLASH_COMMAND_PREF_KEYS.defaultColorThemeId,
		colorThemeDefault,
	);
	return {
		enabled: typeof enabled === "boolean" ? enabled : true,
		customScanEnabled:
			typeof customScanEnabled === "boolean" ? customScanEnabled : true,
		defaultColorThemeId:
			typeof defaultColorThemeIdPref === "string"
				? defaultColorThemeIdPref
				: colorThemeDefault,
		visibility: readVisibility(),
	};
}

/** 订阅任意 `slashCommands.*` 偏好变更。 */
export function onSlashCommandsPrefsChanged(
	listener: PrefsChangeListener,
): () => void {
	return settingsStore.onPrefsChanged(listener);
}
