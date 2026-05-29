// 布局状态管理 - 视图模式、侧边栏可见性等

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";
import type { LayoutState } from "./types";

const CARDS_ACTIVE_TAB_STORAGE_KEY = "layout.cardsActiveTab";
const LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY = "layout.leftSidebarCollapsed";

function readPersistedCardsActiveTab(): LayoutState["cardsActiveTab"] {
	if (typeof window === "undefined") return "shared";
	try {
		const raw = window.localStorage.getItem(CARDS_ACTIVE_TAB_STORAGE_KEY);
		if (raw === "knowledge" || raw === "shared") return raw;
	} catch {
		// localStorage 不可用时静默
	}
	return "shared";
}

function readPersistedLeftSidebarCollapsed(): boolean {
	if (typeof window === "undefined") return false;
	try {
		const raw = window.localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY);
		return raw === "1";
	} catch {
		return false;
	}
}

const initialLayoutState: LayoutState = {
	activeMainView: "editor",
	leftSidebarView: "sources",
	rightSidebarVisible: true,
	leftSidebarCollapsed: readPersistedLeftSidebarCollapsed(),
	cardsActiveTab: readPersistedCardsActiveTab(),
};

const store = createStore<LayoutState>(initialLayoutState);

// === 操作方法 ===

function setMainView(view: LayoutState["activeMainView"]) {
	store.setState((state) =>
		state.activeMainView === view ? state : { ...state, activeMainView: view },
	);
}

function setLeftSidebarView(view: LayoutState["leftSidebarView"]) {
	store.setState((state) =>
		state.leftSidebarView === view
			? state
			: { ...state, leftSidebarView: view },
	);
}

function toggleRightSidebar() {
	store.setState((state) => ({
		...state,
		rightSidebarVisible: !state.rightSidebarVisible,
	}));
}

function setRightSidebarVisible(visible: boolean) {
	store.setState((state) =>
		state.rightSidebarVisible === visible
			? state
			: { ...state, rightSidebarVisible: visible },
	);
}

function setCardsActiveTab(tab: LayoutState["cardsActiveTab"]) {
	const prev = store.getState().cardsActiveTab;
	store.setState((state) =>
		state.cardsActiveTab === tab ? state : { ...state, cardsActiveTab: tab },
	);
	if (prev === tab) return;
	if (typeof window !== "undefined") {
		try {
			window.localStorage.setItem(CARDS_ACTIVE_TAB_STORAGE_KEY, tab);
		} catch {
			// localStorage 写入失败时静默
		}
	}
}

function setLeftSidebarCollapsed(collapsed: boolean) {
	const prev = store.getState().leftSidebarCollapsed;
	store.setState((state) =>
		state.leftSidebarCollapsed === collapsed
			? state
			: { ...state, leftSidebarCollapsed: collapsed },
	);
	if (prev === collapsed) return;
	if (typeof window !== "undefined") {
		try {
			window.localStorage.setItem(
				LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY,
				collapsed ? "1" : "0",
			);
		} catch {
			// localStorage 写入失败时静默
		}
	}
}

function toggleLeftSidebar() {
	setLeftSidebarCollapsed(!store.getState().leftSidebarCollapsed);
}

/**
 * 项目切换时重置布局状态（由 workspaceStore.setCurrentProject 调用）
 */
function resetOnProjectChange() {
	// 布局状态通常不需要在切换项目时重置，
	// 但如果需要可以在此处添加逻辑
}

// === 导出 ===

export const layoutStore = {
	...store,
	setMainView,
	setLeftSidebarView,
	toggleRightSidebar,
	setRightSidebarVisible,
	setCardsActiveTab,
	setLeftSidebarCollapsed,
	toggleLeftSidebar,
	resetOnProjectChange,
};

export const useLayoutStore = createUseStore(store);
export const useLayoutStoreSelector = createUseStoreSelector(store);
