import { getConfig, setConfig } from "./core";

export type CenterDefaultView = "graph" | "preview";
export type CenterArtifactClickBehavior = "select_only" | "open_preview";
export type CenterInfoDensity = "comfortable" | "compact";

export interface CenterUxPrefs {
	defaultView: CenterDefaultView;
	graphFollow: boolean;
	artifactClickBehavior: CenterArtifactClickBehavior;
	infoDensity: CenterInfoDensity;
	/**
	 * 启动时恢复上次打开的中栏标签页。
	 * 只恢复"标签存在"，不恢复页面内容状态——网页登录态由主进程各站点独立
	 * partition 自行保活；本机 CLI 标签背后是真实 pty，重启后必然已消失，不恢复。
	 */
	restoreTabsOnStartup: boolean;
}

const DEFAULT_CENTER_UX_PREFS: CenterUxPrefs = {
	defaultView: "graph",
	graphFollow: true,
	artifactClickBehavior: "select_only",
	infoDensity: "comfortable",
	restoreTabsOnStartup: true,
};

const CENTER_UX_CONFIG_KEYS = {
	defaultView: "center.ux.defaultView",
	graphFollow: "center.ux.graphFollow",
	artifactClickBehavior: "center.ux.artifactClickBehavior",
	infoDensity: "center.ux.infoDensity",
	restoreTabsOnStartup: "center.ux.restoreTabsOnStartup",
} as const;

let cachedCenterUxPrefs: CenterUxPrefs = { ...DEFAULT_CENTER_UX_PREFS };
let cachedCenterUxPrefsLoaded = false;

function normalizeCenterDefaultView(value: unknown): CenterDefaultView {
	if (value === "graph" || value === "preview") return value;
	// 向后兼容历史配置：code/docs 视图均并入 preview
	if (value === "code" || value === "docs") return "preview";
	return DEFAULT_CENTER_UX_PREFS.defaultView;
}

function normalizeCenterArtifactClickBehavior(
	value: unknown,
): CenterArtifactClickBehavior {
	if (value === "open_preview" || value === "select_only") return value;
	return DEFAULT_CENTER_UX_PREFS.artifactClickBehavior;
}

function normalizeCenterInfoDensity(value: unknown): CenterInfoDensity {
	if (value === "compact" || value === "comfortable") return value;
	return DEFAULT_CENTER_UX_PREFS.infoDensity;
}

export async function getCenterUxPrefs(
	forceRefresh = false,
): Promise<CenterUxPrefs> {
	if (cachedCenterUxPrefsLoaded && !forceRefresh) return cachedCenterUxPrefs;
	try {
		const [
			defaultViewRaw,
			graphFollowRaw,
			clickRaw,
			densityRaw,
			restoreTabsRaw,
		] = await Promise.all([
			getConfig(CENTER_UX_CONFIG_KEYS.defaultView),
			getConfig(CENTER_UX_CONFIG_KEYS.graphFollow),
			getConfig(CENTER_UX_CONFIG_KEYS.artifactClickBehavior),
			getConfig(CENTER_UX_CONFIG_KEYS.infoDensity),
			getConfig(CENTER_UX_CONFIG_KEYS.restoreTabsOnStartup),
		]);
		cachedCenterUxPrefs = {
			defaultView: normalizeCenterDefaultView(defaultViewRaw),
			graphFollow:
				typeof graphFollowRaw === "boolean"
					? graphFollowRaw
					: DEFAULT_CENTER_UX_PREFS.graphFollow,
			artifactClickBehavior: normalizeCenterArtifactClickBehavior(clickRaw),
			infoDensity: normalizeCenterInfoDensity(densityRaw),
			restoreTabsOnStartup:
				typeof restoreTabsRaw === "boolean"
					? restoreTabsRaw
					: DEFAULT_CENTER_UX_PREFS.restoreTabsOnStartup,
		};
	} catch {
		cachedCenterUxPrefs = { ...DEFAULT_CENTER_UX_PREFS };
	}
	cachedCenterUxPrefsLoaded = true;
	return cachedCenterUxPrefs;
}

export async function setCenterUxPrefs(
	updates: Partial<CenterUxPrefs>,
): Promise<CenterUxPrefs> {
	const merged: CenterUxPrefs = {
		defaultView: normalizeCenterDefaultView(
			updates.defaultView ?? cachedCenterUxPrefs.defaultView,
		),
		graphFollow:
			typeof updates.graphFollow === "boolean"
				? updates.graphFollow
				: cachedCenterUxPrefs.graphFollow,
		artifactClickBehavior: normalizeCenterArtifactClickBehavior(
			updates.artifactClickBehavior ??
				cachedCenterUxPrefs.artifactClickBehavior,
		),
		infoDensity: normalizeCenterInfoDensity(
			updates.infoDensity ?? cachedCenterUxPrefs.infoDensity,
		),
		restoreTabsOnStartup:
			typeof updates.restoreTabsOnStartup === "boolean"
				? updates.restoreTabsOnStartup
				: cachedCenterUxPrefs.restoreTabsOnStartup,
	};
	cachedCenterUxPrefs = merged;
	cachedCenterUxPrefsLoaded = true;
	await Promise.all([
		setConfig(CENTER_UX_CONFIG_KEYS.defaultView, merged.defaultView),
		setConfig(CENTER_UX_CONFIG_KEYS.graphFollow, merged.graphFollow),
		setConfig(
			CENTER_UX_CONFIG_KEYS.artifactClickBehavior,
			merged.artifactClickBehavior,
		),
		setConfig(CENTER_UX_CONFIG_KEYS.infoDensity, merged.infoDensity),
		setConfig(
			CENTER_UX_CONFIG_KEYS.restoreTabsOnStartup,
			merged.restoreTabsOnStartup,
		),
	]);
	return merged;
}
