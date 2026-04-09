// 工作区状态管理 - 共享类型定义

import type { Source } from "../../types";

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
export type TabType = "doc" | "source" | "diff";

// 标签页项
export interface TabItem {
	id: string;
	type: TabType;
	title: string;
	// 对于 source 类型，存储 sourceId
	sourceId?: string;
	// 对于 diff 类型，存储 diffId
	diffId?: string;
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

// 布局状态
export interface LayoutState {
	// 中间栏主视图模式
	activeMainView: "editor" | "browser";
	// 左边栏视图模式
	leftSidebarView:
		| "sources"
		| "research"
		| "detail"
		| "agent"
		| "cards"
		| "websearch"
		| "threads"
		| "files";
	// 右侧栏可见性
	rightSidebarVisible: boolean;
}

// 编辑器状态
export interface EditorState {
	// 编辑器当前内容
	editorContent: string;
	// 编辑器选中文本
	editorSelection: string;
	// 已打开的文档 ID 列表（按顺序）
	openedDocs: string[];
	// 当前激活的文档 ID
	activeDocId: string | null;
	// 文档缓存
	docCache: Record<string, DocCacheItem>;
	// AI 审查状态
	aiReview: AIReviewState;
}

// 研究状态
export interface ResearchState {
	// 当前研究任务
	currentResearch: ResearchTask | null;
	// 历史研究任务
	researchHistory: ResearchTask[];
}

// 标签页状态
export interface TabState {
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

// 核心工作区状态（保留在 workspaceStore 中）
export interface CoreWorkspaceState {
	// 当前选中的资料（用于 AI 上下文）
	selectedSources: Source[];
	// 上下文列表
	contexts: ContextItem[];
	// 当前项目 ID
	currentProjectId: string | null;
	// 当前选中的文件夹（用于资料库筛选/新增归类）；null=全部
	currentFolderId: string | null;
	// 当前预览的资料
	previewSource: Source | ResearchSource | null;
}

// 完整的工作区状态（向后兼容）
export interface WorkspaceState
	extends CoreWorkspaceState,
		LayoutState,
		EditorState,
		ResearchState,
		TabState {}
