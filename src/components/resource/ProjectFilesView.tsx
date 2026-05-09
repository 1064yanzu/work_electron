import { useEffect, useState, useCallback } from "react";
import {
	ChevronDown,
	ChevronRight,
	File,
	Folder,
	FolderOpen,
	RefreshCcw,
} from "lucide-react";
import { safeInvoke } from "../../lib/tauriBridge";
import { useWorkspaceStoreSelector } from "../../lib/workspaceStore";
import { managedModeStore, getMimeType } from "../../lib/managedModeStore";
import { cn } from "../../lib/utils";
import { toast } from "../ui/Toast";
import { isBinaryPreviewFile } from "../editor/FileTypePreview";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import {
	buildFileItemContextMenu,
	buildFolderItemContextMenu,
} from "../../lib/contextMenu/actions";
import { isReaderSupportedFile } from "../../lib/reader/formats";
import { readerImportFiles } from "../../lib/api/reader";
import { openReader } from "../reader/ReaderApp";

interface FileEntry {
	path: string;
	name: string;
	isDir: boolean;
	size?: number;
	mtimeMs?: number;
}

// 阅读器支持但本地编辑器/二进制预览也能打开的"轻量"文本格式，
// 这些不需要导入资料库即可在编辑器里直接看。
function isTextLikeReaderFile(fileName: string): boolean {
	return /\.(txt|log|md|markdown|html|htm|xhtml)$/i.test(fileName);
}

