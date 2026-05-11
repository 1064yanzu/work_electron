import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { safeInvoke } from "../../../lib/tauriBridge";
import { useWorkspaceStoreSelector } from "../../../lib/workspaceStore";
import { managedModeStore, getMimeType } from "../../../lib/managedModeStore";
import { sandboxEditorStore } from "../../../lib/sandboxEditorStore";
import { chatStore, useChatStoreSelector } from "../../../lib/chat/store";
import {
	createThreadSessionForPath,
	DEFAULT_THREAD_MODEL,
} from "../../../lib/chat/threadSessions";
import { settingsStore } from "../../../lib/settingsStore";
import { pickSystemDirectory } from "../../../lib/api/storage";
import { isReaderSupportedFile } from "../../../lib/reader/formats";
import { readerImportFiles } from "../../../lib/api/reader";
import { openReader } from "../../reader/ReaderApp";
import { isBinaryPreviewFile } from "../../editor/FileTypePreview";
import { ContextMenu, type ContextMenuItem } from "../../ui/ContextMenu";
import { toast } from "../../ui/Toast";
import { FileTreeHeader } from "./FileTreeHeader";
import { FileTreeEmptyState } from "./FileTreeEmptyState";
import { FileTreeNode, InlineCreateRow, type FileEntry } from "./FileTreeNode";
import { useFileTreeMutations } from "./useFileTreeMutations";

type EditingState =
	| { mode: "rename"; targetPath: string }
	| {
			mode: "create";
			parentPath: string;
			level: number;
			type: "file" | "folder";
	  };

function isTextLikeReaderFile(fileName: string): boolean {
	return /\.(txt|log|md|markdown|html|htm|xhtml)$/i.test(fileName);
}

function sortEntries(items: FileEntry[]): FileEntry[] {
	return [...items].sort((a, b) => {
		if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
		return a.isDir ? -1 : 1;
	});
}

function findEntryByPath(
	cache: Map<string, FileEntry[]>,
	path: string,
): FileEntry | null {
	for (const items of cache.values()) {
		const found = items.find((it) => it.path === path);
		if (found) return found;
	}
	return null;
}

