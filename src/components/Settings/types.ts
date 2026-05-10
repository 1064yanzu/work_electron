/**
 * Settings 模块公共类型
 *
 * `SettingsTabId` 的事实源自 Phase 1 起迁移到 `./settingsCatalog`，
 * 本文件通过 re-export 让所有老 import 路径继续可用。
 */
export type { SettingsTabId } from "./settingsCatalog";

// Experience Mode / Sidebar 分组 —— 保留以免下游 import 报错，Phase 7 会整体废弃
export type SettingsExperienceMode = "simple" | "geek";
export type SettingsNavGroup = "common" | "technical";
