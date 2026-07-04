// 工作区状态管理 - 三栏互通的核心
// 此文件保留核心状态（上下文、项目、预览）并作为所有子 Store 的统一入口
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Source } from "../types";

// 从子 Store 重新导出类型，保持向后兼容
export type {
	ContextItem,
	ResearchStep,
	ResearchSource,
	ResearchTask,
	TabType,
	TabItem,
	WorkspaceState,
} from "./stores/types";

import type {
	CoreWorkspaceState,
	ResearchSource,
	WorkspaceState,
} from "./stores/types";

// 导入子 Store
import { layoutStore } from "./stores/layoutStore";
import { researchStore } from "./stores/researchStore";
import { tabStore } from "./stores/tabStore";

// 重新导出子 Store，方便渐进迁移
export {
	layoutStore,
	useLayoutStore,
	useLayoutStoreSelector,
} from "./stores/layoutStore";
export {
	researchStore,
	useResearchStore,
	useResearchStoreSelector,
} from "./stores/researchStore";
export { tabStore, useTabStore, useTabStoreSelector } from "./stores/tabStore";

// 核心工作区状态（保留在此文件中）
const initialCoreState: CoreWorkspaceState = {
	selectedSources: [],
	contexts: [],
	currentProjectId: null,
	currentFolderId: null,
	currentThreadPath: null,
	currentThreadTitle: null,
	previewSource: null,
};

class WorkspaceStore {
	private state: CoreWorkspaceState = initialCoreState;
	private listeners: Set<() => void> = new Set();

	// 缓存聚合状态，避免 useSyncExternalStore 因引用不同而无限重渲染
	private cachedAggregatedState: WorkspaceState | null = null;
	private lastCoreState: CoreWorkspaceState | null = null;
	private lastLayoutState: ReturnType<typeof layoutStore.getState> | null =
		null;
	private lastResearchState: ReturnType<typeof researchStore.getState> | null =
		null;
	private lastTabState: ReturnType<typeof tabStore.getState> | null = null;

	getState = (): WorkspaceState => {
		const coreState = this.state;
		const layout = layoutStore.getState();
		const research = researchStore.getState();
		const tab = tabStore.getState();

		// 只有当某个子 Store 状态实际变化时，才重新聚合
		if (
			this.cachedAggregatedState !== null &&
			coreState === this.lastCoreState &&
			layout === this.lastLayoutState &&
			research === this.lastResearchState &&
			tab === this.lastTabState
		) {
			return this.cachedAggregatedState;
		}

		this.lastCoreState = coreState;
		this.lastLayoutState = layout;
		this.lastResearchState = research;
		this.lastTabState = tab;
		this.cachedAggregatedState = {
			...coreState,
			...layout,
			...research,
			...tab,
		};
		return this.cachedAggregatedState;
	};

