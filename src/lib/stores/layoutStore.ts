// 布局状态管理 - 视图模式、侧边栏可见性等

import { createStore, createUseStore, createUseStoreSelector } from "./createStore";
import type { LayoutState } from "./types";

const initialLayoutState: LayoutState = {
	activeMainView: "editor",
	leftSidebarView: "sources",
	rightSidebarVisible: true,
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
	resetOnProjectChange,
};

export const useLayoutStore = createUseStore(store);
export const useLayoutStoreSelector = createUseStoreSelector(store);