export function ProjectFilesView() {
	const [entries, setEntries] = useState<FileEntry[]>([]);
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		entry: FileEntry;
	} | null>(null);
	const projectPath = useWorkspaceStoreSelector(
		(state) => state.currentThreadPath,
	);
	// 初始挂载若已有路径，直接进入 loading，避免闪现"文件夹为空"
	const [isLoading, setIsLoading] = useState(Boolean(projectPath));
	const [lastLoadedPath, setLastLoadedPath] = useState<string | null>(
		projectPath,
	);

	// 同步派生：projectPath 变化时进入 loading 并重置展开状态。
	// 注意：不清空 entries，保留旧内容直到新内容加载完成，避免短暂闪烁/空白。
	if (projectPath !== lastLoadedPath) {
		setLastLoadedPath(projectPath);
		setExpandedDirs(new Set());
		setIsLoading(Boolean(projectPath));
		if (!projectPath) {
			setEntries([]);
		}
	}

	const loadDir = useCallback(async (dirPath: string) => {
		try {
			const res = await safeInvoke<any[]>("list_files_safe", { path: dirPath });
			// Folders first
			const mapped = res.map((r) => ({
				path: r.path,
				name: r.name,
				isDir: r.is_dir,
				size: r.size,
				mtimeMs: r.mtime_ms,
			}));
			return mapped.sort((a, b) => {
				if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
				return a.isDir ? -1 : 1;
			});
		} catch (e) {
			console.error("Failed to read dir:", dirPath, e);
			return [];
		}
	}, []);

	const refreshRoot = useCallback(async () => {
		if (!projectPath) return;
		setIsLoading(true);
		const rootEntries = await loadDir(projectPath);
		setEntries(rootEntries);
		setIsLoading(false);
	}, [projectPath, loadDir]);

	useEffect(() => {
		if (!projectPath) {
			setIsLoading(false);
			return;
		}
		let cancelled = false;
		void loadDir(projectPath).then((rootEntries) => {
			if (cancelled) return;
			setEntries(rootEntries);
			setIsLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [projectPath, loadDir]);

	const openInReader = useCallback(
		async (entry: FileEntry, options: { silent: boolean }) => {
			setIsLoading(true);
			try {
				const books = await readerImportFiles({
					paths: [entry.path],
					silent: options.silent,
				});
				const book = books[0];
				if (!book) {
					toast.error("无法解析该文件，请确认格式与编码");
					return;
				}
				openReader(book.id);
				if (!options.silent) {
					toast.success("已加入资料库");
				}
			} catch (e) {
				console.error("Failed to open in reader:", entry.path, e);
				toast.error("打开阅读器失败");
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	const toggleDir = async (entry: FileEntry) => {
		if (entry.isDir) {
			setExpandedDirs((prev) => {
				const next = new Set(prev);
				if (next.has(entry.path)) {
					next.delete(entry.path);
				} else {
					next.add(entry.path);
				}
				return next;
			});
			return;
		}

		// 阅读器支持的格式（PDF / EPUB / MOBI / AZW3 / DOCX / CBZ 等）：
		// 默认双击 = 在阅读器里"瞬态打开"，不写 sources/notes（不进资料库）。
		// 用户如果想入库，从右键菜单选"在阅读器中打开（导入资料库）"。
		// TXT / MD / HTML 等纯文本类不走阅读器，留给编辑器预览，避免轻量文本被入库。
		if (
			isReaderSupportedFile(entry.name) &&
			!isTextLikeReaderFile(entry.name)
		) {
			void openInReader(entry, { silent: true });
			return;
		}

		// 在托管模式预览中打开文件
		const existing = managedModeStore
			.getState()
			.files.find((f) => f.path === entry.path);
		if (existing) {
			managedModeStore.selectFile(existing.id);
		} else {
			const ext = entry.name.split(".").pop() || "";
			let content = "";
			if (!isBinaryPreviewFile(entry.name)) {
				try {
					const res = await safeInvoke<{
						content: string;
						encoding: string;
					}>("read_file_safe", { payload: { path: entry.path } });
					content = res.content;
				} catch (e) {
					console.error("Failed to read file:", entry.path, e);
					toast.error("无法读取文件内容");
					return;
				}
			}
			const fileId = managedModeStore.addFile({
				name: entry.name,
				path: entry.path,
				type: "file",
				extension: ext,
				size: entry.size ?? 0,
				content,
				mimeType: getMimeType(entry.name),
				createdAt: Date.now(),
				modifiedAt: entry.mtimeMs ?? Date.now(),
			});
			managedModeStore.selectFile(fileId);
		}
		managedModeStore.setCenterView("preview");
	};

	const handleFileContextMenu = useCallback(
		(e: React.MouseEvent, entry: FileEntry) => {
			e.preventDefault();
			e.stopPropagation();
			setContextMenu({ x: e.clientX, y: e.clientY, entry });
		},
		[],
	);

	const contextMenuItems: ContextMenuItem[] = contextMenu
		? contextMenu.entry.isDir
			? buildFolderItemContextMenu({
					onCreateFile: () => {
						toast.info("暂不支持在此处新建文件");
					},
					onCreateSubFolder: () => {
						toast.info("暂不支持在此处新建文件夹");
					},
					onRename: () => {
						toast.info("暂不支持在此处重命名");
					},
					onMove: () => {
						toast.info("暂不支持在此处移动");
					},
					onReveal: () => {
						void safeInvoke("reveal_file_safe", {
							path: contextMenu.entry.path,
						});
					},
					onDelete: () => {
						toast.info("暂不支持在此处删除文件夹");
					},
				})
			: buildFileItemContextMenu({
					onOpen: () => {
						void toggleDir(contextMenu.entry);
					},
					onOpenInReader: isReaderSupportedFile(contextMenu.entry.name)
						? () => {
								void openInReader(contextMenu.entry, { silent: false });
							}
						: undefined,
					onCopyPath: () => {
						void navigator.clipboard.writeText(contextMenu.entry.path);
						toast.success("路径已复制");
					},
					onReveal: () => {
						void safeInvoke("reveal_file_safe", {
							path: contextMenu.entry.path,
						});
					},
				})
		: [];

	const renderTree = (items: FileEntry[], level = 0) => {
		return items.map((item) => {
			const isExpanded = expandedDirs.has(item.path);

			return (
				<div key={item.path}>
					<button
						onClick={() => toggleDir(item)}
						onContextMenu={(e) => handleFileContextMenu(e, item)}
						className={cn(
							"flex items-center w-full px-2 py-1.5 text-left group hover:bg-warm-200/50 transition-colors",
							level === 0 ? "text-[13px]" : "text-[13px]",
						)}
						style={{ paddingLeft: `${Math.max(0.5, level * 0.75 + 0.5)}rem` }}
					>
						<span className="w-4 h-4 mr-1 flex items-center justify-center shrink-0 text-text-light group-hover:text-text-secondary dark:group-hover:text-text-light">
							{item.isDir ? (
								isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5" />
								) : (
									<ChevronRight className="w-3.5 h-3.5" />
								)
							) : (
								<span className="w-1.5" />
							)}
						</span>
						<span className="mr-2 shrink-0 text-text-light group-hover:text-text-muted">
							{item.isDir ? (
								isExpanded ? (
									<FolderOpen className="w-4 h-4 text-[#D96C46]/80" />
								) : (
									<Folder className="w-4 h-4 text-[#D96C46]/80" />
								)
							) : (
								<File className="w-4 h-4 text-text-light" />
							)}
						</span>
						<span
							className={cn(
								"truncate",
								item.isDir
									? "text-text-primary dark:text-zinc-200"
									: "text-text-secondary",
							)}
						>
							{item.name}
						</span>
					</button>

					{item.isDir && isExpanded && (
						<DirChildrenLoader
							dirPath={item.path}
							loadDir={loadDir}
							renderTree={(children) => renderTree(children, level + 1)}
						/>
					)}
				</div>
			);
		});
	};

	return (
		<div className="flex flex-col h-full bg-transparent">
			{/* Header */}
			<div className="px-6 py-5 flex items-center justify-between shrink-0 mb-2 border-b border-border dark:border-white/[0.05]">
				<h2 className="font-semibold text-[13px] text-text-muted uppercase tracking-widest">
					Files
				</h2>
				<button
					onClick={refreshRoot}
					className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-black/5 dark:hover:bg-surface/10 rounded-lg transition-colors"
					title="Refresh"
				>
					<RefreshCcw
						className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
					/>
				</button>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto scrollbar-hide py-2">
				{projectPath === null ? (
					<div className="text-center py-10 px-6 mt-10">
						<Folder className="w-10 h-10 text-text-light mx-auto mb-4" />
						<p className="text-sm text-text-muted font-medium">无工作路径</p>
						<p className="text-xs text-text-light mt-2">
							请先到线程列表中选择或创建一个线程
						</p>
					</div>
				) : isLoading && entries.length === 0 ? (
					<div className="text-center py-10 px-6 mt-10">
						<RefreshCcw className="w-5 h-5 text-text-light mx-auto mb-3 animate-spin" />
						<p className="text-xs text-text-light">加载中…</p>
					</div>
				) : entries.length === 0 ? (
					<div className="text-center py-10 px-6 mt-10">
						<p className="text-sm text-text-muted font-medium">文件夹为空</p>
					</div>
				) : (
					<div className="pb-6">{renderTree(entries, 0)}</div>
				)}
			</div>

			{/* 右键菜单 */}
			{contextMenu && contextMenuItems.length > 0 && (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}

// 延迟加载子目录组件
function DirChildrenLoader({
	dirPath,
	loadDir,
	renderTree,
}: {
	dirPath: string;
	loadDir: (path: string) => Promise<FileEntry[]>;
	renderTree: (items: FileEntry[]) => React.ReactNode;
}) {
	const [children, setChildren] = useState<FileEntry[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		loadDir(dirPath).then((res) => {
			if (!cancelled) {
				setChildren(res);
				setLoaded(true);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [dirPath, loadDir]);

	if (!loaded) {
		return (
			<div className="pl-6 py-1.5 text-[11px] text-text-light/50 animate-pulse">
				Loading...
			</div>
		);
	}

	return <>{renderTree(children)}</>;
}
