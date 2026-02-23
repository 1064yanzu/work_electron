// 工作区状态管理 - 统一导出入口

// 类型
export type {
	ContextItem,
	ResearchStep,
	ResearchSource,
	ResearchTask,
	DocCacheItem,
	TabType,
	TabItem,
	AIReviewState,
	LayoutState,
	EditorState,
	ResearchState,
	TabState,
	CoreWorkspaceState,
	WorkspaceState,
} from "./types";

// 工厂函数
export { createStore, createUseStore, createUseStoreSelector } from "./createStore";
export type { StoreApi } from "./createStore";

// 布局 Store
export { layoutStore, useLayoutStore, useLayoutStoreSelector } from "./layoutStore";

// 编辑器 Store
export { editorStore, useEditorStore, useEditorStoreSelector } from "./editorStore";

// 研究 Store
export { researchStore, useResearchStore, useResearchStoreSelector } from "./researchStore";

// 标签页 Store
export { tabStore, useTabStore, useTabStoreSelector } from "./tabStore";
