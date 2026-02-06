/**
 * 托管模式状态管理 - Managed Mode Store
 *
 * 管理托管模式的开关状态、沙盒文件列表、以及 UI 状态
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import { safeInvoke } from "./tauriBridge";

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
		/** 中间栏视图：运行图 / 预览 */
		centerView: "graph" | "preview";
		/** 预览视图模式：preview 渲染预览, source 源码 */
		previewMode: "preview" | "source";
		/** 运行图筛选 */
		graphFilter?: "all" | "running" | "error" | "artifact";
		/** 运行图搜索 */
		graphSearch?: string;
		/** 详情面板是否固定 */
		pinnedInspector?: boolean;
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
		centerView: "graph",
		previewMode: "preview",
		graphFilter: "all",
		graphSearch: "",
		pinnedInspector: false,
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
	if (
		[
			"tsx",
			"ts",
			"jsx",
			"js",
			"css",
			"scss",
			"html",
			"vue",
			"py",
			"go",
			"rs",
			"java",
			"c",
			"cpp",
			"h",
			"hpp",
			"swift",
			"kt",
			"rb",
			"php",
			"sh",
			"bash",
			"zsh",
			"fish",
			"ps1",
			"sql",
		].includes(ext)
	) {
		return "code";
	}

	// 图片类
	if (
		["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff"].includes(
			ext,
		)
	) {
		return "images";
	}

	// 数据类
	if (
		[
			"json",
			"csv",
			"xml",
			"yaml",
			"yml",
			"toml",
			"ini",
			"xlsx",
			"xls",
		].includes(ext)
	) {
		return "data";
	}

	return "other";
}

function shouldHideInternalSandboxFile(name: string): boolean {
	const n = String(name || "").trim();
	if (!n) return true;

	// 隐藏 SDK/运行时内部文件，减少“产物预览”噪音
	if (n.startsWith(".")) return true;
	if (/^settings\.js(\.|$)/i.test(n)) return true;
	if (/^\.?claude(\.|-|_)/i.test(n)) return true;
	return false;
}

