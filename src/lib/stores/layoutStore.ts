// 布局状态管理 - 视图模式、侧边栏可见性等

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";
import type { LayoutState } from "./types";

const CARDS_ACTIVE_TAB_STORAGE_KEY = "layout.cardsActiveTab";

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

const initialLayoutState: LayoutState = {
	activeMainView: "editor",
	leftSidebarView: "sources",
	rightSidebarVisible: true,
	cardsActiveTab: readPersistedCardsActiveTab(),
};

const store = createStore<LayoutState>(initialLayoutState);

// === 操作方法 ===

function setMainView(view: LayoutState["activeMainView"]) {
	store.setState((state) => ({ ...state, activeMainView: view }));
}

function setLeftSidebarView(view: LayoutState["leftSidebarView"]) {
	store.setState((state) => ({ ...state, leftSidebarView: view }));
}

function toggleRightSidebar() {
	store.setState((state) => ({
		...state,
		rightSidebarVisible: !state.rightSidebarVisible,
	}));
}

function setRightSidebarVisible(visible: boolean) {
	store.setState((state) => ({ ...state, rightSidebarVisible: visible }));
}

function setCardsActiveTab(tab: LayoutState["cardsActiveTab"]) {
	store.setState((state) => ({ ...state, cardsActiveTab: tab }));
	if (typeof window !== "undefined") {
		try {
			window.localStorage.setItem(CARDS_ACTIVE_TAB_STORAGE_KEY, tab);
		} catch {
			// localStorage 写入失败时静默
		}
	}
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
	resetOnProjectChange,
};

export const useLayoutStore = createUseStore(store);
export const useLayoutStoreSelector = createUseStoreSelector(store);
