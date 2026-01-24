/**
 * 托管模式状态管理 - Managed Mode Store
 * 
 * 管理托管模式的开关状态、沙盒文件列表、以及 UI 状态
 */

import { useSyncExternalStore } from "react";

// ==================== 类型定义 ====================

/** 文件类型分类 */
export type FileCategory = "docs" | "code" | "images" | "data" | "other";

/** 沙盒文件 */
export interface SandboxFile {
	id: string;
	name: string;
	path: string;
	type: "file" | "folder";
	extension: string;
	size: number;
	content?: string;
	mimeType: string;
	createdAt: number;
	modifiedAt: number;
	/** 标记新生成的文件（用于高亮动画） */
	isNew?: boolean;
	/** 文件分类 */
	category: FileCategory;
	/** 子文件（如果是文件夹） */
	children?: SandboxFile[];
}

/** 分组后的文件树 */
export interface SandboxFileTree {
	docs: SandboxFile[];
	code: SandboxFile[];
	images: SandboxFile[];
	data: SandboxFile[];
	other: SandboxFile[];
}

/** 托管模式状态 */
export interface ManagedModeState {
	/** 是否启用托管模式 */
	isActive: boolean;
	
	/** 沙盒文件列表 */
	files: SandboxFile[];
	
	/** 当前选中的文件 ID */
	selectedFileId: string | null;
	
	/** UI 状态 */
	ui: {
		/** 展开的文件夹 ID 列表 */
		expandedFolders: Set<string>;
		/** 搜索关键词 */
		searchQuery: string;
		/** 预览视图模式：preview 渲染预览, source 源码 */
		previewMode: "preview" | "source";
	};
}

// ==================== 初始状态 ====================

const initialState: ManagedModeState = {
	isActive: false,
	files: [],
	selectedFileId: null,
	ui: {
		expandedFolders: new Set(["docs", "code", "images", "data", "other"]),
		searchQuery: "",
		previewMode: "preview",
	},
};

// ==================== 辅助函数 ====================

/** 根据文件扩展名推断分类 */
export function categorizeFile(filename: string): FileCategory {
	const ext = filename.toLowerCase().split(".").pop() || "";
	
	// 文档类
	if (["md", "markdown", "txt", "pdf", "docx", "doc", "rtf"].includes(ext)) {
		return "docs";
	}
	
	// 代码类
	if (["tsx", "ts", "jsx", "js", "css", "scss", "html", "vue", "py", "go", "rs", "java", "c", "cpp", "h", "hpp", "swift", "kt", "rb", "php", "sh", "bash", "zsh", "fish", "ps1", "sql"].includes(ext)) {
		return "code";
	}
	
	// 图片类
	if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff"].includes(ext)) {
		return "images";
	}
	
	// 数据类
	if (["json", "csv", "xml", "yaml", "yml", "toml", "ini", "xlsx", "xls"].includes(ext)) {
		return "data";
	}
	
	return "other";
}

/** 根据文件扩展名获取 MIME 类型 */
export function getMimeType(filename: string): string {
	const ext = filename.toLowerCase().split(".").pop() || "";
	
	const mimeMap: Record<string, string> = {
		// 文档
		md: "text/markdown",
		txt: "text/plain",
		pdf: "application/pdf",
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		
		// 代码
		tsx: "text/typescript-jsx",
		ts: "text/typescript",
		jsx: "text/javascript-jsx",
		js: "text/javascript",
		css: "text/css",
		html: "text/html",
		json: "application/json",
		
		// 图片
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		svg: "image/svg+xml",
		webp: "image/webp",
		
		// 数据
		csv: "text/csv",
		xml: "application/xml",
		yaml: "text/yaml",
		yml: "text/yaml",
	};
	
	return mimeMap[ext] || "application/octet-stream";
}

/** 获取文件图标 */
export function getFileIcon(file: SandboxFile): string {
	if (file.type === "folder") return "📁";
	
	const ext = file.extension.toLowerCase();
	
	const iconMap: Record<string, string> = {
		// 文档
		md: "📄",
		txt: "📝",
		pdf: "📕",
		docx: "📘",
		doc: "📘",
		
		// 代码
		tsx: "⚛️",
		ts: "📘",
		jsx: "⚛️",
		js: "📜",
		css: "🎨",
		html: "🌐",
		vue: "💚",
		py: "🐍",
		rs: "🦀",
		go: "🐹",
		
		// 图片
		png: "🖼️",
		jpg: "🖼️",
		jpeg: "🖼️",
		svg: "🎨",
		gif: "🎞️",
		
		// 数据
		json: "⚙️",
		csv: "📊",
		xml: "📋",
		yaml: "📋",
		yml: "📋",
	};
	
	return iconMap[ext] || "📄";
}

