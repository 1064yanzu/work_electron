// 工作区状态管理 - 三栏互通的核心
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Source } from "../types";

// 上下文项
export interface ContextItem {
	id: string;
	type: "source" | "selection" | "file";
	title: string;
	content: string;
	sourceId?: string;
	filePath?: string;
	size?: number;
	mimeType?: string;
}

// 研究步骤
export interface ResearchStep {
	id: string;
	type: "search" | "fetch" | "analyze" | "summarize" | "complete" | "error";
	status: "pending" | "running" | "completed" | "error";
	title: string;
	description?: string;
	timestamp: number;
	data?: any; // 步骤相关数据
}

// 研究资料项（搜索结果或抓取的内容）
export interface ResearchSource {
	id: string;
	title: string;
	url?: string;
	snippet?: string;
	content?: string;
	type: "search_result" | "fetched_content" | "generated";
	timestamp: number;
}

// 研究任务
export interface ResearchTask {
	id: string;
	query: string;
	status:
		| "idle"
		| "searching"
		| "fetching"
		| "analyzing"
		| "completed"
		| "error";
	steps: ResearchStep[];
	sources: ResearchSource[];
	summary?: string;
	createdAt: number;
	completedAt?: number;
}

// 文档缓存项
export interface DocCacheItem {
	id: string;
	title: string;
	content: string;
	dirty: boolean; // 是否有未保存修改
	lastSynced: number; // 最后同步时间戳
	snapshot?: string; // 快照（用于撤销 AI 修改）
}

// 标签页类型
export type TabType = "doc" | "source";

// 标签页项
export interface TabItem {
	id: string;
	type: TabType;
	title: string;
	// 对于 source 类型，存储 sourceId
	sourceId?: string;
}

// AI 审查状态
export interface AIReviewState {
	isReviewing: boolean;
	docId: string | null;
	originalContent: string;
	suggestedContent: string;
	type: "update" | "create";
	title?: string; // 用于 create-doc
	summary?: string; // 用于 create-doc
}

// 工作区状态
interface WorkspaceState {
	// 当前选中的资料（用于 AI 上下文）
	selectedSources: Source[];
	// 上下文列表
	contexts: ContextItem[];
	// 编辑器当前内容
	editorContent: string;
	// 编辑器选中文本
	editorSelection: string;
	// 当前项目 ID
	currentProjectId: string | null;
	// 当前选中的文件夹（用于资料库筛选/新增归类）；null=全部
	currentFolderId: string | null;
	// 中间栏主视图模式
	activeMainView: "editor" | "browser";
	// 左边栏视图模式
	leftSidebarView:
		| "sources"
		| "research"
		| "detail"
		| "agent"
		| "cards"
		| "websearch";
	// 当前研究任务
	currentResearch: ResearchTask | null;
	// 历史研究任务
	researchHistory: ResearchTask[];
	// 当前预览的资料
	previewSource: Source | ResearchSource | null;
	// 右侧栏可见性
	rightSidebarVisible: boolean;

	// === 多标签文档工作区 ===
	// 已打开的文档 ID 列表（按顺序）
	openedDocs: string[];
	// 当前激活的文档 ID
	activeDocId: string | null;
	// 文档缓存
	docCache: Record<string, DocCacheItem>;
	// AI 审查状态
	aiReview: AIReviewState;

	// === 标签页系统（支持文档和资料阅读） ===
	tabs: TabItem[];
	activeTabId: string | null;
	// 资料阅读缓存（sourceId -> SourceDetail）
	sourceReadCache: Record<
		string,
		{
			sourceId: string;
			title: string;
			note?: { content: string; content_html?: string };
		}
	>;
}

const initialState: WorkspaceState = {
	selectedSources: [],
	contexts: [],
	editorContent: "",
	editorSelection: "",
	currentProjectId: null,
	currentFolderId: null,
	activeMainView: "editor",
	leftSidebarView: "sources",
	currentResearch: null,
	researchHistory: [],
	previewSource: null,
	rightSidebarVisible: true,

	// 多标签文档工作区
	openedDocs: [],
	activeDocId: null,
	docCache: {},
	aiReview: {
		isReviewing: false,
		docId: null,
		originalContent: "",
		suggestedContent: "",
		type: "update",
	},

	// 标签页系统
	tabs: [],
	activeTabId: null,
	sourceReadCache: {},
};