	// 仅获取核心状态（不聚合子 Store）
	getCoreState = (): CoreWorkspaceState => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		const notify = () => {
			this.cachedAggregatedState = null;
			listener();
		};
		// 同时订阅所有子 Store，以便在任何 Store 变化时通知聚合监听器
		const unsubs = [
			layoutStore.subscribe(notify),
			researchStore.subscribe(notify),
			tabStore.subscribe(notify),
		];
		return () => {
			this.listeners.delete(listener);
			for (const unsub of unsubs) unsub();
		};
	};

	private emit() {
		// 失效缓存，让下次 getState 重新聚合
		this.cachedAggregatedState = null;
		this.listeners.forEach((l) => l());
	}

	private setState(updater: (state: CoreWorkspaceState) => CoreWorkspaceState) {
		const nextState = updater(this.state);
		if (Object.is(nextState, this.state)) {
			return;
		}
		this.state = nextState;
		this.emit();
	}

	private deriveFileParams(title: string) {
		const basename = String(title || "document.txt")
			.split(/[/\\]/)
			.pop() as string;
		const dotIdx = basename.lastIndexOf(".");
		const extension =
			dotIdx > 0 ? basename.slice(dotIdx + 1).toLowerCase() : "txt";
		const prefixRaw = dotIdx > 0 ? basename.slice(0, dotIdx) : basename;
		const prefix =
			prefixRaw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "doc";
		return { extension, prefix };
	}

	async ensureContextHasFile(contextId: string): Promise<void> {
		const ctx = this.state.contexts.find((c) => c.id === contextId);
		if (!ctx) return;
		if (typeof ctx.filePath === "string" && ctx.filePath) return;
		if (!ctx.content || ctx.content.trim().length === 0) return;

		try {
			const { saveTempFile } = await import("./api/tempFiles");
			const { extension, prefix } = this.deriveFileParams(ctx.title);
			const result = await saveTempFile({
				content: ctx.content,
				extension,
				prefix,
				encoding: "utf-8",
			});
			this.setState((state) => ({
				...state,
				contexts: state.contexts.map((c) =>
					c.id === contextId
						? {
								...c,
								filePath: result.path,
								size: result.size,
								mimeType: "text/plain",
							}
						: c,
				),
			}));
		} catch (err) {
			console.error("[workspaceStore] 生成上下文文件失败:", err);
		}
	}

	async ensureAllContextsHaveFiles(): Promise<void> {
		const pendingContextIds = this.state.contexts
			.filter(
				(ctx) => ctx.content && ctx.content.trim().length > 0 && !ctx.filePath,
			)
			.map((ctx) => ctx.id);
		if (pendingContextIds.length === 0) return;

		const results = await Promise.allSettled(
			pendingContextIds.map((contextId) =>
				this.ensureContextHasFile(contextId),
			),
		);
		for (const result of results) {
			if (result.status === "rejected") {
				console.error(
					"[workspaceStore] 批量生成上下文文件失败:",
					result.reason,
				);
			}
		}
	}

	// 添加资料到上下文
	addSourceToContext(source: Source) {
		// 先添加占位
		this.setState((state) => {
			if (state.selectedSources.find((s) => s.id === source.id)) {
				return state;
			}
			return {
				...state,
				selectedSources: [...state.selectedSources, source],
				contexts: [
					...state.contexts,
					{
						id: `source-${source.id}`,
						type: "source",
						title: source.title,
						content: "", // 内容异步加载
						sourceId: source.id,
					},
				],
			};
		});

		// 异步加载资料内容
		this.loadSourceContent(source.id);
	}

	// 异步加载资料内容
	async loadSourceContent(sourceId: string) {
		try {
			// 动态导入避免循环依赖
			const { getSourceDetail } = await import("./api/sources");
			const detail = await getSourceDetail(sourceId);
			const content = detail.note?.content || detail.source.description || "";

			// 更新 context 中的内容
			this.setState((state) => ({
				...state,
				contexts: state.contexts.map((ctx) =>
					ctx.sourceId === sourceId ? { ...ctx, content } : ctx,
				),
			}));
			void this.ensureContextHasFile(`source-${sourceId}`);
			console.log(
				"[workspaceStore] 已加载资料内容:",
				sourceId,
				content.slice(0, 100),
			);
		} catch (err) {
			console.error("[workspaceStore] 加载资料内容失败:", err);
		}
	}

	// 从上下文移除资料
	removeSourceFromContext(sourceId: string) {
		this.setState((state) => ({
			...state,
			selectedSources: state.selectedSources.filter((s) => s.id !== sourceId),
			contexts: state.contexts.filter((c) => c.sourceId !== sourceId),
		}));
	}

	// 添加选中文本到上下文
	addSelectionToContext(text: string, title?: string) {
		const id = `selection-${Date.now()}`;
		this.setState((state) => ({
			...state,
			contexts: [
				...state.contexts,
				{
					id,
					type: "selection",
					title: title || "选中文本",
					content: text,
				},
			],
		}));
		void this.ensureContextHasFile(id);
	}

	// 添加本地文件到上下文
	addFileToContext(input: {
		title: string;
		content: string;
		filePath: string;
		size?: number;
		mimeType?: string;
	}) {
		const id = `file-${Date.now()}`;
		this.setState((state) => ({
			...state,
			contexts: [
				...state.contexts,
				{
					id,
					type: "file",
					title: input.title,
					content: input.content,
					filePath: input.filePath,
					size: input.size,
					mimeType: input.mimeType,
				},
			],
		}));
	}

	// 移除上下文项
	removeContext(id: string) {
		this.setState((state) => ({
			...state,
			contexts: state.contexts.filter((c) => c.id !== id),
			selectedSources: state.selectedSources.filter(
				(s) => `source-${s.id}` !== id,
			),
		}));
	}

	// 清空上下文
	clearContexts() {
		this.setState((state) => ({
			...state,
			selectedSources: [],
			contexts: [],
		}));
	}

	// 设置当前项目 - 核心方法，需要协调所有子 Store
	setCurrentProject(projectId: string | null) {
		if (this.state.currentProjectId === projectId) {
			return;
		}

		// 切换项目时，清理核心状态
		this.setState((state) => ({
			...state,
			currentProjectId: projectId,
			currentFolderId: null,
			currentThreadPath: null,
			currentThreadTitle: null,
			selectedSources: [],
			contexts: [],
			previewSource: null,
		}));

		// 通知子 Store 执行各自的清理
		tabStore.resetOnProjectChange();
		layoutStore.resetOnProjectChange();
		researchStore.resetOnProjectChange();
	}

	setCurrentFolder(folderId: string | null) {
		this.setState((state) => {
			if (state.currentFolderId === folderId) return state;
			return { ...state, currentFolderId: folderId };
		});
	}

	setCurrentThreadScope(path: string | null, title?: string | null) {
		this.setState((state) => {
			const normalizedPath = path?.trim() || null;
			const normalizedTitle = title?.trim() || null;
			if (
				state.currentThreadPath === normalizedPath &&
				state.currentThreadTitle === normalizedTitle
			) {
				return state;
			}
			return {
				...state,
				currentThreadPath: normalizedPath,
				currentThreadTitle: normalizedTitle,
			};
		});
	}

	// 设置主视图模式 -> layoutStore
	setMainView(view: "editor" | "browser" | "wiki-graph") {
		layoutStore.setMainView(view);
	}

	// 切换右侧栏可见性 -> layoutStore
	toggleRightSidebar() {
		layoutStore.toggleRightSidebar();
	}

	// 设置右侧栏可见性 -> layoutStore
	setRightSidebarVisible(visible: boolean) {
		layoutStore.setRightSidebarVisible(visible);
	}

	// 设置左边栏视图模式 -> layoutStore
	setLeftSidebarView(
		view:
			| "sources"
			| "research"
			| "detail"
			| "agent"
			| "cards"
			| "websearch"
			| "threads"
			| "files"
			| "skills"
			| "wiki",
	) {
		layoutStore.setLeftSidebarView(view);
	}

	// 设置预览资料 - 跨 Store 操作（涉及核心状态 + 布局状态）
	setPreviewSource(source: Source | ResearchSource | null) {
		this.setState((state) => ({
			...state,
			previewSource: source,
		}));
		// 同时更新布局
		const currentView = layoutStore.getState().leftSidebarView;
		if (source) {
			layoutStore.setLeftSidebarView("detail");
		} else if (currentView === "detail") {
			layoutStore.setLeftSidebarView("sources");
		}
	}

	// 开始研究任务 -> researchStore + layoutStore
	startResearch(query: string) {
		const taskId = researchStore.startResearch(query);
		layoutStore.setLeftSidebarView("research");
		return taskId;
	}

	// 研究相关方法 -> researchStore
	addResearchStep(step: Parameters<typeof researchStore.addResearchStep>[0]) {
		researchStore.addResearchStep(step);
	}

	updateResearchStep(
		stepId: string,
		updates: Parameters<typeof researchStore.updateResearchStep>[1],
	) {
		researchStore.updateResearchStep(stepId, updates);
	}

	addResearchSource(
		source: Parameters<typeof researchStore.addResearchSource>[0],
	) {
		researchStore.addResearchSource(source);
	}

	updateResearchStatus(
		status: Parameters<typeof researchStore.updateResearchStatus>[0],
		summary?: string,
	) {
		researchStore.updateResearchStatus(status, summary);
	}

	completeResearch(summary: string) {
		researchStore.completeResearch(summary);
	}

	// 清除当前研究 -> researchStore + layoutStore
	clearCurrentResearch() {
		researchStore.clearCurrentResearch();
		layoutStore.setLeftSidebarView("sources");
	}

	// 获取上下文文本（用于 AI）
	getContextText(): string[] {
		return this.state.contexts.map((c) => c.content).filter(Boolean);
	}

	getContextPromptText(): string[] {
		return this.state.contexts
			.filter((c) => Boolean(c.content))
			.map((c) => `[${c.type}] ${c.title}\n${c.content}`)
			.filter(Boolean);
	}

	// === 标签页系统 -> tabStore + layoutStore ===

	openSourceInMainView(
		sourceId: string,
		title: string,
		note?: { content: string; content_html?: string },
	) {
		const layoutUpdate = tabStore.openSourceInMainView(sourceId, title, note);
		layoutStore.setMainView(layoutUpdate.activeMainView);
	}

	closeTab(tabId: string) {
		tabStore.closeTab(tabId);
	}

	setActiveTab(tabId: string) {
		tabStore.setActiveTab(tabId);
	}

	getActiveTab() {
		return tabStore.getActiveTab();
	}
}