/** 将文件列表按分类分组 */
export function groupFilesByCategory(files: SandboxFile[]): SandboxFileTree {
	const tree: SandboxFileTree = {
		docs: [],
		code: [],
		images: [],
		data: [],
		other: [],
	};
	
	for (const file of files) {
		if (file.type === "folder") continue; // 暂时跳过文件夹
		
		const category = file.category || categorizeFile(file.name);
		tree[category].push(file);
	}
	
	// 按名称排序
	for (const category of Object.keys(tree) as FileCategory[]) {
		tree[category].sort((a, b) => a.name.localeCompare(b.name));
	}
	
	return tree;
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ==================== Store 实现 ====================

class ManagedModeStore {
	private state: ManagedModeState = initialState;
	private listeners: Set<() => void> = new Set();
	
	getState = () => this.state;
	
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	
	private emit() {
		for (const listener of this.listeners) {
			listener();
		}
	}
	
	private setState(updater: (state: ManagedModeState) => ManagedModeState) {
		this.state = updater(this.state);
		this.emit();
	}
	
	// ========== 模式控制 ==========
	
	/** 启用托管模式 */
	enableManagedMode() {
		this.setState((s) => ({
			...s,
			isActive: true,
		}));
	}
	
	/** 禁用托管模式 */
	disableManagedMode() {
		this.setState((s) => ({
			...s,
			isActive: false,
			selectedFileId: null,
		}));
	}
	
	/** 切换托管模式 */
	toggleManagedMode() {
		if (this.state.isActive) {
			this.disableManagedMode();
		} else {
			this.enableManagedMode();
		}
	}
	
	// ========== 文件管理 ==========
	
	/** 添加文件到沙盒 */
	addFile(file: Omit<SandboxFile, "id" | "category" | "isNew">) {
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const category = categorizeFile(file.name);
		
		const newFile: SandboxFile = {
			...file,
			id,
			category,
			isNew: true,
		};
		
		this.setState((s) => ({
			...s,
			files: [...s.files, newFile],
		}));
		
		// 3秒后移除 isNew 标记
		setTimeout(() => {
			this.setState((s) => ({
				...s,
				files: s.files.map((f) =>
					f.id === id ? { ...f, isNew: false } : f
				),
			}));
		}, 3000);
		
		return id;
	}
	
	/** 更新文件内容 */
	updateFile(fileId: string, updates: Partial<SandboxFile>) {
		this.setState((s) => ({
			...s,
			files: s.files.map((f) =>
				f.id === fileId ? { ...f, ...updates, modifiedAt: Date.now() } : f
			),
		}));
	}
	
	/** 删除文件 */
	removeFile(fileId: string) {
		this.setState((s) => ({
			...s,
			files: s.files.filter((f) => f.id !== fileId),
			selectedFileId: s.selectedFileId === fileId ? null : s.selectedFileId,
		}));
	}
	
	/** 清空所有文件 */
	clearFiles() {
		this.setState((s) => ({
			...s,
			files: [],
			selectedFileId: null,
		}));
	}
	
	/** 批量设置文件 */
	setFiles(files: SandboxFile[]) {
		this.setState((s) => ({
			...s,
			files,
		}));
	}
	
	// ========== 选择和 UI ==========
	
	/** 选择文件 */
	selectFile(fileId: string | null) {
		this.setState((s) => ({
			...s,
			selectedFileId: fileId,
		}));
	}
	
	/** 获取当前选中的文件 */
	getSelectedFile(): SandboxFile | null {
		return this.state.files.find((f) => f.id === this.state.selectedFileId) || null;
	}
	
	/** 切换文件夹展开状态 */
	toggleFolderExpanded(folderId: string) {
		this.setState((s) => {
			const newExpanded = new Set(s.ui.expandedFolders);
			if (newExpanded.has(folderId)) {
				newExpanded.delete(folderId);
			} else {
				newExpanded.add(folderId);
			}
			return {
				...s,
				ui: { ...s.ui, expandedFolders: newExpanded },
			};
		});
	}
	
	/** 设置搜索关键词 */
	setSearchQuery(query: string) {
		this.setState((s) => ({
			...s,
			ui: { ...s.ui, searchQuery: query },
		}));
	}
	
	/** 设置预览模式 */
	setPreviewMode(mode: "preview" | "source") {
		this.setState((s) => ({
			...s,
			ui: { ...s.ui, previewMode: mode },
		}));
	}
	
	// ========== 便捷查询 ==========
	
	/** 获取分组后的文件树 */
	getFileTree(): SandboxFileTree {
		return groupFilesByCategory(this.state.files);
	}
	
	/** 根据搜索词过滤文件 */
	getFilteredFiles(): SandboxFile[] {
		const query = this.state.ui.searchQuery.toLowerCase().trim();
		if (!query) return this.state.files;
		
		return this.state.files.filter(
			(f) =>
				f.name.toLowerCase().includes(query) ||
				f.path.toLowerCase().includes(query)
		);
	}
	
	/** 获取文件总数 */
	getFileCount(): number {
		return this.state.files.filter((f) => f.type === "file").length;
	}
	
	/** 重置状态 */
	reset() {
		this.state = initialState;
		this.emit();
	}
}

// ==================== 导出单例 ====================

export const managedModeStore = new ManagedModeStore();

// ==================== React Hook ====================

export function useManagedModeStore() {
	const state = useSyncExternalStore(
		managedModeStore.subscribe,
		managedModeStore.getState
	);
	
	return {
		...state,
		store: managedModeStore,
	};
}