class WorkspaceStore {
	private state: WorkspaceState = initialState;
	private listeners: Set<() => void> = new Set();

	getState = () => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		this.listeners.forEach((l) => l());
	}

	private setState(updater: (state: WorkspaceState) => WorkspaceState) {
		this.state = updater(this.state);
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
			const { saveTempFile } = await import("./api");
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
			const { getSourceDetail } = await import("./api");
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

	// 更新编辑器内容
	setEditorContent(content: string) {
		this.setState((state) => ({ ...state, editorContent: content }));
	}

	// 更新编辑器选中
	setEditorSelection(selection: string) {
		this.setState((state) => ({ ...state, editorSelection: selection }));
	}

	// 设置当前项目
	setCurrentProject(projectId: string | null) {
		this.setState((state) => {
			if (state.currentProjectId === projectId) {
				return state;
			}

			// 切换项目时，清理与“具体文档/资料阅读/上下文”强相关的状态，避免跨项目串台
			return {
				...state,
				currentProjectId: projectId,
				currentFolderId: null,
				selectedSources: [],
				contexts: [],
				previewSource: null,
				openedDocs: [],
				activeDocId: null,
				docCache: {},
				tabs: [],
				activeTabId: null,
				sourceReadCache: {},
				aiReview: {
					isReviewing: false,
					docId: null,
					originalContent: "",
					suggestedContent: "",
					type: "update",
				},
			};
		});
	}

	setCurrentFolder(folderId: string | null) {
		this.setState((state) => {
			if (state.currentFolderId === folderId) return state;
			return { ...state, currentFolderId: folderId };
		});
	}

	// 设置主视图模式
	setMainView(view: "editor" | "browser") {
		this.setState((state) => ({ ...state, activeMainView: view }));
	}

	// 切换右侧栏可见性
	toggleRightSidebar() {
		this.setState((state) => ({
			...state,
			rightSidebarVisible: !state.rightSidebarVisible,
		}));
	}

	// 设置右侧栏可见性
	setRightSidebarVisible(visible: boolean) {
		this.setState((state) => ({ ...state, rightSidebarVisible: visible }));
	}

	// 设置左边栏视图模式
	setLeftSidebarView(
		view: "sources" | "research" | "detail" | "agent" | "cards" | "websearch",
	) {
		this.setState((state) => ({ ...state, leftSidebarView: view }));
	}

	// 设置预览资料
	setPreviewSource(source: Source | ResearchSource | null) {
		this.setState((state) => ({
			...state,
			previewSource: source,
			leftSidebarView: source
				? "detail"
				: state.leftSidebarView === "detail"
					? "sources"
					: state.leftSidebarView,
		}));
	}

	// 开始研究任务
	startResearch(query: string) {
		const task: ResearchTask = {
			id: `research-${Date.now()}`,
			query,
			status: "searching",
			steps: [
				{
					id: `step-${Date.now()}`,
					type: "search",
					status: "running",
					title: "搜索相关资料",
					description: `正在搜索: ${query}`,
					timestamp: Date.now(),
				},
			],
			sources: [],
			createdAt: Date.now(),
		};

		this.setState((state) => ({
			...state,
			currentResearch: task,
			leftSidebarView: "research",
		}));

		return task.id;
	}

	// 添加研究步骤
	addResearchStep(step: Omit<ResearchStep, "id" | "timestamp">) {
		this.setState((state) => {
			if (!state.currentResearch) return state;

			const newStep: ResearchStep = {
				...step,
				id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				timestamp: Date.now(),
			};

			return {
				...state,
				currentResearch: {
					...state.currentResearch,
					steps: [...state.currentResearch.steps, newStep],
				},
			};
		});
	}

	// 更新研究步骤状态
	updateResearchStep(stepId: string, updates: Partial<ResearchStep>) {
		this.setState((state) => {
			if (!state.currentResearch) return state;

			return {
				...state,
				currentResearch: {
					...state.currentResearch,
					steps: state.currentResearch.steps.map((s) =>
						s.id === stepId ? { ...s, ...updates } : s,
					),
				},
			};
		});
	}

	// 添加研究资料
	addResearchSource(source: Omit<ResearchSource, "id" | "timestamp">) {
		this.setState((state) => {
			if (!state.currentResearch) return state;

			const newSource: ResearchSource = {
				...source,
				id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				timestamp: Date.now(),
			};

			return {
				...state,
				currentResearch: {
					...state.currentResearch,
					sources: [...state.currentResearch.sources, newSource],
				},
			};
		});
	}

	// 更新研究任务状态
	updateResearchStatus(status: ResearchTask["status"], summary?: string) {
		this.setState((state) => {
			if (!state.currentResearch) return state;

			return {
				...state,
				currentResearch: {
					...state.currentResearch,
					status,
					summary,
					completedAt:
						status === "completed" || status === "error"
							? Date.now()
							: undefined,
				},
			};
		});
	}

	// 完成研究任务
	completeResearch(summary: string) {
		this.setState((state) => {
			if (!state.currentResearch) return state;

			const completedTask: ResearchTask = {
				...state.currentResearch,
				status: "completed",
				summary,
				completedAt: Date.now(),
				steps: [
					...state.currentResearch.steps,
					{
						id: `step-complete-${Date.now()}`,
						type: "complete",
						status: "completed",
						title: "研究完成",
						description:
							summary.slice(0, 100) + (summary.length > 100 ? "..." : ""),
						timestamp: Date.now(),
					},
				],
			};

			return {
				...state,
				currentResearch: completedTask,
				researchHistory: [completedTask, ...state.researchHistory].slice(0, 10), // 保留最近10个
			};
		});
	}

	// 清除当前研究
	clearCurrentResearch() {
		this.setState((state) => ({
			...state,
			currentResearch: null,
			leftSidebarView: "sources",
		}));
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

	// === 多标签文档管理 ===

	// 打开文档（添加到标签栏）
	openDoc(docId: string, title: string, content: string) {
		this.setState((state) => {
			const isAlreadyOpen = state.openedDocs.includes(docId);
			const newOpenedDocs = isAlreadyOpen
				? state.openedDocs
				: [...state.openedDocs, docId];

			const newDocCache = {
				...state.docCache,
				[docId]: state.docCache[docId] || {
					id: docId,
					title,
					content,
					dirty: false,
					lastSynced: Date.now(),
				},
			};

			return {
				...state,
				openedDocs: newOpenedDocs,
				activeDocId: docId,
				docCache: newDocCache,
			};
		});
	}

	// 关闭文档
	closeDoc(docId: string) {
		this.setState((state) => {
			const newOpenedDocs = state.openedDocs.filter((id) => id !== docId);
			const { [docId]: removed, ...newDocCache } = state.docCache;

			// 如果关闭的是当前激活文档，切换到最后一个
			let newActiveDocId = state.activeDocId;
			if (state.activeDocId === docId) {
				newActiveDocId =
					newOpenedDocs.length > 0
						? newOpenedDocs[newOpenedDocs.length - 1]
						: null;
			}

			return {
				...state,
				openedDocs: newOpenedDocs,
				activeDocId: newActiveDocId,
				docCache: newDocCache,
			};
		});
	}

	// 切换激活文档
	setActiveDoc(docId: string) {
		this.setState((state) => ({
			...state,
			activeDocId: docId,
		}));
	}

	// 更新文档缓存内容
	updateDocCache(docId: string, content: string, dirty = true) {
		this.setState((state) => {
			if (!state.docCache[docId]) return state;
			return {
				...state,
				docCache: {
					...state.docCache,
					[docId]: {
						...state.docCache[docId],
						content,
						dirty,
					},
				},
			};
		});
	}

	// 标记文档已保存
	markDocSaved(docId: string) {
		this.setState((state) => {
			if (!state.docCache[docId]) return state;
			return {
				...state,
				docCache: {
					...state.docCache,
					[docId]: {
						...state.docCache[docId],
						dirty: false,
						lastSynced: Date.now(),
					},
				},
			};
		});
	}

	// 保存快照（用于撤销 AI 修改）
	saveDocSnapshot(docId: string) {
		this.setState((state) => {
			if (!state.docCache[docId]) return state;
			return {
				...state,
				docCache: {
					...state.docCache,
					[docId]: {
						...state.docCache[docId],
						snapshot: state.docCache[docId].content,
					},
				},
			};
		});
	}

	// 恢复快照
	restoreDocSnapshot(docId: string) {
		this.setState((state) => {
			const doc = state.docCache[docId];
			if (!doc || !doc.snapshot) return state;
			return {
				...state,
				docCache: {
					...state.docCache,
					[docId]: {
						...doc,
						content: doc.snapshot,
						snapshot: undefined,
						dirty: true,
					},
				},
			};
		});
	}

	// 获取当前激活文档的内容
	getActiveDocContent(): string {
		const { activeDocId, docCache, editorContent } = this.state;
		// 优先从 docCache 获取，如果没有则回退到 editorContent
		if (activeDocId && docCache[activeDocId]) {
			return docCache[activeDocId].content;
		}
		// 回退到旧的 editorContent 状态
		return editorContent;
	}

	// === AI 审查状态管理 ===

	// 开始 AI 审查（update-doc）
	startAIReview(
		docId: string,
		originalContent: string,
		suggestedContent: string,
	) {
		// 先保存快照
		this.saveDocSnapshot(docId);

		this.setState((state) => ({
			...state,
			aiReview: {
				isReviewing: true,
				docId,
				originalContent,
				suggestedContent,
				type: "update",
			},
		}));
	}

	// 开始 AI 新建文档提案（create-doc）
	startAICreateProposal(title: string, summary: string, content: string) {
		this.setState((state) => ({
			...state,
			aiReview: {
				isReviewing: true,
				docId: null,
				originalContent: "",
				suggestedContent: content,
				type: "create",
				title,
				summary,
			},
		}));
	}

	// 接受 AI 修改
	acceptAIReview() {
		this.setState((state) => {
			if (!state.aiReview.isReviewing) return state;

			// 如果是 update-doc，更新文档内容
			if (state.aiReview.type === "update" && state.aiReview.docId) {
				const docId = state.aiReview.docId;
				return {
					...state,
					docCache: {
						...state.docCache,
						[docId]: {
							...state.docCache[docId],
							content: state.aiReview.suggestedContent,
							dirty: true,
						},
					},
					aiReview: {
						isReviewing: false,
						docId: null,
						originalContent: "",
						suggestedContent: "",
						type: "update",
					},
				};
			}

			// 如果是 create-doc，清除审查状态（实际创建由外部处理）
			return {
				...state,
				aiReview: {
					isReviewing: false,
					docId: null,
					originalContent: "",
					suggestedContent: "",
					type: "update",
				},
			};
		});
	}

	// 拒绝 AI 修改
	rejectAIReview() {
		this.setState((state) => {
			// 如果是 update-doc，恢复快照
			if (state.aiReview.type === "update" && state.aiReview.docId) {
				const docId = state.aiReview.docId;
				const doc = state.docCache[docId];
				if (doc && doc.snapshot) {
					return {
						...state,
						docCache: {
							...state.docCache,
							[docId]: {
								...doc,
								content: doc.snapshot,
								snapshot: undefined,
							},
						},
						aiReview: {
							isReviewing: false,
							docId: null,
							originalContent: "",
							suggestedContent: "",
							type: "update",
						},
					};
				}
			}

			return {
				...state,
				aiReview: {
					isReviewing: false,
					docId: null,
					originalContent: "",
					suggestedContent: "",
					type: "update",
				},
			};
		});
	}

	// 检查是否有脏文档
	hasDirtyDocs(): boolean {
		return Object.values(this.state.docCache).some((doc) => doc.dirty);
	}

	// 获取脏文档列表
	getDirtyDocs(): DocCacheItem[] {
		return Object.values(this.state.docCache).filter((doc) => doc.dirty);
	}

	// === 标签页系统（支持文档和资料阅读） ===

	// 在中间栏打开资料阅读
	openSourceInMainView(
		sourceId: string,
		title: string,
		note?: { content: string; content_html?: string },
	) {
		const tabId = `source-${sourceId}`;

		this.setState((state) => {
			// 检查是否已打开
			const existingTab = state.tabs.find((t) => t.id === tabId);
			if (existingTab) {
				// 已打开，直接激活
				return {
					...state,
					activeTabId: tabId,
					activeMainView: "editor",
				};
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
				activeMainView: "editor",
				sourceReadCache: {
					...state.sourceReadCache,
					[sourceId]: { sourceId, title, note },
				},
			};
		});
	}

	// 关闭标签页
	closeTab(tabId: string) {
		this.setState((state) => {
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
				const { [closedTab.sourceId]: removed, ...rest } =
					state.sourceReadCache;
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
	setActiveTab(tabId: string) {
		this.setState((state) => ({
			...state,
			activeTabId: tabId,
		}));
	}

	// 获取当前激活的标签页
	getActiveTab(): TabItem | null {
		const { tabs, activeTabId } = this.state;
		return tabs.find((t) => t.id === activeTabId) || null;
	}
}

export const workspaceStore = new WorkspaceStore();

// React Hook
export function useWorkspaceStore() {
	const state = useSyncExternalStore(
		workspaceStore.subscribe,
		workspaceStore.getState,
		workspaceStore.getState,
	);

	return {
		...state,
		addSourceToContext: workspaceStore.addSourceToContext.bind(workspaceStore),
		removeSourceFromContext:
			workspaceStore.removeSourceFromContext.bind(workspaceStore),
		addSelectionToContext:
			workspaceStore.addSelectionToContext.bind(workspaceStore),
		addFileToContext: workspaceStore.addFileToContext.bind(workspaceStore),
		removeContext: workspaceStore.removeContext.bind(workspaceStore),
		clearContexts: workspaceStore.clearContexts.bind(workspaceStore),
		setEditorContent: workspaceStore.setEditorContent.bind(workspaceStore),
		setEditorSelection: workspaceStore.setEditorSelection.bind(workspaceStore),
		setCurrentProject: workspaceStore.setCurrentProject.bind(workspaceStore),
		setCurrentFolder: workspaceStore.setCurrentFolder.bind(workspaceStore),
		setMainView: workspaceStore.setMainView.bind(workspaceStore),
		getContextText: workspaceStore.getContextText.bind(workspaceStore),
		// 右侧栏控制
		toggleRightSidebar: workspaceStore.toggleRightSidebar.bind(workspaceStore),
		setRightSidebarVisible:
			workspaceStore.setRightSidebarVisible.bind(workspaceStore),
		// 左边栏和研究相关
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
		// 多标签文档管理
		openDoc: workspaceStore.openDoc.bind(workspaceStore),
		closeDoc: workspaceStore.closeDoc.bind(workspaceStore),
		setActiveDoc: workspaceStore.setActiveDoc.bind(workspaceStore),
		updateDocCache: workspaceStore.updateDocCache.bind(workspaceStore),
		markDocSaved: workspaceStore.markDocSaved.bind(workspaceStore),
		saveDocSnapshot: workspaceStore.saveDocSnapshot.bind(workspaceStore),
		restoreDocSnapshot: workspaceStore.restoreDocSnapshot.bind(workspaceStore),
		getActiveDocContent:
			workspaceStore.getActiveDocContent.bind(workspaceStore),
		// AI 审查状态
		startAIReview: workspaceStore.startAIReview.bind(workspaceStore),
		startAICreateProposal:
			workspaceStore.startAICreateProposal.bind(workspaceStore),
		acceptAIReview: workspaceStore.acceptAIReview.bind(workspaceStore),
		rejectAIReview: workspaceStore.rejectAIReview.bind(workspaceStore),
		hasDirtyDocs: workspaceStore.hasDirtyDocs.bind(workspaceStore),
		getDirtyDocs: workspaceStore.getDirtyDocs.bind(workspaceStore),
		// 标签页系统
		openSourceInMainView:
			workspaceStore.openSourceInMainView.bind(workspaceStore),
		closeTab: workspaceStore.closeTab.bind(workspaceStore),
		setActiveTab: workspaceStore.setActiveTab.bind(workspaceStore),
		getActiveTab: workspaceStore.getActiveTab.bind(workspaceStore),
	};
}

// Selector Hook - 允许组件只订阅需要的状态字段，减少不必要的重渲染
export function useWorkspaceStoreSelector<T>(
	selector: (state: WorkspaceState) => T,
): T {
	const selectorRef = useRef(selector);
	selectorRef.current = selector;

	const getSnapshot = useCallback(
		() => selectorRef.current(workspaceStore.getState()),
		[],
	);

	return useSyncExternalStore(
		workspaceStore.subscribe,
		getSnapshot,
		getSnapshot,
	);
}

// 导出类型
export type { WorkspaceState };