export const workspaceStore = new WorkspaceStore();

// 模块级 stable actions — 引用永不变化，保证 memo 子组件正常工作
export const workspaceActions = {
	addSourceToContext: workspaceStore.addSourceToContext.bind(workspaceStore),
	removeSourceFromContext:
		workspaceStore.removeSourceFromContext.bind(workspaceStore),
	addSelectionToContext:
		workspaceStore.addSelectionToContext.bind(workspaceStore),
	addFileToContext: workspaceStore.addFileToContext.bind(workspaceStore),
	removeContext: workspaceStore.removeContext.bind(workspaceStore),
	clearContexts: workspaceStore.clearContexts.bind(workspaceStore),
	setCurrentProject: workspaceStore.setCurrentProject.bind(workspaceStore),
	setCurrentFolder: workspaceStore.setCurrentFolder.bind(workspaceStore),
	setCurrentThreadScope:
		workspaceStore.setCurrentThreadScope.bind(workspaceStore),
	setMainView: workspaceStore.setMainView.bind(workspaceStore),
	getContextText: workspaceStore.getContextText.bind(workspaceStore),
	getContextPromptText:
		workspaceStore.getContextPromptText.bind(workspaceStore),
	toggleRightSidebar: workspaceStore.toggleRightSidebar.bind(workspaceStore),
	setRightSidebarVisible:
		workspaceStore.setRightSidebarVisible.bind(workspaceStore),
	setLeftSidebarView: workspaceStore.setLeftSidebarView.bind(workspaceStore),
	setPreviewSource: workspaceStore.setPreviewSource.bind(workspaceStore),
	startResearch: workspaceStore.startResearch.bind(workspaceStore),
	addResearchStep: workspaceStore.addResearchStep.bind(workspaceStore),
	updateResearchStep: workspaceStore.updateResearchStep.bind(workspaceStore),
	addResearchSource: workspaceStore.addResearchSource.bind(workspaceStore),
	updateResearchStatus:
		workspaceStore.updateResearchStatus.bind(workspaceStore),
	completeResearch: workspaceStore.completeResearch.bind(workspaceStore),
	clearCurrentResearch:
		workspaceStore.clearCurrentResearch.bind(workspaceStore),
	openSourceInMainView:
		workspaceStore.openSourceInMainView.bind(workspaceStore),
	closeTab: workspaceStore.closeTab.bind(workspaceStore),
	setActiveTab: workspaceStore.setActiveTab.bind(workspaceStore),
	getActiveTab: workspaceStore.getActiveTab.bind(workspaceStore),
} as const;

