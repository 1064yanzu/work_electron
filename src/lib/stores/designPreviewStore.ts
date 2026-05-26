/**
 * Design 预览界面的本地 UI 状态。
 *
 * 不持久化(session 切换即重置)。
 * 管理:
 *   - tabs 系统(设计文件 sticky + 已打开文件)
 *   - 预览/源代码切换
 *   - 视口 + 缩放
 *   - 四个 overlay(tweaks / comment / inspect / edit)的开关
 *   - 演示模式
 *   - refreshKey(用于强制 iframe 重新加载)
 *
 * 配合 DesignArtifactView 的 useEffect([session.id]) 触发 reset。
 */

import type { DesignViewport } from "../../components/design/preview/constants";
import { DESIGN_FILES_TAB } from "../../components/design/preview/constants";
import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";

export type ViewerMode = "preview" | "source";

export type DesignOverlayKey = "tweaks" | "comment" | "inspect" | "edit";

export interface DesignOverlayState {
	tweaks: boolean;
	comment: boolean;
	inspect: boolean;
	edit: boolean;
}

export interface InspectedElement {
	tagName: string;
	id: string;
	classes: string[];
	attrs: Record<string, string>;
	styles: Array<{ property: string; value: string }>;
	rect: { width: number; height: number; top: number; left: number };
}

export interface DesignPreviewState {
	activeTab: string; // DESIGN_FILES_TAB | relative path
	openTabs: string[]; // 已打开文件相对路径
	viewerMode: ViewerMode;
	viewport: DesignViewport;
	zoom: number; // 25..400
	theme: "light" | "dark";
	overlays: DesignOverlayState;
	presentationMode: boolean;
	presentationRightSidebarSnapshot: boolean | null;
	refreshKey: number;
	inspected: InspectedElement | null;
	comments: Array<{
		id: string;
		selector: string;
		note: string;
		createdAt: number;
	}>;
}

function makeInitialState(): DesignPreviewState {
	return {
		activeTab: DESIGN_FILES_TAB,
		openTabs: ["index.html"],
		viewerMode: "preview",
		viewport: "desktop",
		zoom: 100,
		theme: "light",
		overlays: {
			tweaks: false,
			comment: false,
			inspect: false,
			edit: false,
		},
		presentationMode: false,
		presentationRightSidebarSnapshot: null,
		refreshKey: 0,
		inspected: null,
		comments: [],
	};
}

const store = createStore<DesignPreviewState>(makeInitialState());

function reset(initial?: Partial<DesignPreviewState>) {
	store.setState(() => ({ ...makeInitialState(), ...(initial ?? {}) }));
}

function setActiveTab(tab: string) {
	store.setState((s) => ({ ...s, activeTab: tab }));
}

function openTab(relative: string) {
	store.setState((s) => ({
		...s,
		openTabs: s.openTabs.includes(relative)
			? s.openTabs
			: [...s.openTabs, relative],
		activeTab: relative,
	}));
}

function closeTab(relative: string) {
	store.setState((s) => {
		const next = s.openTabs.filter((p) => p !== relative);
		let nextActive = s.activeTab;
		if (s.activeTab === relative) {
			nextActive = next[next.length - 1] ?? DESIGN_FILES_TAB;
		}
		return { ...s, openTabs: next, activeTab: nextActive };
	});
}

function setViewerMode(mode: ViewerMode) {
	store.setState((s) => ({ ...s, viewerMode: mode }));
}

function setViewport(viewport: DesignViewport) {
	store.setState((s) => ({ ...s, viewport }));
}

function setZoom(zoom: number) {
	const clamped = Math.max(25, Math.min(400, Math.round(zoom)));
	store.setState((s) => ({ ...s, zoom: clamped }));
}

function setTheme(theme: "light" | "dark") {
	store.setState((s) => ({ ...s, theme }));
}

function toggleOverlay(key: DesignOverlayKey) {
	store.setState((s) => ({
		...s,
		overlays: { ...s.overlays, [key]: !s.overlays[key] },
	}));
}

function setOverlay(key: DesignOverlayKey, on: boolean) {
	store.setState((s) => ({
		...s,
		overlays: { ...s.overlays, [key]: on },
	}));
}

function closeAllOverlays() {
	store.setState((s) => ({
		...s,
		overlays: { tweaks: false, comment: false, inspect: false, edit: false },
	}));
}

function bumpRefreshKey() {
	store.setState((s) => ({ ...s, refreshKey: s.refreshKey + 1 }));
}

function enterPresentation(rightSidebarVisible: boolean) {
	store.setState((s) => ({
		...s,
		presentationMode: true,
		presentationRightSidebarSnapshot: rightSidebarVisible,
	}));
}

function exitPresentation(): boolean | null {
	const snapshot = store.getState().presentationRightSidebarSnapshot;
	store.setState((s) => ({
		...s,
		presentationMode: false,
		presentationRightSidebarSnapshot: null,
	}));
	return snapshot;
}

function setInspected(el: InspectedElement | null) {
	store.setState((s) => ({ ...s, inspected: el }));
}

function addComment(c: { selector: string; note: string }) {
	store.setState((s) => ({
		...s,
		comments: [
			...s.comments,
			{
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				selector: c.selector,
				note: c.note,
				createdAt: Date.now(),
			},
		],
	}));
}

function removeComment(id: string) {
	store.setState((s) => ({
		...s,
		comments: s.comments.filter((c) => c.id !== id),
	}));
}

export const designPreviewStore = {
	...store,
	reset,
	setActiveTab,
	openTab,
	closeTab,
	setViewerMode,
	setViewport,
	setZoom,
	setTheme,
	toggleOverlay,
	setOverlay,
	closeAllOverlays,
	bumpRefreshKey,
	enterPresentation,
	exitPresentation,
	setInspected,
	addComment,
	removeComment,
};

export const useDesignPreviewStore = createUseStore(store);
export const useDesignPreviewStoreSelector = createUseStoreSelector(store);