export function ProjectFilesView() {
	const projectPath = useWorkspaceStoreSelector(
		(state) => state.currentThreadPath,
	);
	const activeSessionId = useChatStoreSelector((s) => s.activeSessionId);

	const [entriesByDir, setEntriesByDir] = useState<Map<string, FileEntry[]>>(
		new Map(),
	);
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [editing, setEditing] = useState<EditingState | null>(null);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		entry: FileEntry | null;
	} | null>(null);
	const [isLoadingRoot, setIsLoadingRoot] = useState(Boolean(projectPath));
	const [lastLoadedPath, setLastLoadedPath] = useState<string | null>(
		projectPath,
	);
	const containerRef = useRef<HTMLDivElement>(null);

	// 路径切换：清空所有缓存与编辑态
	if (projectPath !== lastLoadedPath) {
		setLastLoadedPath(projectPath);
		setEntriesByDir(new Map());
		setExpandedDirs(new Set());
		setSelectedPath(null);
		setEditing(null);
		setIsLoadingRoot(Boolean(projectPath));
	}

	const loadDir = useCallback(async (dirPath: string) => {
		try {
			const res = await safeInvoke<
				Array<{
					path: string;
					name: string;
					is_dir: boolean;
					size?: number;
					mtime_ms?: number;
				}>
			>("list_files_safe", { path: dirPath });
			const mapped: FileEntry[] = res.map((r) => ({
				path: r.path,
				name: r.name,
				isDir: r.is_dir,
				size: r.size,
				mtimeMs: r.mtime_ms,
			}));
			const sorted = sortEntries(mapped);
			setEntriesByDir((prev) => {
				const next = new Map(prev);
				next.set(dirPath, sorted);
				return next;
			});
			return sorted;
		} catch (e) {
			console.error("[ProjectFilesView] Failed to read dir:", dirPath, e);
			return [];
		}
	}, []);

	useEffect(() => {
		if (!projectPath) {
			setIsLoadingRoot(false);
			return;
		}
		let cancelled = false;
		void loadDir(projectPath).then(() => {
			if (!cancelled) setIsLoadingRoot(false);
		});
		return () => {
			cancelled = true;
		};
	}, [projectPath, loadDir]);

	const refreshDir = useCallback(
		(dirPath: string) => {
			void loadDir(dirPath);
		},
		[loadDir],
	);

	const mutations = useFileTreeMutations(refreshDir);

	const refreshRoot = useCallback(async () => {
		if (!projectPath) return;
		setIsLoadingRoot(true);
		await loadDir(projectPath);
		setIsLoadingRoot(false);
	}, [projectPath, loadDir]);

	const collapseAll = useCallback(() => {
		setExpandedDirs(new Set());
	}, []);

	const openInReader = useCallback(
		async (entry: FileEntry, options: { silent: boolean }) => {
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
				if (!options.silent) toast.success("已加入资料库");
			} catch (e) {
				console.error("[ProjectFilesView] Failed to open in reader:", e);
				toast.error("打开阅读器失败");
			}
		},
		[],
	);

	const openInPreview = useCallback(
		async (entry: FileEntry) => {
			const existing = managedModeStore
				.getState()
				.files.find((f) => f.path === entry.path);
			let fileId: string;
			let fileContent = "";
			if (existing) {
				managedModeStore.selectFile(existing.id);
				fileId = existing.id;
				fileContent = existing.content ?? "";
			} else {
				const ext = entry.name.split(".").pop() || "";
				if (!isBinaryPreviewFile(entry.name)) {
					try {
						const res = await safeInvoke<{
							content: string;
							encoding: string;
						}>("read_file_safe", { payload: { path: entry.path } });
						fileContent = res.content;
					} catch (e) {
						console.error("[ProjectFilesView] Failed to read file:", e);
						toast.error("无法读取文件内容");
						return;
					}
				}
				fileId = managedModeStore.addFile({
					name: entry.name,
					path: entry.path,
					type: "file",
					extension: ext,
					size: entry.size ?? 0,
					content: fileContent,
					mimeType: getMimeType(entry.name),
					createdAt: Date.now(),
					modifiedAt: entry.mtimeMs ?? Date.now(),
				});
				managedModeStore.selectFile(fileId);
			}
			// 把文件登记为可编辑标签页：(1) 解除 Monaco 只读；(2) 中间栏多 tab 栏可见
			const ext = entry.name.split(".").pop() || "";
			const root = projectPath;
			let relPath = entry.path;
			if (root && entry.path.startsWith(root)) {
				relPath = entry.path.slice(root.length).replace(/^[\\/]+/, "");
			}
			sandboxEditorStore.openFile(
				fileId,
				entry.path,
				relPath,
				entry.name,
				ext,
				fileContent || undefined,
			);
			managedModeStore.setCenterView("preview");
		},
		[projectPath],
	);

	const handleToggleOrOpen = useCallback(
		async (entry: FileEntry) => {
			if (entry.isDir) {
				setExpandedDirs((prev) => {
					const next = new Set(prev);
					if (next.has(entry.path)) {
						next.delete(entry.path);
					} else {
						next.add(entry.path);
						if (!entriesByDir.has(entry.path)) {
							void loadDir(entry.path);
						}
					}
					return next;
				});
				return;
			}

			if (
				isReaderSupportedFile(entry.name) &&
				!isTextLikeReaderFile(entry.name)
			) {
				void openInReader(entry, { silent: true });
				return;
			}
			void openInPreview(entry);
		},
		[entriesByDir, loadDir, openInReader, openInPreview],
	);

	const handleSelect = useCallback((entry: FileEntry) => {
		setSelectedPath(entry.path);
	}, []);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent, entry: FileEntry | null) => {
			e.preventDefault();
			e.stopPropagation();
			setContextMenu({ x: e.clientX, y: e.clientY, entry });
			if (entry) setSelectedPath(entry.path);
		},
		[],
	);

	const startCreate = useCallback(
		(type: "file" | "folder") => {
			if (!projectPath) return;
			let parentPath = projectPath;
			let level = 0;
			const selected = selectedPath
				? findEntryByPath(entriesByDir, selectedPath)
				: null;
			if (selected) {
				if (selected.isDir) {
					parentPath = selected.path;
					level = pathDepth(selected.path, projectPath) + 1;
					if (!expandedDirs.has(parentPath)) {
						setExpandedDirs((prev) => {
							const next = new Set(prev);
							next.add(parentPath);
							return next;
						});
						if (!entriesByDir.has(parentPath)) {
							void loadDir(parentPath);
						}
					}
				} else {
					parentPath = parentOfPath(selected.path);
					level = pathDepth(parentPath, projectPath);
				}
			}
			setEditing({ mode: "create", parentPath, level, type });
		},
		[entriesByDir, expandedDirs, loadDir, projectPath, selectedPath],
	);

	const startRename = useCallback((entry: FileEntry) => {
		setEditing({ mode: "rename", targetPath: entry.path });
	}, []);

	const cancelEditing = useCallback(() => {
		setEditing(null);
	}, []);

	const submitCreate = useCallback(
		async (parentPath: string, type: "file" | "folder", name: string) => {
			setEditing(null);
			if (type === "file") {
				await mutations.createFile(parentPath, name);
			} else {
				await mutations.createFolder(parentPath, name);
			}
		},
		[mutations],
	);

	const submitRename = useCallback(
		async (entry: FileEntry, nextName: string) => {
			setEditing(null);
			if (nextName === entry.name) return;
			const nextPath = await mutations.rename(entry.path, nextName);
			if (nextPath && selectedPath === entry.path) {
				setSelectedPath(nextPath);
			}
		},
		[mutations, selectedPath],
	);

	const removeEntry = useCallback(
		async (entry: FileEntry) => {
			const ok = await mutations.remove(entry.path, entry.name, entry.isDir);
			if (ok) {
				if (selectedPath === entry.path) setSelectedPath(null);
				if (entry.isDir) {
					// 折叠并清掉缓存
					setExpandedDirs((prev) => {
						const next = new Set(prev);
						next.delete(entry.path);
						return next;
					});
					setEntriesByDir((prev) => {
						const next = new Map(prev);
						for (const key of [...next.keys()]) {
							if (key === entry.path || key.startsWith(`${entry.path}/`)) {
								next.delete(key);
							}
						}
						return next;
					});
				}
			}
		},
		[mutations, selectedPath],
	);

	const handleOpenFolder = useCallback(async () => {
		try {
			const { path } = await pickSystemDirectory("选择当前线程的工作目录");
			if (!path) return;
			const sessionId = activeSessionId;
			if (sessionId) {
				chatStore.setSessionCwd(sessionId, path);
			} else {
				const model = settingsStore.getActiveModel() || DEFAULT_THREAD_MODEL;
				createThreadSessionForPath(path, model);
			}
		} catch (e) {
			console.error("[ProjectFilesView] open folder failed:", e);
			toast.error("打开文件夹失败");
		}
	}, [activeSessionId]);

	// 键盘快捷键：F2 重命名 / Delete 删除 / Enter 打开
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const isTyping =
				tag === "input" ||
				tag === "textarea" ||
				tag === "select" ||
				Boolean(target?.isContentEditable);
			if (isTyping) return;
			if (!selectedPath) return;
			// 仅在面板被悬停或包含 active 元素时响应——否则会与全局快捷键冲突
			const el = containerRef.current;
			if (!el) return;
			if (!el.contains(document.activeElement) && !el.matches(":hover")) {
				return;
			}
			const entry = findEntryByPath(entriesByDir, selectedPath);
			if (!entry) return;
			if (e.key === "F2") {
				e.preventDefault();
				startRename(entry);
			} else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) {
				e.preventDefault();
				void removeEntry(entry);
			} else if (e.key === "Enter") {
				e.preventDefault();
				void handleToggleOrOpen(entry);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		entriesByDir,
		selectedPath,
		startRename,
		removeEntry,
		handleToggleOrOpen,
	]);

	const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
		if (!contextMenu) return [];
		const items: ContextMenuItem[] = [];
		const { entry } = contextMenu;
		if (entry) {
			if (!entry.isDir) {
				items.push({
					label: "打开",
					onClick: () => void handleToggleOrOpen(entry),
				});
				if (
					isReaderSupportedFile(entry.name) &&
					!isTextLikeReaderFile(entry.name)
				) {
					items.push({
						label: "在阅读器中打开（导入资料库）",
						onClick: () => void openInReader(entry, { silent: false }),
					});
				}
			}
			if (entry.isDir) {
				items.push({
					label: "新建文件",
					onClick: () => {
						setSelectedPath(entry.path);
						setExpandedDirs((prev) => {
							const next = new Set(prev);
							next.add(entry.path);
							return next;
						});
						if (!entriesByDir.has(entry.path)) {
							void loadDir(entry.path);
						}
						setEditing({
							mode: "create",
							parentPath: entry.path,
							level: pathDepth(entry.path, projectPath ?? entry.path) + 1,
							type: "file",
						});
					},
				});
				items.push({
					label: "新建文件夹",
					onClick: () => {
						setSelectedPath(entry.path);
						setExpandedDirs((prev) => {
							const next = new Set(prev);
							next.add(entry.path);
							return next;
						});
						if (!entriesByDir.has(entry.path)) {
							void loadDir(entry.path);
						}
						setEditing({
							mode: "create",
							parentPath: entry.path,
							level: pathDepth(entry.path, projectPath ?? entry.path) + 1,
							type: "folder",
						});
					},
				});
				items.push({
					separator: true,
					label: "",
					onClick: () => {},
				});
			}
			items.push({
				label: "重命名",
				shortcut: "F2",
				onClick: () => startRename(entry),
			});
			items.push({
				label: "删除",
				shortcut: "Delete",
				danger: true,
				onClick: () => void removeEntry(entry),
			});
			items.push({ separator: true, label: "", onClick: () => {} });
			items.push({
				label: "复制路径",
				onClick: () => void mutations.copyPath(entry.path),
			});
			items.push({
				label: "在 Finder 中显示",
				onClick: () => void mutations.reveal(entry.path),
			});
		}
		return items;
	}, [
		contextMenu,
		entriesByDir,
		handleToggleOrOpen,
		loadDir,
		mutations,
		openInReader,
		projectPath,
		removeEntry,
		startRename,
	]);

	const renderTree = useCallback(
		(parentPath: string, level: number): React.ReactNode => {
			const items = entriesByDir.get(parentPath);
			const isCreatingHere =
				editing?.mode === "create" && editing.parentPath === parentPath;
			if (!items) {
				if (isCreatingHere) {
					return (
						<InlineCreateRow
							key={`__create_${parentPath}`}
							level={editing.level}
							type={editing.type}
							onSubmit={(name) =>
								void submitCreate(parentPath, editing.type, name)
							}
							onCancel={cancelEditing}
						/>
					);
				}
				return null;
			}
			return (
				<>
					{items.map((entry) => {
						const isExpanded = expandedDirs.has(entry.path);
						const isSelected = selectedPath === entry.path;
						const isRenaming =
							editing?.mode === "rename" && editing.targetPath === entry.path;
						return (
							<div key={entry.path}>
								<FileTreeNode
									entry={entry}
									level={level}
									isExpanded={isExpanded}
									isSelected={isSelected}
									isRenaming={isRenaming}
									onToggle={(e) => void handleToggleOrOpen(e)}
									onSelect={handleSelect}
									onContextMenu={handleContextMenu}
									onRenameSubmit={(e, nextName) =>
										void submitRename(e, nextName)
									}
									onRenameCancel={cancelEditing}
								/>
								{entry.isDir && isExpanded ? (
									<>{renderTree(entry.path, level + 1)}</>
								) : null}
							</div>
						);
					})}
					{isCreatingHere ? (
						<InlineCreateRow
							key={`__create_${parentPath}`}
							level={editing.level}
							type={editing.type}
							onSubmit={(name) =>
								void submitCreate(parentPath, editing.type, name)
							}
							onCancel={cancelEditing}
						/>
					) : null}
				</>
			);
		},
		[
			editing,
			entriesByDir,
			expandedDirs,
			handleContextMenu,
			handleSelect,
			handleToggleOrOpen,
			selectedPath,
			cancelEditing,
			submitCreate,
			submitRename,
		],
	);

	const rootEntries = projectPath ? entriesByDir.get(projectPath) : undefined;

	return (
		<div
			ref={containerRef}
			tabIndex={-1}
			className="flex flex-col h-full bg-transparent outline-none"
			onContextMenu={(e) => {
				if (e.target === e.currentTarget) handleContextMenu(e, null);
			}}
		>
			<FileTreeHeader
				hasPath={Boolean(projectPath)}
				isLoading={isLoadingRoot}
				onCreateFile={() => startCreate("file")}
				onCreateFolder={() => startCreate("folder")}
				onCollapseAll={collapseAll}
				onRefresh={refreshRoot}
			/>

			<div className="flex-1 overflow-y-auto scrollbar-hide py-2">
				{!projectPath ? (
					<FileTreeEmptyState
						variant="no-path"
						onOpenFolder={handleOpenFolder}
					/>
				) : isLoadingRoot && (!rootEntries || rootEntries.length === 0) ? (
					<FileTreeEmptyState variant="loading" />
				) : !rootEntries || rootEntries.length === 0 ? (
					<FileTreeEmptyState variant="empty" />
				) : (
					<div className="pb-6">{renderTree(projectPath, 0)}</div>
				)}
			</div>

			{contextMenu && contextMenuItems.length > 0 ? (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			) : null}
		</div>
	);
}

function pathDepth(targetPath: string, rootPath: string): number {
	if (!targetPath.startsWith(rootPath)) return 0;
	const rel = targetPath.slice(rootPath.length).replace(/^[\\/]+/, "");
	if (!rel) return 0;
	return rel.split(/[\\/]/).filter(Boolean).length;
}

function parentOfPath(p: string): string {
	const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	if (idx <= 0) return p;
	return p.slice(0, idx);
}
