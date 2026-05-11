/**
 * panelLoaders.tsx — 基于 `settingsCatalog` 的面板查找器
 *
 * Phase 1 起，所有面板注册与 loader 都集中到 `SETTINGS_SUBTABS`；
 * 本文件只负责把 `SettingsTabId` 映射为 `React.lazy` 组件与预加载入口。
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
	SETTINGS_SUBTABS,
	SUBTAB_ID_SET,
	type SettingsTabId,
} from "./settingsCatalog";

export type { SettingsTabId } from "./settingsCatalog";

/** lazy 组件缓存：同一个 tabId 多次查询返回同一个 LazyComponent */
const lazyCache = new Map<SettingsTabId, LazyExoticComponent<ComponentType>>();

function getLoader(
	tabId: SettingsTabId,
): (() => Promise<{ default: ComponentType }>) | null {
	const subtab = SETTINGS_SUBTABS.find((s) => s.id === tabId);
	return subtab ? subtab.load : null;
}

/** 获取指定 tabId 对应的 Lazy 面板组件；未知 id 降级抛 Suspense 错误 */
export function getSettingsPanelComponent(
	tabId: SettingsTabId,
): LazyExoticComponent<ComponentType> {
	const cached = lazyCache.get(tabId);
	if (cached) return cached;

	const loader = getLoader(tabId);
	const lazyComp = lazy(
		loader ??
			(() =>
				Promise.reject(
					new Error(
						`[settings] no panel loader registered for tab id: ${tabId}`,
					),
				)),
	);
	lazyCache.set(tabId, lazyComp);
	return lazyComp;
}

/** 预加载指定 tabId 的面板模块；未知 id 静默忽略 */
export function preloadSettingsPanel(tabId: SettingsTabId): void {
	if (!SUBTAB_ID_SET.has(tabId)) return;
	const loader = getLoader(tabId);
	if (loader) void loader();
}
