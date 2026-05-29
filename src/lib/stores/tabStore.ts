// 标签页状态管理 - 多标签系统（支持文档和资料阅读）

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";
import type { TabItem, TabState } from "./types";

const initialTabState: TabState = {
	tabs: [],
	activeTabId: null,
	sourceReadCache: {},
};

const store = createStore<TabState>(initialTabState);

// === 操作方法 ===

// 在中间栏打开资料阅读
function openSourceInMainView(
	sourceId: string,
	title: string,
	note?: { content: string; content_html?: string },
): { activeMainView: "editor" } {
	const tabId = `source-${sourceId}`;

	store.setState((state) => {
		// 检查是否已打开
		const existingTab = state.tabs.find((t) => t.id === tabId);
		if (existingTab) {
			// 已打开，直接激活
			return state.activeTabId === tabId
				? state
				: { ...state, activeTabId: tabId };
		}

		// 新建标签页
		const newTab: TabItem = {
			id: tabId,
			type: "source",
			title,
			sourceId,
		};

		return {
			...state,
			tabs: [...state.tabs, newTab],
			activeTabId: tabId,
			sourceReadCache: {
				...state.sourceReadCache,
				[sourceId]: { sourceId, title, note },
			},
		};
	});

	// 返回需要设置的布局状态，由调用方（workspaceStore）应用
	return { activeMainView: "editor" };
}

// 关闭标签页
function closeTab(tabId: string) {
	store.setState((state) => {
		if (!state.tabs.some((t) => t.id === tabId)) return state;
		const newTabs = state.tabs.filter((t) => t.id !== tabId);

		// 如果关闭的是当前激活标签，切换到最后一个
		let newActiveTabId = state.activeTabId;
		if (state.activeTabId === tabId) {
			newActiveTabId =
				newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
		}

		// 如果是资料标签，清理缓存
		const closedTab = state.tabs.find((t) => t.id === tabId);
		let newSourceReadCache = state.sourceReadCache;
		if (closedTab?.type === "source" && closedTab.sourceId) {
			const { [closedTab.sourceId]: removed, ...rest } = state.sourceReadCache;
			newSourceReadCache = rest;
		}

		return {
			...state,
			tabs: newTabs,
			activeTabId: newActiveTabId,
			sourceReadCache: newSourceReadCache,
		};
	});
}

// 切换激活标签页
function setActiveTab(tabId: string) {
	store.setState((state) =>
		state.activeTabId === tabId ? state : { ...state, activeTabId: tabId },
	);
}

// 获取当前激活的标签页
function getActiveTab(): TabItem | null {
	const { tabs, activeTabId } = store.getState();
	return tabs.find((t) => t.id === activeTabId) || null;
}

// 在中间栏打开 Diff 视图
function openDiffInMainView(
	diffId: string,
	title: string,
): { activeMainView: "editor" } {
	const tabId = `diff-${diffId}`;

	store.setState((state) => {
		// 检查是否已打开
		const existingTab = state.tabs.find((t) => t.id === tabId);
		if (existingTab) {
			return state.activeTabId === tabId
				? state
				: { ...state, activeTabId: tabId };
		}

		// 新建 diff 标签页
		const newTab: TabItem = {
			id: tabId,
			type: "diff",
			title,
			diffId,
		};

		return {
			...state,
			tabs: [...state.tabs, newTab],
			activeTabId: tabId,
		};
	});

	return { activeMainView: "editor" };
}

/**
 * 项目切换时重置标签页状态（由 workspaceStore.setCurrentProject 调用）
 */
function resetOnProjectChange() {
	store.setState(() => ({
		tabs: [],
		activeTabId: null,
		sourceReadCache: {},
	}));
}

// === 导出 ===

export const tabStore = {
	...store,
	openSourceInMainView,
	openDiffInMainView,
	closeTab,
	setActiveTab,
	getActiveTab,
	resetOnProjectChange,
};

export const useTabStore = createUseStore(store);
export const useTabStoreSelector = createUseStoreSelector(store);