function normalizeComparablePath(input: string): string {
	let value = String(input || "").trim();
	value = value.replace(/^file:\/\//i, "");
	value = value.replace(/^["'`<]+|["'`>]+$/g, "");
	value = value.split("#")[0]?.split("?")[0] || value;
	try {
		value = decodeURIComponent(value);
	} catch {}
	return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function shouldHideInternalSandboxPath(
	fullPath: string,
	sandboxDir: string,
): boolean {
	const normalizedFull = normalizeComparablePath(fullPath);
	const normalizedRoot = normalizeComparablePath(sandboxDir).replace(
		/\/+$/,
		"",
	);
	const rel = normalizedFull.startsWith(`${normalizedRoot}/`)
		? normalizedFull.slice(normalizedRoot.length + 1)
		: normalizedFull;
	const segments = rel.split("/").filter(Boolean);
	if (segments.length === 0) return true;

	// 任何隐藏目录都跳过
	if (segments.some((seg) => seg.startsWith("."))) return true;

	// 运行时内部目录
	if (
		segments.some(
			(seg) =>
				seg === "tool-results" || seg === "projects" || seg === "node_modules",
		)
	) {
		return true;
	}
	return false;
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
			ui: { ...s.ui, centerView: "graph" },
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
				files: s.files.map((f) => (f.id === id ? { ...f, isNew: false } : f)),
			}));
		}, 3000);

		return id;
	}

	/** 更新文件内容 */
	updateFile(fileId: string, updates: Partial<SandboxFile>) {
		this.setState((s) => ({
			...s,
			files: s.files.map((f) =>
				f.id === fileId ? { ...f, ...updates, modifiedAt: Date.now() } : f,
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

	/** 通过路径选择文件（用于从运行图/产物跳转） */
	selectFileByPath(filePath: string | null): string | null {
		const p =
			typeof filePath === "string" ? normalizeComparablePath(filePath) : "";
		if (!p) {
			this.selectFile(null);
			return null;
		}
		const files = this.state.files.filter((f) => f.type === "file");
		const exact = files.find((f) => normalizeComparablePath(f.path) === p);
		if (exact) {
			this.selectFile(exact.id);
			return exact.id;
		}

		// 兜底：上游可能传入 file://、带 query/hash 或仅文件名
		const targetName = p.split("/").filter(Boolean).pop() || "";
		if (targetName) {
			const byName = files.filter((f) => f.name === targetName);
			if (byName.length === 1) {
				this.selectFile(byName[0].id);
				return byName[0].id;
			}
		}

		return null;
	}

	/** 获取当前选中的文件 */
	getSelectedFile(): SandboxFile | null {
		return (
			this.state.files.find((f) => f.id === this.state.selectedFileId) || null
		);
	}

	/** 设置中间栏视图 */
	setCenterView(view: ManagedModeState["ui"]["centerView"]) {
		this.setState((s) => ({
			...s,
			ui: { ...s.ui, centerView: view },
		}));
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

	/** 设置运行图筛选 */
	setGraphFilter(filter: "all" | "running" | "error" | "artifact") {
		this.setState((s) => ({
			...s,
			ui: { ...s.ui, graphFilter: filter },
		}));
	}

	/** 设置运行图搜索 */
	setGraphSearch(query: string) {
		this.setState((s) => ({
			...s,
			ui: { ...s.ui, graphSearch: query },
		}));
	}

	/** 设置详情面板固定状态 */
	setPinnedInspector(pinned: boolean) {
		this.setState((s) => ({
			...s,
			ui: { ...s.ui, pinnedInspector: pinned },
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
				f.path.toLowerCase().includes(query),
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

	/** 扫描沙盒目录并同步文件列表（不读取文件内容，提高性能） */
	async scanSandboxDir(sandboxDir: string) {
		if (!sandboxDir) return;

		try {
			// 获取目录下的所有文件
			const entries = await safeInvoke<
				Array<{
					path: string;
					name: string;
					is_file: boolean;
					is_dir: boolean;
					size?: number;
					modified_at?: number;
				}>
			>("list_files_safe", {
				payload: {
					path: sandboxDir,
					recursive: true,
				},
			});

			if (!entries || !Array.isArray(entries)) return;

			// 获取现有文件路径集合，用于检测新文件，并保留已有缓存内容
			const previousFileByPath = new Map(
				this.state.files.map((f) => [normalizeComparablePath(f.path), f]),
			);

			// 转换为 SandboxFile 格式（不读取内容，提高性能）
			const newFiles: SandboxFile[] = [];

			for (const entry of entries) {
				if (!entry.is_file) continue; // 跳过目录

				// 确保文件路径以 sandboxDir 开头（过滤非法文件）
				if (!entry.path.startsWith(sandboxDir)) continue;
				if (shouldHideInternalSandboxPath(entry.path, sandboxDir)) continue;
				const normalizedPath = normalizeComparablePath(entry.path);
				const previous = previousFileByPath.get(normalizedPath);

				const name = entry.name || entry.path.split("/").pop() || "file";
				if (shouldHideInternalSandboxFile(name)) continue;
				const ext = name.includes(".") ? name.split(".").pop() || "" : "";
				const category = categorizeFile(name);
				const mimeType = getMimeType(name);
				const isNew = !previous;

				// 不在扫描时读取内容，改为选择文件时再读取（懒加载）
				newFiles.push({
					id: `file:${normalizedPath}`,
					name,
					path: entry.path,
					type: "file",
					extension: ext,
					size: entry.size || 0,
					// 复用已读取内容，避免周期扫描后预览丢失
					content: previous?.content,
					mimeType,
					createdAt: entry.modified_at || Date.now(),
					modifiedAt: entry.modified_at || Date.now(),
					isNew,
					category,
				});
			}

			// 更新状态
			const nextIds = new Set(newFiles.map((f) => f.id));
			this.setState((s) => ({
				...s,
				files: newFiles,
				selectedFileId:
					s.selectedFileId && nextIds.has(s.selectedFileId)
						? s.selectedFileId
						: null,
			}));

			// 3秒后移除所有 isNew 标记
			setTimeout(() => {
				this.setState((s) => ({
					...s,
					files: s.files.map((f) => ({ ...f, isNew: false })),
				}));
			}, 3000);
		} catch (error) {
			console.error("[ManagedModeStore] Failed to scan sandbox dir:", error);
		}
	}

	/** 懒加载文件内容 */
	async loadFileContent(fileId: string): Promise<string | undefined> {
		const file = this.state.files.find((f) => f.id === fileId);
		if (!file) return undefined;

		// 如果已经加载过，直接返回
		if (file.content !== undefined) return file.content;

		try {
			const result = await safeInvoke<{
				content: string;
				encoding: string;
			}>("read_file_safe", {
				payload: { path: file.path },
			});

			if (result?.content) {
				// 更新文件内容到 store
				this.setState((s) => ({
					...s,
					files: s.files.map((f) =>
						f.id === fileId ? { ...f, content: result.content } : f,
					),
				}));
				return result.content;
			}
		} catch (error) {
			console.error("[ManagedModeStore] Failed to load file content:", error);
		}
		return undefined;
	}

	/** 设置沙盒目录并开始监听 */
	setSandboxDir(sandboxDir: string | null) {
		if (sandboxDir) {
			// 立即扫描一次
			this.scanSandboxDir(sandboxDir);
		}
	}

	/** 保存产物到沙盒目录 */
	async saveArtifact(
		sandboxDir: string,
		content: string,
		type: "html" | "react" | "other",
		title?: string,
	): Promise<string | null> {
		if (!sandboxDir || !content) return null;

		try {
			// 生成文件名
			const timestamp = Date.now();
			const ext = type === "html" ? "html" : type === "react" ? "jsx" : "txt";
			const baseName = title
				? title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").slice(0, 30)
				: `artifact_${timestamp}`;
			const fileName = `${baseName}.${ext}`;
			const filePath = `${sandboxDir}/${fileName}`;

			// 写入文件到沙盒
			await safeInvoke<{ success: boolean }>("write_file_safe", {
				payload: {
					path: filePath,
					content: content,
					encoding: "utf-8",
					create_dirs: true,
				},
			});

			console.log("[ManagedModeStore] Artifact saved to:", filePath);

			// 同时保存到数据库（用于产物管理统计）
			try {
				// 从 sandboxDir 提取 session_id（格式：xxx/agent-sandboxes/{session_id}）
				const sessionId = sandboxDir.split("/").pop() || `session_${timestamp}`;
				await safeInvoke("artifact_save", {
					session_id: sessionId,
					file_name: fileName,
					content: content,
					encoding: "utf-8",
					description: `${type} artifact: ${title || fileName}`,
				});
				console.log("[ManagedModeStore] Artifact saved to database");
			} catch (dbError) {
				console.warn(
					"[ManagedModeStore] Failed to save artifact to database:",
					dbError,
				);
			}

			// 刷新文件列表
			await this.scanSandboxDir(sandboxDir);

			// 自动选中新文件
			const newFile = this.state.files.find((f) => f.path === filePath);
			if (newFile) {
				this.selectFile(newFile.id);
			}

			return filePath;
		} catch (error) {
			console.error("[ManagedModeStore] Failed to save artifact:", error);
			return null;
		}
	}
}

// ==================== 导出单例 ====================

export const managedModeStore = new ManagedModeStore();

// ==================== React Hook ====================

export function useManagedModeStore() {
	const state = useSyncExternalStore(
		managedModeStore.subscribe,
		managedModeStore.getState,
	);

	return {
		...state,
		store: managedModeStore,
	};
}

// Selector Hook - 允许组件只订阅需要的状态字段，减少不必要的重渲染
export function useManagedModeStoreSelector<T>(
	selector: (state: ManagedModeState) => T,
): T {
	const selectorRef = useRef(selector);
	selectorRef.current = selector;

	const getSnapshot = useCallback(
		() => selectorRef.current(managedModeStore.getState()),
		[],
	);

	return useSyncExternalStore(
		managedModeStore.subscribe,
		getSnapshot,
		getSnapshot,
	);
}