// React Hook - 提供完整的聚合状态（向后兼容）
export function useWorkspaceStore() {
	const state = useSyncExternalStore(
		workspaceStore.subscribe,
		workspaceStore.getState,
		workspaceStore.getState,
	);
	// 使用模块级 stable actions，避免每次渲染创建新 bind 引用
	return { ...state, ...workspaceActions };
}

// Selector Hook - 允许组件只订阅需要的状态字段，减少不必要的重渲染。
// 与 stores/createStore.ts 的 createUseStoreSelector 保持同一套缓存策略：
// 1) 聚合 state 引用没变 → 直接复用上次结果（跳过 selector 执行）
// 2) state 变了但 selector 结果 Object.is 相同 → 保持旧引用，
//    让 useSyncExternalStore 跳过这次更新（内联对象 selector 不再每次触发重渲染）
export function useWorkspaceStoreSelector<T>(
	selector: (state: WorkspaceState) => T,
): T {
	const selectorRef = useRef(selector);
	const lastStateRef = useRef<WorkspaceState | null>(null);
	const lastSelectedRef = useRef<T | null>(null);
	selectorRef.current = selector;

	const getSnapshot = useCallback(() => {
		const nextState = workspaceStore.getState();
		if (
			lastStateRef.current === nextState &&
			lastSelectedRef.current !== null
		) {
			return lastSelectedRef.current;
		}

		const nextSelected = selectorRef.current(nextState);
		lastStateRef.current = nextState;

		if (
			lastSelectedRef.current !== null &&
			Object.is(lastSelectedRef.current, nextSelected)
		) {
			return lastSelectedRef.current;
		}

		lastSelectedRef.current = nextSelected;
		return nextSelected;
	}, []);

	return useSyncExternalStore(
		workspaceStore.subscribe,
		getSnapshot,
		getSnapshot,
	);
}
