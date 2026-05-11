/**
 * settingsUiPreferences — 设置界面持久化偏好（重构后留作兼容）
 *
 * Phase 7.6：废弃 simple/geek 双档体验模式。本文件保留导出
 * 是为了让仍 import 这些 API 的旧代码继续编译；行为统一变为 no-op，
 * 并在模块加载时把历史 localStorage 键一次性清理掉，避免老用户首次
 * 打开新设置面板时残留状态。
 */
import type { SettingsExperienceMode } from "../components/Settings/types";

const EXPERIENCE_MODE_KEY = "settings.ui.experience_mode";
const TECHNICAL_GROUP_EXPANDED_KEY = "settings.ui.technical_group_expanded";

/**
 * 历史默认值改为 `geek`（即"专家"视图、不再做摘要裁剪）。
 * 仍以 `SettingsExperienceMode` 字面量回出，是为了让外部类型不报错。
 */
export const DEFAULT_SETTINGS_EXPERIENCE_MODE: SettingsExperienceMode = "geek";
export const DEFAULT_TECHNICAL_GROUP_EXPANDED = false;

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

// ---------- 一次性清理（Phase 7.6 强制）----------
//
// 在模块第一次被求值时执行；只针对历史 key，不动新前缀 `settings.ui.disclosure.*`。
// 删除失败（隐私模式 / 配额）静默忽略 —— 反正下次也会再尝试。
(function cleanupLegacySettingsUiKeys() {
	if (!isBrowser()) return;
	try {
		localStorage.removeItem(EXPERIENCE_MODE_KEY);
		localStorage.removeItem(TECHNICAL_GROUP_EXPANDED_KEY);
	} catch {
		/* ignore */
	}
})();

/**
 * 始终返回 `geek`，对外保持类型与签名不变。
 * 旧调用点（例如 `SettingsExperienceProvider`）拿到 `geek` 后会得到
 * `showTechnicalSummaries === false`，自然走完整 UI 分支。
 */
export function getSettingsExperienceMode(): SettingsExperienceMode {
	return DEFAULT_SETTINGS_EXPERIENCE_MODE;
}

/** No-op：历史接口保留，但写入会被忽略。 */
export function setSettingsExperienceMode(_mode: SettingsExperienceMode) {
	/* no-op，Phase 7.6 起不再持久化 */
}

export function getTechnicalGroupExpandedPreference() {
	return DEFAULT_TECHNICAL_GROUP_EXPANDED;
}

export function setTechnicalGroupExpandedPreference(_expanded: boolean) {
	/* no-op，Phase 7.6 起不再持久化 */
}
