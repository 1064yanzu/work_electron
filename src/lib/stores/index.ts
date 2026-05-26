/**
 * Store 系统统一导出入口。
 *
 * 设计原则：
 * - 所有 Store 由本 barrel re-export，外部代码可以通过 `@/lib/stores` 一站式访问
 * - 旧路径（如 `@/lib/workspaceStore`、`@/lib/managedModeStore`）仍有效，迁移可以渐进
 * - WorkspaceStore 的子 Store（layout / editor / research / tab）仍住在 `lib/stores/` 物理目录
 * - 其余顶层 Store（customPrompt / managedMode / mascot / previewServer / sandboxEditor /
 *   settings / skillsMarketplace / skills / workspace）暂时保留在 `src/lib/` 根目录，
 *   以避免大规模 import 路径变动；本 barrel 提供统一访问视图
 *
 * 未来按域分组目标（M5 阶段二，独立会话推进）：
 *   stores/agent/   stores/ui/   stores/workspace/   stores/data/
 */

// ───── Store 工厂与类型 ─────
export {
	createStore,
	createUseStore,
	createUseStoreSelector,
	type StoreApi,
} from "./createStore";

export type {
	ContextItem,
	ResearchStep,
	ResearchSource,
	ResearchTask,
	TabType,
	TabItem,
	LayoutState,
	ResearchState,
	TabState,
	CoreWorkspaceState,
	WorkspaceState,
} from "./types";

// ───── 工作区子 Store ─────
export {
	layoutStore,
	useLayoutStore,
	useLayoutStoreSelector,
} from "./layoutStore";
export {
	researchStore,
	useResearchStore,
	useResearchStoreSelector,
} from "./researchStore";
export { tabStore, useTabStore, useTabStoreSelector } from "./tabStore";
// ───── 顶层业务 Store（住在 src/lib/）─────
export * from "../customPromptStore";
export * from "../managedModeStore";
export * from "../mascotStore";
export * from "../previewServerStore";
export * from "../sandboxEditorStore";
export * from "../settingsStore";
export * from "../skillsMarketplaceStore";
export * from "../skillsStore";
// workspaceStore 内部已经 re-export layout/editor/research/tab，避免名称冲突
// 这里只挑选 workspaceStore 的核心 API（其余 4 个子 Store 上面已显式 export）
export {
	workspaceStore,
	useWorkspaceStore,
	useWorkspaceStoreSelector,
} from "../workspaceStore";
