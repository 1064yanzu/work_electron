/**
 * Right Panel Tab Store —— 右侧面板 tab 单一事实源。
 *
 * 任务：T4.0。
 *
 * 背景：
 * - 现有 `CopilotSidebar` 是单一容器 + `rightSidebarVisible` 布尔开关，缺少
 *   "assistant / changes / git / context / memory / mcp" 等 tab 的集中状态源。
 * - 本 store 只负责 tab 状态，不负责可见性（由 `workspaceStore.setRightSidebarVisible`
 *   管理），两个 store 并行使用，保持解耦。
 *
 * 约束：
 * - 遵循项目自研 `createStore`（基于 `useSyncExternalStore`）；
 * - 仅暴露最小 API：`getState` / `subscribe` / `setRightPanelTab` / `useRightPanelTab`；
 * - **本任务不修改 CopilotSidebar**；组件侧订阅留给后续 UI 任务。
 */

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 右侧面板的 tab 枚举；与 `/diff` `/status` `/context` `/memory` `/mcp` 映射一致。 */
export type RightPanelTab =
	| "assistant"
	| "changes"
	| "git"
	| "context"
	| "memory"
	| "mcp";

/** Store 内部状态。 */
export interface RightPanelTabState {
	active: RightPanelTab;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialState: RightPanelTabState = {
	active: "assistant",
};

const internalStore = createStore<RightPanelTabState>(initialState);

/**
 * 设置右侧面板的当前 tab。
 *
 * - 传入相同值时跳过 setState，避免无谓的 re-render。
 * - **不触达 `rightSidebarVisible`**，调用方如需同时显示面板应自行调用
 *   `workspaceStore.setRightSidebarVisible(true)`。
 */
export function setRightPanelTab(tab: RightPanelTab): void {
	internalStore.setState((prev) =>
		prev.active === tab ? prev : { active: tab },
	);
}

/** 获取当前右侧面板 tab 的即时值（非 React 场景使用）。 */
export function getRightPanelTab(): RightPanelTab {
	return internalStore.getState().active;
}

/**
 * 对外暴露的 store 句柄；仅保留 `getState` / `subscribe` / 写 API，
 * 不直接暴露 `setState`，强制外部走 {@link setRightPanelTab}。
 */
export const rightPanelTabStore = {
	getState: internalStore.getState,
	subscribe: internalStore.subscribe,
	setActive: setRightPanelTab,
};

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

export const useRightPanelTab = createUseStore(internalStore);

export const useRightPanelTabSelector = createUseStoreSelector(internalStore);
