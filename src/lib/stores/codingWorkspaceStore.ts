/**
 * Coding Workspace Store
 * 管理编程工作区的全局状态：项目路径、文件树、Git 状态、布局状态、最近项目、上下文文件
 * 注意：消息/对话状态已迁移到 codingSessionStore.ts
 */
import { useCallback, useRef, useSyncExternalStore } from "react";

// 文件树节点（与后端 codingService 保持一致）
export interface FileTreeNode {
	name: string;
	path: string;
	type: "file" | "directory";
	children?: FileTreeNode[];
	size?: number;
}

export type GitChangeKind =
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "untracked"
	| "copied"
	| "conflicted";

// Git 文件状态
export interface GitFileStatus {
	path: string;
	absolutePath?: string;
	status: GitChangeKind;
	staged: boolean;
	indexStatus?: GitChangeKind;
	workingTreeStatus?: GitChangeKind;
	originalPath?: string;
	originalAbsolutePath?: string;
}

// Git 状态
export interface GitStatusInfo {
	branch: string;
	ahead: number;
	behind: number;
	files: GitFileStatus[];
}

// Git 分支
export interface GitBranchInfo {
	name: string;
	current: boolean;
	remote?: string;
	lastCommit?: string;
}

export interface GitCommitInfo {
	hash: string;
	shortHash: string;
	subject: string;
	authorName: string;
	timestamp: number;
}

// 附加到对话的上下文文件
export interface ContextFile {
	path: string;
	name: string;
	content?: string;
}

// 最近打开的项目记录
export interface RecentCodingProject {
	path: string;
	name: string; // dirname
	lastOpenedAt: number;
}

// 中间面板模式
export type CenterPanelMode = "chat" | "codeViewer" | "diff";

// 中间面板打开的文件 Tab
export interface CenterPanelTab {
	id: string;
	filePath: string;
	fileName: string;
	language: string;
	/** 高亮的行号（如搜索跳转） */
	highlightLine?: number;
}

// 布局面板可见性
export interface CodingLayoutState {
	leftPanelVisible: boolean;
	rightPanelVisible: boolean;
	terminalVisible: boolean;
	rightPanelTab: "git" | "session-changes" | "terminal-log";
	centerPanelMode: CenterPanelMode;
}

export interface SelectedCodingFilePreview {
	path: string | null;
	content: string;
	truncated: boolean;
	loading: boolean;
	error: string | null;
}

// 完整的 store 状态
interface CodingWorkspaceState {
	// 当前打开的项目路径
	projectPath: string | null;
	// 项目名称
	projectName: string;
	// 是否是 Git 仓库
	isGitRepo: boolean;
	// 文件树
	fileTree: FileTreeNode[];
	fileTreeLoading: boolean;
	// Git 状态
	gitStatus: GitStatusInfo | null;
	gitBranches: GitBranchInfo[];
	gitHistory: GitCommitInfo[];
	// 附加的上下文文件
	contextFiles: ContextFile[];
	// 布局状态
	layout: CodingLayoutState;
	// 最近打开的项目
	recentProjects: RecentCodingProject[];
	// 文件树中选中的文件路径（用于高亮）
	selectedFilePath: string | null;
	selectedFilePreview: SelectedCodingFilePreview;
	// 文件树搜索关键词
	fileSearchQuery: string;
	// 中间面板 Tab 系统
	centerPanelTabs: CenterPanelTab[];
	activeCenterTabId: string | null;
}

const RECENT_PROJECTS_KEY = "ipo-coding-recent-projects";
const LAYOUT_KEY = "ipo-coding-layout";

function loadRecentProjects(): RecentCodingProject[] {
	try {
		const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function loadLayout(): CodingLayoutState {
	try {
		const raw = localStorage.getItem(LAYOUT_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<CodingLayoutState>;
			// 迁移旧 tab 值到新 3-tab 体系
			let tab: string = (parsed.rightPanelTab as string) ?? "git";
			if (tab === "changes") tab = "git";
			if (tab === "activity") tab = "terminal-log";
			if (tab === "context") tab = "git";
			if (tab === "file") tab = "session-changes";
			if (tab === "memory") tab = "git";
			return {
				leftPanelVisible: parsed.leftPanelVisible ?? true,
				rightPanelVisible: parsed.rightPanelVisible ?? true,
				terminalVisible: parsed.terminalVisible ?? false,
				rightPanelTab: tab as CodingLayoutState["rightPanelTab"],
				centerPanelMode: parsed.centerPanelMode ?? "chat",
			};
		}
	} catch {
		// ignore
	}
	return {
		leftPanelVisible: true,
		rightPanelVisible: true,
		terminalVisible: false,
		rightPanelTab: "git",
		centerPanelMode: "chat",
	};
}

class CodingWorkspaceStore {
	private state: CodingWorkspaceState = {
		projectPath: null,
		projectName: "",
		isGitRepo: false,
		fileTree: [],
		fileTreeLoading: false,
		gitStatus: null,
		gitBranches: [],
		gitHistory: [],
		contextFiles: [],
		layout: loadLayout(),
		recentProjects: loadRecentProjects(),
		selectedFilePath: null,
		selectedFilePreview: {
			path: null,
			content: "",
			truncated: false,
			loading: false,
			error: null,
		},
		fileSearchQuery: "",
		centerPanelTabs: [],
		activeCenterTabId: null,
	};

	private listeners = new Set<() => void>();

	getState = (): CodingWorkspaceState => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		for (const listener of this.listeners) listener();
	}

	private persistRecentProjects() {
		try {
			localStorage.setItem(
				RECENT_PROJECTS_KEY,
				JSON.stringify(this.state.recentProjects),
			);
		} catch {
			/* ignore */
		}
	}

	private persistLayout() {
		try {
			localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.state.layout));
		} catch {
			/* ignore */
		}
	}

	// === 项目管理 ===

	/** 打开一个项目目录 */
	openProject = (projectPath: string) => {
		const name = projectPath.split("/").pop() || projectPath;

		// 更新最近项目
		const filtered = this.state.recentProjects.filter(
			(p) => p.path !== projectPath,
		);
		const recentProjects = [
			{ path: projectPath, name, lastOpenedAt: Date.now() },
			...filtered,
		].slice(0, 10);

		this.state = {
			...this.state,
			projectPath,
			projectName: name,
			isGitRepo: false,
			fileTree: [],
			fileTreeLoading: true,
			gitStatus: null,
			gitBranches: [],
			gitHistory: [],
			contextFiles: [],
			recentProjects,
			selectedFilePath: null,
			selectedFilePreview: {
				path: null,
				content: "",
				truncated: false,
				loading: false,
				error: null,
			},
			fileSearchQuery: "",
			centerPanelTabs: [],
			activeCenterTabId: null,
		};

		this.persistRecentProjects();
		this.emit();
	};

	/** 关闭当前项目 */
	closeProject = () => {
		this.state = {
			...this.state,
			projectPath: null,
			projectName: "",
			isGitRepo: false,
			fileTree: [],
			fileTreeLoading: false,
			gitStatus: null,
			gitBranches: [],
			gitHistory: [],
			contextFiles: [],
			selectedFilePath: null,
			selectedFilePreview: {
				path: null,
				content: "",
				truncated: false,
				loading: false,
				error: null,
			},
			fileSearchQuery: "",
			centerPanelTabs: [],
			activeCenterTabId: null,
		};
		this.emit();
	};

	/** 移除最近项目记录 */
	removeRecentProject = (path: string) => {
		this.state = {
			...this.state,
			recentProjects: this.state.recentProjects.filter((p) => p.path !== path),
		};
		this.persistRecentProjects();
		this.emit();
	};

	// === 文件树 ===

	setFileTree = (tree: FileTreeNode[], isGitRepo: boolean) => {
		this.state = {
			...this.state,
			fileTree: tree,
			fileTreeLoading: false,
			isGitRepo,
		};
		this.emit();
	};

	setFileTreeLoading = (loading: boolean) => {
		this.state = { ...this.state, fileTreeLoading: loading };
		this.emit();
	};

	setSelectedFile = (filePath: string | null) => {
		this.state = {
			...this.state,
			selectedFilePath: filePath,
			selectedFilePreview: {
				path: filePath,
				content: "",
				truncated: false,
				loading: Boolean(filePath),
				error: null,
			},
		};
		this.emit();
	};

	setSelectedFilePreview = (input: {
		path: string;
		content: string;
		truncated: boolean;
	}) => {
		this.state = {
			...this.state,
			selectedFilePath: input.path,
			selectedFilePreview: {
				path: input.path,
				content: input.content,
				truncated: input.truncated,
				loading: false,
				error: null,
			},
		};
		this.emit();
	};

	setSelectedFilePreviewError = (path: string, error: string) => {
		this.state = {
			...this.state,
			selectedFilePath: path,
			selectedFilePreview: {
				path,
				content: "",
				truncated: false,
				loading: false,
				error,
			},
		};
		this.emit();
	};

	setFileSearchQuery = (query: string) => {
		this.state = { ...this.state, fileSearchQuery: query };
		this.emit();
	};

	// === Git ===

	setGitStatus = (status: GitStatusInfo | null) => {
		this.state = { ...this.state, gitStatus: status };
		this.emit();
	};

	setGitBranches = (branches: GitBranchInfo[]) => {
		this.state = { ...this.state, gitBranches: branches };
		this.emit();
	};

	setGitHistory = (history: GitCommitInfo[]) => {
		this.state = { ...this.state, gitHistory: history };
		this.emit();
	};

	// === 上下文文件 ===

	addContextFile = (file: ContextFile) => {
		if (this.state.contextFiles.some((f) => f.path === file.path)) return;
		this.state = {
			...this.state,
			contextFiles: [...this.state.contextFiles, file],
		};
		this.emit();
	};

	removeContextFile = (filePath: string) => {
		this.state = {
			...this.state,
			contextFiles: this.state.contextFiles.filter((f) => f.path !== filePath),
		};
		this.emit();
	};

	clearContextFiles = () => {
		this.state = { ...this.state, contextFiles: [] };
		this.emit();
	};

	// === 布局 ===

	toggleLeftPanel = () => {
		const layout = {
			...this.state.layout,
			leftPanelVisible: !this.state.layout.leftPanelVisible,
		};
		this.state = { ...this.state, layout };
		this.persistLayout();
		this.emit();
	};

	toggleRightPanel = () => {
		const layout = {
			...this.state.layout,
			rightPanelVisible: !this.state.layout.rightPanelVisible,
		};
		this.state = { ...this.state, layout };
		this.persistLayout();
		this.emit();
	};

	toggleTerminal = () => {
		const layout = {
			...this.state.layout,
			terminalVisible: !this.state.layout.terminalVisible,
		};
		this.state = { ...this.state, layout };
		this.persistLayout();
		this.emit();
	};

	setTerminalVisible = (visible: boolean) => {
		if (this.state.layout.terminalVisible === visible) return;
		const layout = { ...this.state.layout, terminalVisible: visible };
		this.state = { ...this.state, layout };
		this.persistLayout();
		this.emit();
	};

	setRightPanelTab = (tab: CodingLayoutState["rightPanelTab"]) => {
		if (this.state.layout.rightPanelTab === tab) return;
		const layout = {
			...this.state.layout,
			rightPanelTab: tab,
			rightPanelVisible: true,
		};
		this.state = { ...this.state, layout };
		this.persistLayout();
		this.emit();
	};

	// === 中间面板模式 ===

	setCenterPanelMode = (mode: CenterPanelMode) => {
		if (this.state.layout.centerPanelMode === mode) return;
		const layout = { ...this.state.layout, centerPanelMode: mode };
		this.state = { ...this.state, layout };
		this.persistLayout();
		this.emit();
	};

	// === 中间面板 Tab 系统 ===

	/** 在中间面板打开一个文件 Tab（已存在则激活，不存在则新建） */
	openCenterTab = (filePath: string, opts?: { highlightLine?: number }) => {
		const existing = this.state.centerPanelTabs.find(
			(t) => t.filePath === filePath,
		);
		if (existing) {
			// 已打开 → 激活，可更新高亮行
			const tabs =
				opts?.highlightLine != null
					? this.state.centerPanelTabs.map((t) =>
							t.id === existing.id
								? { ...t, highlightLine: opts.highlightLine }
								: t,
						)
					: this.state.centerPanelTabs;
			this.state = {
				...this.state,
				centerPanelTabs: tabs,
				activeCenterTabId: existing.id,
				layout: { ...this.state.layout, centerPanelMode: "codeViewer" },
			};
		} else {
			const fileName = filePath.split(/[\\/]/).pop() || filePath;
			const ext = fileName.includes(".")
				? fileName.split(".").pop()?.toLowerCase() || ""
				: "";
			const newTab: CenterPanelTab = {
				id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				filePath,
				fileName,
				language: ext,
				highlightLine: opts?.highlightLine,
			};
			this.state = {
				...this.state,
				centerPanelTabs: [...this.state.centerPanelTabs, newTab],
				activeCenterTabId: newTab.id,
				layout: { ...this.state.layout, centerPanelMode: "codeViewer" },
			};
		}
		this.persistLayout();
		this.emit();
	};

	/** 关闭一个中间面板 Tab */
	closeCenterTab = (tabId: string) => {
		const tabs = this.state.centerPanelTabs.filter((t) => t.id !== tabId);
		let activeId = this.state.activeCenterTabId;
		let mode = this.state.layout.centerPanelMode;

		if (activeId === tabId) {
			// 关闭的是当前激活的 tab：切换到相邻 tab 或回到 chat
			const closedIndex = this.state.centerPanelTabs.findIndex(
				(t) => t.id === tabId,
			);
			if (tabs.length > 0) {
				const newIdx = Math.min(closedIndex, tabs.length - 1);
				activeId = tabs[newIdx].id;
			} else {
				activeId = null;
				mode = "chat";
			}
		}

		this.state = {
			...this.state,
			centerPanelTabs: tabs,
			activeCenterTabId: activeId,
			layout: { ...this.state.layout, centerPanelMode: mode },
		};
		this.persistLayout();
		this.emit();
	};

	/** 激活一个已打开的 Tab */
	setActiveCenterTab = (tabId: string) => {
		if (this.state.activeCenterTabId === tabId) return;
		this.state = {
			...this.state,
			activeCenterTabId: tabId,
			layout: { ...this.state.layout, centerPanelMode: "codeViewer" },
		};
		this.emit();
	};

	/** 关闭所有中间面板 Tab，回到对话视图 */
	closeAllCenterTabs = () => {
		this.state = {
			...this.state,
			centerPanelTabs: [],
			activeCenterTabId: null,
			layout: { ...this.state.layout, centerPanelMode: "chat" },
		};
		this.persistLayout();
		this.emit();
	};
}

export const codingWorkspaceStore = new CodingWorkspaceStore();

/** Selector hook */
export function useCodingWorkspaceSelector<T>(
	selector: (state: CodingWorkspaceState) => T,
): T {
	const selectorRef = useRef(selector);
	const lastStateRef = useRef<CodingWorkspaceState | null>(null);
	const lastSelectedRef = useRef<T | null>(null);
	selectorRef.current = selector;

	const getSnapshot = useCallback(() => {
		const nextState = codingWorkspaceStore.getState();
		if (
			lastStateRef.current === nextState &&
			lastSelectedRef.current !== null
		) {
			return lastSelectedRef.current;
		}

		const nextSelected = selectorRef.current(nextState);
		lastStateRef.current = nextState;
		lastSelectedRef.current = nextSelected;
		return nextSelected;
	}, []);

	return useSyncExternalStore(
		codingWorkspaceStore.subscribe,
		getSnapshot,
		getSnapshot,
	);
}
