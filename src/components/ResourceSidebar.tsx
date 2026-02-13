// 资料侧边栏 - 重构版（支持 Agent 任务、研究进度和资料预览）

import {
	AlertCircle,
	ArrowDownToLine,
	ArrowLeft,
	BookOpen,
	CheckCircle2,
	CheckSquare,
	ChevronDown,
	ChevronRight,
	Circle,
	Clock,
	Copy,
	Edit2,
	ExternalLink,
	FileEdit,
	FileText,
	Folder as FolderIcon,
	Globe,
	Image as ImageIcon,
	Link,
	Loader2,
	Mic,
	MoreHorizontal,
	Paperclip,
	PenLine,
	Quote,
	RefreshCw,
	Save,
	Search,
	Settings,
	Sparkles,
	Square,
	Trash2,
	Type,
	X,
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDragAndDropImport } from "../hooks/useDragAndDropImport";
import { useMouseDrag } from "../hooks/useMouseDrag";
import {
	createFolder,
	deleteCard as deleteCardApi,
	deleteFolder,
	fileRevealInFinder,
	fileDelete,
	fileRestore,
	fileSetScope,
	fileSetTags,
	getCardImagePath,
	getSourceDetail,
	importLocalFiles,
	moveSourcesToFolder,
	updateFolder,
	updateNote,
	updateSource,
} from "../lib/api";
import { getPerformanceTuning } from "../lib/config";
import { queryKeys, useCardsQuery, useFoldersQuery, useSourcesQuery } from "../lib/query";
import {
	buildFileItemContextMenu,
	buildFolderItemContextMenu,
} from "../lib/contextMenu/actions";
import { EVENTS, events } from "../lib/events";
import { convertFileSrc, invoke } from "../lib/tauriCompat";
import {
	type ResearchSource,
	type ResearchStep,
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../lib/workspaceStore";
import {
	type Card,
	type Folder,
	type Source,
	type SourceDetail,
	SourceOrigin,
	SourceType,
} from "../types";
import { ResourceSidebarDialogs } from "./resource/sidebar/ResourceSidebarDialogs";
import { ResourceSidebarHeader } from "./resource/sidebar/ResourceSidebarHeader";
import { useResourceSidebarActions } from "./resource/sidebar/useResourceSidebarActions";
import DocumentViewer, { extractDocumentInfo } from "./ui/DocumentViewer";
import { DragAndDropImportUI } from "./ui/DragAndDropImportUI";
import { MarkdownRenderer } from "./ui/MarkdownRenderer";
import { Modal } from "./ui/Modal";
import { ContextMenu } from "./ui/ContextMenu";
import { inputDialog } from "./ui/InputDialog";
import { RichContentWithStyles } from "./ui/RichContentRenderer";
import { toast } from "./ui/Toast";

const AgentTaskPanel = lazy(() => import("./agent/AgentTaskPanel"));
const WebSearchModule = lazy(() => import("./WebSearchModule"));

interface ResourceSidebarProps {
	onOpenSettings: () => void;
}

export default function ResourceSidebar({
	onOpenSettings,
}: ResourceSidebarProps) {
	const UNASSIGNED_FOLDER_ID = "__unassigned__";
	const [sources, setSources] = useState<Source[]>([]);
	const [rawSources, setRawSources] = useState<Source[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [viewMode, setViewMode] = useState<"grid" | "list">("list");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// 鼠标拖拽 (替代 HTML5 拖拽，因为 Tauri 不支持)
	const { startDrag, isDragging: isMouseDragging, dragItem } = useMouseDrag();

	// 文件夹树
	const [folders, setFolders] = useState<Folder[]>([]);
	const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
	const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	// 详情加载
	const [sourceDetail, setSourceDetail] = useState<SourceDetail | null>(null);
	const [isLoadingDetail, setIsLoadingDetail] = useState(false);

	// 右键菜单
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		source: Source;
	} | null>(null);

	// 删除确认
	const [deleteConfirm, setDeleteConfirm] = useState<Source | null>(null);
	const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<string[] | null>(
		null,
	);
	const [cardDeleteConfirm, setCardDeleteConfirm] = useState<Card | null>(null);

	// 划词引用
	const [selectionPopup, setSelectionPopup] = useState<{
		x: number;
		y: number;
		text: string;
	} | null>(null);

	// 编辑状态
	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState("");
	const [editContent, setEditContent] = useState("");
	const [editHtmlContent, setEditHtmlContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	// Modal State
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<"web" | "text" | "file">("web");
	const [newSourceTitle, setNewSourceTitle] = useState("");
	const [newSourceContent, setNewSourceContent] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);

	// 批量管理
	const [selectionMode, setSelectionMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const selectedSources = useMemo(
		() => sources.filter((source) => selectedIdSet.has(source.id)),
		[selectedIdSet, sources],
	);
	const [isMoveFolderModalOpen, setIsMoveFolderModalOpen] = useState(false);
	const [moveFolderTargetId, setMoveFolderTargetId] = useState<string>("");

	// 文件夹右键菜单
	const [folderContextMenu, setFolderContextMenu] = useState<{
		x: number;
		y: number;
		folder: Folder;
	} | null>(null);
	const [folderDeleteConfirm, setFolderDeleteConfirm] = useState<Folder | null>(
		null,
	);
	const [isRenameFolderModalOpen, setIsRenameFolderModalOpen] = useState(false);
	const [renameFolderTarget, setRenameFolderTarget] = useState<Folder | null>(
		null,
	);
	const [renameFolderName, setRenameFolderName] = useState("");
	const [isMoveFolderToModalOpen, setIsMoveFolderToModalOpen] = useState(false);
	const [moveFolderSource, setMoveFolderSource] = useState<Folder | null>(null);
	const [moveFolderToTargetId, setMoveFolderToTargetId] = useState<string>("");

	// 单个资料移动到文件夹
	const [singleSourceMoveModal, setSingleSourceMoveModal] =
		useState<Source | null>(null);
	const [singleSourceMoveTargetId, setSingleSourceMoveTargetId] =
		useState<string>("");

	// 拖拽状态
	const [draggedSourceId, setDraggedSourceId] = useState<string | null>(null);
	const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
	const sourceListScrollRef = useRef<HTMLDivElement | null>(null);
	const [sourceAutoRefreshMs, setSourceAutoRefreshMs] = useState(10000);
	const [uiDebugLogsEnabled, setUiDebugLogsEnabled] = useState(false);

	// 分享卡片
	const [cards, setCards] = useState<Card[]>([]);
	const [cardImages, setCardImages] = useState<Record<string, string>>({});
	const [isLoadingCards, setIsLoadingCards] = useState(false);
	const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null);
	const [cardPreview, setCardPreview] = useState<Card | null>(null);

	const currentProjectId = useWorkspaceStoreSelector(
		(state) => state.currentProjectId,
	);
	const currentFolderId = useWorkspaceStoreSelector(
		(state) => state.currentFolderId,
	);
	const leftSidebarView = useWorkspaceStoreSelector(
		(state) => state.leftSidebarView,
	);
	const currentResearch = useWorkspaceStoreSelector(
		(state) => state.currentResearch,
	);
	const previewSource = useWorkspaceStoreSelector(
		(state) => state.previewSource,
	);
	const setLeftSidebarView =
		workspaceStore.setLeftSidebarView.bind(workspaceStore);
	const setPreviewSource = workspaceStore.setPreviewSource.bind(workspaceStore);
	const setCurrentFolder = workspaceStore.setCurrentFolder.bind(workspaceStore);
	const openSourceInMainView =
		workspaceStore.openSourceInMainView.bind(workspaceStore);
	const queryClient = useQueryClient();
	const sourcesQuery = useSourcesQuery(currentProjectId, {
		refetchInterval:
			leftSidebarView === "sources" ? sourceAutoRefreshMs : false,
	});
	const foldersQuery = useFoldersQuery(currentProjectId);
	const cardsQuery = useCardsQuery();
	const preloadWebSearchModule = useCallback(() => {
		void import("./WebSearchModule");
	}, []);
	const preloadAgentTaskPanel = useCallback(() => {
		void import("./agent/AgentTaskPanel");
	}, []);
	const debugLog = useCallback(
		(...args: unknown[]) => {
			if (!uiDebugLogsEnabled) return;
			console.log(...args);
		},
		[uiDebugLogsEnabled],
	);
	const debugWarn = useCallback(
		(...args: unknown[]) => {
			if (!uiDebugLogsEnabled) return;
			console.warn(...args);
		},
		[uiDebugLogsEnabled],
	);

	useEffect(() => {
		let cancelled = false;
		void getPerformanceTuning()
			.then((settings) => {
				if (cancelled) return;
				setSourceAutoRefreshMs(settings.sourceAutoRefreshMs);
				setUiDebugLogsEnabled(settings.enableUiDebugLogs);
			})
			.catch((error) => {
				console.error("加载性能设置失败:", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const foldersById = useMemo(() => {
		const map = new Map<string, Folder>();
		for (const f of folders) map.set(f.id, f);
		return map;
	}, [folders]);

	const childrenByParentId = useMemo(() => {
		const map = new Map<string, Folder[]>();
		const keyOf = (parentId?: string) => parentId || "__root__";
		for (const f of folders) {
			const k = keyOf(f.parent_id);
			const list = map.get(k) || [];
			list.push(f);
			map.set(k, list);
		}
		// 稍微稳定排序：按 updated_at desc，其次 name
		for (const [k, list] of map) {
			list.sort((a, b) => {
				if (a.updated_at !== b.updated_at)
					return a.updated_at > b.updated_at ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
			map.set(k, list);
		}
		return map;
	}, [folders]);

	const getSubtreeFolderIds = useCallback(
		(rootId: string): Set<string> => {
			const out = new Set<string>();
			const stack = [rootId];
			while (stack.length) {
				const id = stack.pop()!;
				if (out.has(id)) continue;
				out.add(id);
				const children = childrenByParentId.get(id) || [];
				for (const child of children) stack.push(child.id);
			}
			return out;
		},
		[childrenByParentId],
	);

	const recomputeVisibleSources = useCallback(() => {
		const base = rawSources;
		// 在根目录或"未分类"视图中，只显示未分类的资料
		if (!currentFolderId || currentFolderId === UNASSIGNED_FOLDER_ID) {
			setSources(base.filter((s) => s.folder_id == null));
			return;
		}
		// 在文件夹视图中，显示该文件夹及其子文件夹的资料
		const subtreeIds = getSubtreeFolderIds(currentFolderId);
		setSources(base.filter((s) => s.folder_id && subtreeIds.has(s.folder_id)));
	}, [rawSources, currentFolderId, getSubtreeFolderIds]);

	const fetchFolders = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: queryKeys.folders(currentProjectId),
		});
	}, [queryClient, currentProjectId]);

	const fetchSources = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: queryKeys.sources(),
		});
	}, [queryClient]);

	useEffect(() => {
		if (Array.isArray(sourcesQuery.data)) {
			setRawSources(sourcesQuery.data);
			setErrorMessage(null);
		}
	}, [sourcesQuery.data]);

	useEffect(() => {
		if (Array.isArray(foldersQuery.data)) {
			setFolders(foldersQuery.data);
		}
	}, [foldersQuery.data]);

	useEffect(() => {
		setIsLoading(sourcesQuery.isFetching && !Array.isArray(sourcesQuery.data));
		if (!sourcesQuery.error) return;
		const error = sourcesQuery.error;
		console.error("获取资源失败:", error);
		if (error instanceof Error && error.message.includes("TAURI_UNAVAILABLE")) {
			setErrorMessage("请通过桌面应用访问");
		} else {
			setErrorMessage("获取资料失败");
		}
	}, [sourcesQuery.error, sourcesQuery.isFetching, sourcesQuery.data]);

	const { createSourceFromModal, revealFolderProjectDirectory } =
		useResourceSidebarActions({
			onCreated: fetchSources,
		});

	useEffect(() => {
		// 切换文件夹时，清理选中状态
		setSelectedIds([]);
		setSelectionMode(false);
		// 如果当前在详情视图且预览的资料不在当前文件夹，关闭详情
		if (
			previewSource &&
			"id" in previewSource &&
			leftSidebarView === "detail"
		) {
			const source = sources.find((s) => s.id === previewSource.id);
			if (!source) {
				// 预览的资料不在当前文件夹，关闭详情
				handleCloseDetail();
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentFolderId]);

	const flatFolderOptions = useMemo(() => {
		const out: Array<{ id: string; name: string; depth: number }> = [];
		const walk = (parentId: string | null, depth: number) => {
			const key = parentId || "__root__";
			const children = childrenByParentId.get(key) || [];
			for (const f of children) {
				out.push({ id: f.id, name: f.name, depth });
				walk(f.id, depth + 1);
			}
		};
		walk(null, 0);
		return out;
	}, [childrenByParentId]);

	const handleCreateFolder = useCallback(async () => {
		const name = newFolderName.trim();
		if (!name) return;

		try {
			const parent_id =
				currentFolderId && currentFolderId !== UNASSIGNED_FOLDER_ID
					? currentFolderId
					: undefined;
			const folder = await createFolder({
				name,
				project_id: currentProjectId || undefined,
				parent_id,
			});
			setIsFolderModalOpen(false);
			setNewFolderName("");
			await fetchFolders();
			setCurrentFolder(folder.id);
		} catch (error) {
			console.error("创建文件夹失败:", error);
			toast.error(
				`创建文件夹失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [
		newFolderName,
		currentFolderId,
		currentProjectId,
		fetchFolders,
		setCurrentFolder,
	]);

	const handleMoveSelectedToFolder = useCallback(async () => {
		if (!selectedIds.length) return;

		try {
			const payload: any = { source_ids: selectedIds };
			if (moveFolderTargetId && moveFolderTargetId !== UNASSIGNED_FOLDER_ID) {
				payload.folder_id = moveFolderTargetId;
			}
			await moveSourcesToFolder(payload);
			setIsMoveFolderModalOpen(false);
			setMoveFolderTargetId("");
			setSelectedIds([]);
			await fetchSources();
		} catch (error) {
			console.error("移动文件夹失败:", error);
			toast.error(
				`移动失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [selectedIds, moveFolderTargetId, fetchSources]);

	// 文件夹右键菜单处理
	const handleFolderContextMenu = useCallback(
		(e: React.MouseEvent, folder: Folder) => {
			e.preventDefault();
			e.stopPropagation();
			setFolderContextMenu({ x: e.clientX, y: e.clientY, folder });
		},
		[],
	);

	// 重命名文件夹
	const handleRenameFolder = useCallback(async () => {
		if (!renameFolderTarget) return;
		const name = renameFolderName.trim();
		if (!name) return;

		try {
			await updateFolder({ id: renameFolderTarget.id, name });
			setIsRenameFolderModalOpen(false);
			setRenameFolderTarget(null);
			setRenameFolderName("");
			await fetchFolders();
		} catch (error) {
			console.error("重命名文件夹失败:", error);
			toast.error(
				`重命名失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [renameFolderTarget, renameFolderName, fetchFolders]);

	// 删除文件夹
	const handleDeleteFolder = useCallback(
		async (folder: Folder, skipConfirm = false) => {
			if (!skipConfirm) {
				setFolderDeleteConfirm(folder);
				return;
			}

			try {
				await deleteFolder(folder.id);
				setFolderDeleteConfirm(null);
				// 如果删除的是当前选中的文件夹，切换到全部
				if (currentFolderId === folder.id) {
					setCurrentFolder(null);
				}
				await fetchFolders();
				await fetchSources();
			} catch (error) {
				console.error("删除文件夹失败:", error);
				toast.error(
					`删除失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[currentFolderId, setCurrentFolder, fetchFolders, fetchSources],
	);

	// 移动文件夹到其他位置
	const handleMoveFolderTo = useCallback(async () => {
		if (!moveFolderSource) return;

		try {
			const newParentId =
				moveFolderToTargetId === "" ? null : moveFolderToTargetId;
			await updateFolder({ id: moveFolderSource.id, parent_id: newParentId });
			setIsMoveFolderToModalOpen(false);
			setMoveFolderSource(null);
			setMoveFolderToTargetId("");
			await fetchFolders();
		} catch (error) {
			console.error("移动文件夹失败:", error);
			toast.error(
				`移动失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [moveFolderSource, moveFolderToTargetId, fetchFolders]);

	// 单个资料移动到文件夹
	const handleSingleSourceMove = useCallback(async () => {
		if (!singleSourceMoveModal) return;

		try {
			const folderId =
				singleSourceMoveTargetId === UNASSIGNED_FOLDER_ID
					? undefined
					: singleSourceMoveTargetId || undefined;
			await moveSourcesToFolder({
				source_ids: [singleSourceMoveModal.id],
				folder_id: folderId,
			});
			setSingleSourceMoveModal(null);
			setSingleSourceMoveTargetId("");
			await fetchSources();
		} catch (error) {
			console.error("移动资料失败:", error);
			toast.error(
				`移动失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [singleSourceMoveModal, singleSourceMoveTargetId, fetchSources]);

	// 获取可选的父文件夹（排除自身及其子孙）
	const getAvailableParentFolders = useCallback(
		(excludeFolderId: string) => {
			const subtree = getSubtreeFolderIds(excludeFolderId);
			return flatFolderOptions.filter((opt) => !subtree.has(opt.id));
		},
		[flatFolderOptions, getSubtreeFolderIds],
	);

	// 拖拽处理函数 - 直接拖拽到文件夹或 AI 对话
	const handleDragStart = useCallback(
		(e: React.DragEvent, sourceId: string) => {
			// 添加多种 MIME 类型，确保 WebKit 兼容性
			e.dataTransfer.setData("text/plain", sourceId); // WebKit 需要标准类型
			e.dataTransfer.setData("application/x-source-id", sourceId);
			// 添加序列化的资料数据，用于跨面板拖拽到 AI 对话
			const source = sources.find((s) => s.id === sourceId);
			if (source) {
				e.dataTransfer.setData(
					"application/x-source-data",
					JSON.stringify(source),
				);
			}
			e.dataTransfer.effectAllowed = "copyMove"; // 允许 copy 或 move

			setDraggedSourceId(sourceId);
			debugLog(
				"[Drag] 开始拖拽资料:",
				sourceId,
				"types:",
				e.dataTransfer.types,
			);
		},
		[sources, debugLog],
	);

	const handleDragEnd = useCallback((e: React.DragEvent) => {
		// 拖拽结束时清理状态
		debugLog("[Drag] 拖拽结束, dropEffect:", e.dataTransfer.dropEffect);
		// 延迟清理，确保 drop 事件能获取到 draggedSourceId
		setTimeout(() => {
			setDraggedSourceId(null);
			setDragOverFolderId(null);
		}, 100);
	}, [debugLog]);

	const handleFolderDragOver = useCallback(
		(e: React.DragEvent, folderId: string) => {
			e.preventDefault();
			e.stopPropagation();
			if (draggedSourceId) {
				e.dataTransfer.dropEffect = "move";
				setDragOverFolderId(folderId);
			}
		},
		[draggedSourceId],
	);

	const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
		// 只有当真正离开文件夹容器时才清除高亮
		if (e.currentTarget.contains(e.relatedTarget as Node)) {
			return;
		}
		setDragOverFolderId(null);
	}, []);

	const handleFolderDrop = useCallback(
		async (e: React.DragEvent, folderId: string) => {
			e.preventDefault();
			e.stopPropagation();
			const sourceId =
				draggedSourceId || e.dataTransfer.getData("application/x-source-id");
			debugLog("[Drag] 文件夹 drop 事件:", {
				sourceId,
				folderId,
				draggedSourceId,
			});
			if (!sourceId) {
				debugWarn("[Drag] 没有 sourceId，无法移动");
				return;
			}

			try {
				// 如果 folderId 是 UNASSIGNED_FOLDER_ID，设置为 undefined
				const actualFolderId =
					folderId === UNASSIGNED_FOLDER_ID ? undefined : folderId;
				debugLog("[Drag] 开始移动资料到文件夹:", {
					sourceId,
					actualFolderId,
				});
				await moveSourcesToFolder({
					source_ids: [sourceId],
					folder_id: actualFolderId,
				});
				await fetchSources();
				debugLog("[Drag] 移动成功");
			} catch (error) {
				console.error("[Drag] 移动资料失败:", error);
				toast.error(
					`移动失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setDraggedSourceId(null);
				setDragOverFolderId(null);
			}
		},
		[fetchSources, draggedSourceId, debugLog, debugWarn],
	);

	const toggleFolderExpanded = useCallback((folderId: string) => {
		setExpandedFolderIds((prev) =>
			prev.includes(folderId)
				? prev.filter((x) => x !== folderId)
				: [...prev, folderId],
		);
	}, []);

	const folderCounts = useMemo(() => {
		const direct = new Map<string, number>();
		let unassigned = 0;
		for (const s of rawSources) {
			if (s.folder_id) {
				direct.set(s.folder_id, (direct.get(s.folder_id) || 0) + 1);
			} else {
				unassigned += 1;
			}
		}
		return { direct, unassigned, total: rawSources.length };
	}, [rawSources]);

	const getFolderSubtreeCount = useCallback(
		(folderId: string): number => {
			const subtree = getSubtreeFolderIds(folderId);
			let total = 0;
			for (const id of subtree) {
				total += folderCounts.direct.get(id) || 0;
			}
			return total;
		},
		[folderCounts.direct, getSubtreeFolderIds],
	);

	const renderFolderNode = useCallback(
		(folder: Folder, depth: number) => {
			const children = childrenByParentId.get(folder.id) || [];
			const hasChildren = children.length > 0;
			const isExpanded = expandedFolderIds.includes(folder.id);
			const isActive = currentFolderId === folder.id;
			const count = getFolderSubtreeCount(folder.id);

			return (
				<div key={folder.id} className="group/folder">
					<div
						className={`flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${isActive
							? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
							: "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
							}`}
						style={{ paddingLeft: 8 + depth * 14 }}
						onContextMenu={(e) => handleFolderContextMenu(e, folder)}
					>
						<button
							type="button"
							className={`p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 ${hasChildren ? "opacity-100" : "opacity-0 pointer-events-none"
								}`}
							onClick={(e) => {
								e.stopPropagation();
								toggleFolderExpanded(folder.id);
							}}
							title={isExpanded ? "收起" : "展开"}
						>
							{isExpanded ? (
								<ChevronDown className="w-3.5 h-3.5" />
							) : (
								<ChevronRight className="w-3.5 h-3.5" />
							)}
						</button>
						<button
							type="button"
							className="flex-1 flex items-center gap-2 text-left min-w-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
							onClick={() => {
								// 点击文件夹时，如果当前在详情视图，先切换回资料列表
								if (leftSidebarView === "detail") {
									setLeftSidebarView("sources");
								}
								setCurrentFolder(folder.id);
							}}
							title={folder.name}
						>
							<FolderIcon className="w-4 h-4 shrink-0" />
							<span className="text-sm truncate">{folder.name}</span>
						</button>
						<span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums shrink-0">
							{count}
						</span>
						<button
							type="button"
							className="p-0.5 rounded opacity-0 group-hover/folder:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity"
							onClick={(e) => handleFolderContextMenu(e, folder)}
							title="更多操作"
						>
							<MoreHorizontal className="w-3.5 h-3.5" />
						</button>
					</div>

					{hasChildren && isExpanded && (
						<div className="mt-0.5">
							{children.map((c) => renderFolderNode(c, depth + 1))}
						</div>
					)}
				</div>
			);
		},
		[
			childrenByParentId,
			currentFolderId,
			expandedFolderIds,
			getFolderSubtreeCount,
			setCurrentFolder,
			toggleFolderExpanded,
			handleFolderContextMenu,
		],
	);

	// 获取当前文件夹的子文件夹（用于整合视图）
	const currentSubfolders = useMemo(() => {
		if (currentFolderId === null) {
			// 全部资料：显示根级文件夹
			return childrenByParentId.get("__root__") || [];
		}
		if (currentFolderId === UNASSIGNED_FOLDER_ID) {
			// 未归类：不显示文件夹
			return [];
		}
		// 当前文件夹的子文件夹
		return childrenByParentId.get(currentFolderId) || [];
	}, [currentFolderId, childrenByParentId]);
	const shouldVirtualizeSources =
		viewMode === "list" && sources.length > 200 && currentSubfolders.length === 0;
	const sourceVirtualizer = useVirtualizer({
		count: shouldVirtualizeSources ? sources.length : 0,
		getScrollElement: () => sourceListScrollRef.current,
		estimateSize: () => 62,
		overscan: 10,
	});

	// 面包屑路径
	const breadcrumbPath = useMemo(() => {
		const path: Array<{ id: string | null; name: string }> = [
			{ id: null, name: "全部" },
		];
		if (currentFolderId === UNASSIGNED_FOLDER_ID) {
			path.push({ id: UNASSIGNED_FOLDER_ID, name: "未归类" });
			return path;
		}
		if (currentFolderId) {
			const ancestors: Folder[] = [];
			let cur = foldersById.get(currentFolderId);
			while (cur) {
				ancestors.unshift(cur);
				cur = cur.parent_id ? foldersById.get(cur.parent_id) : undefined;
			}
			for (const f of ancestors) {
				path.push({ id: f.id, name: f.name });
			}
		}
		return path;
	}, [currentFolderId, foldersById]);

	// 渲染单个文件夹项（整合视图中使用）
	const renderFolderItem = useCallback(
		(folder: Folder) => {
			const count = getFolderSubtreeCount(folder.id);
			const isDragOver = dragOverFolderId === folder.id;

			const handleFolderClick = () => {
				// 点击文件夹时，如果当前在详情视图，先切换回资料列表
				if (leftSidebarView === "detail") {
					setLeftSidebarView("sources");
				}
				setCurrentFolder(folder.id);
			};

			if (viewMode === "grid") {
				return (
					<div
						key={folder.id}
						data-folder-id={folder.id}
						onDragOver={(e) => handleFolderDragOver(e, folder.id)}
						onDragLeave={handleFolderDragLeave}
						onDrop={(e) => handleFolderDrop(e, folder.id)}
						onClick={() => {
							// 如果正在拖拽，不触发点击
							if (isMouseDragging) return;
							handleFolderClick();
						}}
						onContextMenu={(e) => handleFolderContextMenu(e, folder)}
						// 鼠标拖拽事件 (用于 Tauri 环境)
						onMouseEnter={() => {
							if (isMouseDragging && dragItem?.type === "source") {
								setDragOverFolderId(folder.id);
							}
						}}
						onMouseLeave={() => {
							setDragOverFolderId(null);
						}}
					onMouseUp={() => {
						if (isMouseDragging && dragItem?.type === "source") {
							debugLog(
								"[MouseDrag] 拖拽到文件夹 (grid):",
								folder.id,
								"sourceId:",
								dragItem.sourceId,
							);
								// 执行移动操作
							moveSourcesToFolder({
								source_ids: [dragItem.sourceId],
								folder_id: folder.id,
							})
								.then((count) => {
									debugLog(
										"[MouseDrag] 移动成功 (grid), 影响行数:",
										count,
									);
										// 立即从当前视图移除该资料
										setSources((prev) =>
											prev.filter((s) => s.id !== dragItem.sourceId),
										);
										setRawSources((prev) =>
											prev.filter((s) => s.id !== dragItem.sourceId),
										);
										// 刷新以确保数据一致性
									return fetchSources();
								})
								.then(() => {
									debugLog("[MouseDrag] 资料列表已刷新 (grid)");
								})
								.catch((err) => {
									console.error("[MouseDrag] 移动失败 (grid):", err);
									});
								setDragOverFolderId(null);
							}
						}}
						className={`group cursor-pointer p-3 flex flex-col rounded-xl transition-all duration-200 border relative ${isDragOver
							? "bg-blue-100 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500 ring-2 ring-blue-400/50 scale-[1.02]"
							: "bg-gradient-to-br from-amber-50/60 to-orange-50/40 dark:from-amber-900/10 dark:to-orange-900/10 hover:from-amber-100/80 hover:to-orange-100/60 dark:hover:from-amber-900/20 dark:hover:to-orange-900/15 border-amber-200/50 dark:border-amber-800/30 hover:shadow-[0_4px_16px_rgba(251,191,36,0.08)] hover:-translate-y-0.5"
							}`}
					>
						<div
							className={`w-10 h-10 rounded-xl flex items-center justify-center pointer-events-none transition-colors duration-200 ${isDragOver
								? "bg-blue-200 dark:bg-blue-800/50"
								: "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30"
								}`}
						>
							<FolderIcon
								className={`w-5 h-5 ${isDragOver ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}
							/>
						</div>
						<div className="mt-2 pointer-events-none">
							<h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">
								{folder.name}
							</h3>
							<p className="text-[10px] text-zinc-400 mt-1">{count} 项</p>
						</div>
						<button
							onClick={(e) => {
								e.stopPropagation();
								handleFolderContextMenu(e, folder);
							}}
							className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 hover:bg-white/50 dark:hover:bg-black/20 rounded transition-all pointer-events-auto"
						>
							<MoreHorizontal className="w-3.5 h-3.5" />
						</button>
					</div>
				);
			}

			// 列表模式
			return (
				<div
					key={folder.id}
					data-folder-id={folder.id}
					data-testid={`folder-${folder.id}`}
					onDragOver={(e) => handleFolderDragOver(e, folder.id)}
					onDragLeave={handleFolderDragLeave}
					onDrop={(e) => handleFolderDrop(e, folder.id)}
					onClick={() => {
						// 如果正在拖拽，不触发点击
						if (isMouseDragging) return;
						handleFolderClick();
					}}
					onContextMenu={(e) => handleFolderContextMenu(e, folder)}
					// 鼠标拖拽事件 (用于 Tauri 环境)
					onMouseEnter={() => {
						if (isMouseDragging && dragItem?.type === "source") {
							setDragOverFolderId(folder.id);
						}
					}}
					onMouseLeave={() => {
						setDragOverFolderId(null);
					}}
					onMouseUp={() => {
						if (isMouseDragging && dragItem?.type === "source") {
							debugLog(
								"[MouseDrag] 拖拽到文件夹 (列表):",
								folder.id,
								"sourceId:",
								dragItem.sourceId,
							);
							// 执行移动操作
							moveSourcesToFolder({
								source_ids: [dragItem.sourceId],
								folder_id: folder.id,
							})
								.then((count) => {
									debugLog("[MouseDrag] 移动成功, 影响行数:", count);
									// 立即从当前视图移除该资料
									setSources((prev) =>
										prev.filter((s) => s.id !== dragItem.sourceId),
									);
									setRawSources((prev) =>
										prev.filter((s) => s.id !== dragItem.sourceId),
									);
									// 刷新以确保数据一致性
									return fetchSources();
								})
								.then(() => {
									debugLog("[MouseDrag] 资料列表已刷新");
								})
								.catch((err) => {
									console.error("[MouseDrag] 移动失败:", err);
								});
							setDragOverFolderId(null);
						}
					}}
					className={`group cursor-pointer p-2 flex items-center gap-3 rounded-xl transition-all duration-200 ${isDragOver
						? "bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-400/50"
						: "hover:bg-amber-50/70 dark:hover:bg-amber-900/10 hover:pl-3"
						}`}
				>
					<div
						className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 pointer-events-none transition-colors duration-200 ${isDragOver
							? "bg-blue-200 dark:bg-blue-800/50"
							: "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30"
							}`}
					>
						<FolderIcon
							className={`w-4 h-4 ${isDragOver ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}
						/>
					</div>
					<div className="flex-1 min-w-0 ml-1 pointer-events-none">
						<h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
							{folder.name}
						</h3>
						<p className="text-[10px] text-zinc-400">{count} 项</p>
					</div>
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleFolderContextMenu(e, folder);
						}}
						className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-all shrink-0 pointer-events-auto"
					>
						<MoreHorizontal className="w-3.5 h-3.5" />
					</button>
				</div>
			);
		},
		[
			viewMode,
			getFolderSubtreeCount,
			setCurrentFolder,
			handleFolderContextMenu,
			dragOverFolderId,
			leftSidebarView,
			setLeftSidebarView,
			isMouseDragging,
			dragItem,
			fetchSources,
			debugLog,
		],
	);

	// 渲染面包屑导航
	const renderBreadcrumb = useCallback(() => {
		if (breadcrumbPath.length <= 1) return null;

		return (
			<div className="px-3 py-2 flex items-center gap-1 text-xs border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 overflow-x-auto scrollbar-hide">
				{breadcrumbPath.map((item, index) => (
					<div
						key={item.id ?? "root"}
						className="flex items-center gap-1 shrink-0"
					>
						{index > 0 && (
							<ChevronRight className="w-3 h-3 text-zinc-300 dark:text-zinc-600" />
						)}
						<button
							onClick={() => {
								// 点击面包屑时，如果当前在详情视图，先切换回资料列表
								if (leftSidebarView === "detail") {
									setLeftSidebarView("sources");
								}
								setCurrentFolder(item.id);
							}}
							className={`px-1.5 py-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${index === breadcrumbPath.length - 1
								? "text-zinc-800 dark:text-zinc-200 font-medium"
								: "text-zinc-500 dark:text-zinc-400"
								}`}
						>
							{item.name}
						</button>
					</div>
				))}
			</div>
		);
	}, [breadcrumbPath, setCurrentFolder, leftSidebarView, setLeftSidebarView]);

	// 使用 ref 保存 draggedSourceId，避免闭包问题
	const draggedSourceIdRef = useRef<string | null>(null);
	useEffect(() => {
		draggedSourceIdRef.current = draggedSourceId;
	}, [draggedSourceId]);

	// 容器级别的 drop 处理（处理拖拽到空白区域）
	const handleContainerDragOver = useCallback((e: React.DragEvent) => {
		debugLog("[Drag] handleContainerDragOver 被调用");
		// 允许 drop
		if (e.dataTransfer.types.includes("application/x-source-id")) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			debugLog("[Drag] 容器 dragover，允许 drop");
		}
	}, [debugLog]);

	const handleContainerDrop = useCallback(
		(e: React.DragEvent) => {
			// 如果事件已经被子元素处理（比如拖到了具体文件夹），就不再处理
			if (e.defaultPrevented) return;

			e.preventDefault();

			const sourceId = e.dataTransfer.getData("application/x-source-id");
			if (sourceId) {
				debugLog("[Drag] 拖拽到侧边栏空白区域，移动到未归类");
				handleFolderDrop(e, UNASSIGNED_FOLDER_ID);
			}
		},
		[handleFolderDrop, debugLog],
	);

	useEffect(() => {
		recomputeVisibleSources();
	}, [recomputeVisibleSources]);

	useEffect(() => {
		// 选中某个文件夹时自动展开其祖先
		if (!currentFolderId || currentFolderId === UNASSIGNED_FOLDER_ID) return;
		const expanded = new Set(expandedFolderIds);
		let cur = foldersById.get(currentFolderId);
		while (cur?.parent_id) {
			expanded.add(cur.parent_id);
			cur = foldersById.get(cur.parent_id);
		}
		setExpandedFolderIds(Array.from(expanded));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentFolderId, foldersById]);

	const importSupportedExts = useMemo(
		() =>
			new Set([
				// 文本和标记语言
				"txt",
				"md",
				"markdown",
				"json",
				"csv",
				"html",
				"htm",
				"xml",
				"yaml",
				"yml",
				"toml",
				"rst",
				"log",
				"conf",
				"ini",
				"rtf",
				// 文档
				"pdf",
				"docx",
				// 图片
				"png",
				"jpg",
				"jpeg",
				"gif",
				"webp",
				"bmp",
				"tif",
				"tiff",
				"svg",
			]),
		[],
	);

	const acceptImportPath = useCallback(
		(path: string) => {
			const lower = path.toLowerCase();
			const idx = lower.lastIndexOf(".");
			const ext = idx >= 0 ? lower.slice(idx + 1) : "";
			return importSupportedExts.has(ext);
		},
		[importSupportedExts],
	);

	const dragImport = useDragAndDropImport<SourceDetail>({
		enabled: true,
		accept: acceptImportPath,
	});

	const autoStartEnabledRef = useRef(true);
	const prevQueueLenRef = useRef(0);

	useEffect(() => {
		if (dragImport.queue.length > prevQueueLenRef.current) {
			autoStartEnabledRef.current = true;
		}
		prevQueueLenRef.current = dragImport.queue.length;
	}, [dragImport.queue.length]);

	const importSingleFile = useCallback(async (path: string) => {
		try {
			const project_id =
				workspaceStore.getState().currentProjectId || undefined;
			const currentFolderId = workspaceStore.getState().currentFolderId;
			const folder_id =
				currentFolderId && currentFolderId !== "__unassigned__"
					? currentFolderId
					: undefined;
			const result = await importLocalFiles({
				paths: [path],
				tags: [],
				project_id,
				folder_id,
			});
			if (!result || result.length === 0) {
				throw new Error("导入失败：返回为空");
			}
			return result[0];
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(message);
		}
	}, []);

	useEffect(() => {
		if (!autoStartEnabledRef.current) return;
		if (dragImport.queueStatus !== "idle") return;
		if (dragImport.summary.pending <= 0) return;
		dragImport.startImport(importSingleFile);
	}, [
		dragImport.queueStatus,
		dragImport.summary.pending,
		dragImport.startImport,
		importSingleFile,
	]);

	const prevQueueStatusRef = useRef(dragImport.queueStatus);

	useEffect(() => {
		const prev = prevQueueStatusRef.current;
		if (prev === "importing" && dragImport.queueStatus === "idle") {
			fetchSources();
		}
		prevQueueStatusRef.current = dragImport.queueStatus;
	}, [dragImport.queueStatus, fetchSources]);

	const handleStartDragImport = useCallback(() => {
		autoStartEnabledRef.current = true;
		dragImport.startImport(importSingleFile);
	}, [dragImport.startImport, importSingleFile]);

	const handleCancelDragImport = useCallback(() => {
		autoStartEnabledRef.current = false;
		dragImport.cancelImport();
	}, [dragImport.cancelImport]);

	const buildCardImages = useCallback(async (data: Card[]) => {
		const entries = await Promise.all(
			data.map(async (card) => {
				try {
					const fullPath = await getCardImagePath(card.image_path);
					const assetUrl = convertFileSrc(fullPath);
					return [card.id, assetUrl] as const;
				} catch (error) {
					console.error("加载卡片图片失败:", error);
					return [card.id, ""] as const;
				}
			}),
		);
		setCardImages(Object.fromEntries(entries));
	}, []);

	const fetchCards = useCallback(async () => {
		setIsLoadingCards(true);
		try {
			const result = await cardsQuery.refetch();
			const data = result.data ?? [];
			setCards(data);
			await buildCardImages(data);
			setCardErrorMessage(null);
		} catch (error) {
			console.error("获取分享卡片失败:", error);
			setCardErrorMessage("获取分享卡片失败");
		} finally {
			setIsLoadingCards(false);
		}
	}, [cardsQuery, buildCardImages]);

	useEffect(() => {
		if (!cardsQuery.data) return;
		setCards(cardsQuery.data);
		void buildCardImages(cardsQuery.data);
	}, [cardsQuery.data, buildCardImages]);

	// 打开资料详情
	const handleOpenDetail = async (source: Source) => {
		// 使用 setPreviewSource 会自动切换视图到 'detail'（在 workspaceStore 中处理）
		setPreviewSource(source);
		setIsLoadingDetail(true);
		setIsEditing(false);

		try {
			const detail = await getSourceDetail(source.id);
			setSourceDetail(detail);
			// 初始化编辑状态
			setEditTitle(source.title);
			setEditContent(detail.note?.content || "");
			setEditHtmlContent(detail.note?.content_html || "");
		} catch (error) {
			console.error("加载详情失败:", error);
			toast.error("加载详情失败，请重试");
		} finally {
			setIsLoadingDetail(false);
		}
	};

	// 打开研究资料详情
	const handleOpenResearchSource = (source: ResearchSource) => {
		setPreviewSource(source);
	};

	// 关闭详情
	const handleCloseDetail = () => {
		setPreviewSource(null); // 这会自动切换视图回 'sources'（在 workspaceStore 中处理）
		setSourceDetail(null);
		setSelectionPopup(null);
		setIsEditing(false);
	};

	// 处理文本选择（划词引用）
	const handleTextSelection = () => {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) {
			setSelectionPopup(null);
			return;
		}

		const text = selection.toString().trim();
		if (text.length < 2) {
			setSelectionPopup(null);
			return;
		}

		// 获取选区位置
		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();

		setSelectionPopup({
			x: rect.left + rect.width / 2,
			y: rect.top - 10,
			text,
		});
	};

	// 插入选中文本到编辑器
	const handleInsertSelection = () => {
		if (!selectionPopup) return;

		// 发送事件到编辑器
		events.emit(EVENTS.INSERT_TO_EDITOR, {
			content: `> ${selectionPopup.text}\n\n`,
			source: previewSource?.title,
		});

		// 清除选区和弹窗
		window.getSelection()?.removeAllRanges();
		setSelectionPopup(null);
	};

	const deleteSourcesWithUndo = useCallback(
		async (sourceIds: string[]) => {
			if (sourceIds.length === 0) return;

			for (const id of sourceIds) {
				await fileDelete({ id, entity_type: "source" });
			}

			if (
				previewSource &&
				"id" in previewSource &&
				sourceIds.includes(previewSource.id)
			) {
				handleCloseDetail();
			}

			await fetchSources();

			toast.show(
				sourceIds.length === 1
					? "资料已删除"
					: `已删除 ${sourceIds.length} 条资料`,
				{
					type: "warning",
					duration: 5000,
					actionLabel: "撤销",
					actionVariant: "primary",
					onAction: async () => {
						try {
							for (const id of sourceIds) {
								await fileRestore({ id, entity_type: "source" });
							}
							await fetchSources();
							toast.success("已恢复删除的资料");
						} catch (error) {
							console.error("撤销删除资料失败:", error);
							toast.error(
								`撤销失败: ${error instanceof Error ? error.message : String(error)}`,
							);
						}
					},
				},
			);
		},
		[fetchSources, previewSource],
	);

	// 删除资料
	const handleDeleteSource = async (source: Source, skipConfirm = false) => {
		if (!skipConfirm) {
			setDeleteConfirm(source);
			return;
		}

		try {
			await deleteSourcesWithUndo([source.id]);
			setDeleteConfirm(null);
		} catch (error) {
			console.error("删除失败:", error);
			toast.error("删除失败，请重试");
		}
		setContextMenu(null);
	};

	const handleDeleteCard = (card: Card) => {
		setCardDeleteConfirm(card);
	};

	const confirmDeleteCard = async () => {
		if (!cardDeleteConfirm) return;
		try {
			await deleteCardApi(cardDeleteConfirm.id);
			setCards((prev) =>
				prev.filter((card) => card.id !== cardDeleteConfirm.id),
			);
			setCardImages((prev) => {
				const next = { ...prev };
				delete next[cardDeleteConfirm.id];
				return next;
			});
			if (cardPreview?.id === cardDeleteConfirm.id) {
				setCardPreview(null);
			}
		} catch (error) {
			console.error("删除卡片失败:", error);
			toast.error("删除卡片失败");
		} finally {
			setCardDeleteConfirm(null);
		}
	};

	const exitSelectionMode = () => {
		setSelectionMode(false);
		setSelectedIds([]);
	};

	const toggleSelection = (sourceId: string) => {
		setSelectionMode(true);
		setSelectedIds((prev) =>
			prev.includes(sourceId)
				? prev.filter((id) => id !== sourceId)
				: [...prev, sourceId],
		);
	};

	const handleSelectAll = () => {
		if (selectedIds.length === sources.length) {
			setSelectedIds([]);
		} else {
			setSelectedIds(sources.map((source) => source.id));
			setSelectionMode(true);
		}
	};

	const handleBulkAddToContext = () => {
		selectedSources.forEach((source) => {
			events.emit(EVENTS.ADD_TO_CONTEXT, { source });
		});
		exitSelectionMode();
	};

	// 批量删除
	const handleDeleteSelected = async () => {
		if (selectedSources.length === 0) return;
		setBatchDeleteConfirm(selectedSources.map((item) => item.id));
	};

	const handleConfirmBatchDelete = async () => {
		if (!batchDeleteConfirm) return;
		try {
			await deleteSourcesWithUndo(batchDeleteConfirm);
			exitSelectionMode();
		} catch (error) {
			console.error("批量删除失败:", error);
			toast.error("批量删除失败，请重试");
		} finally {
			setBatchDeleteConfirm(null);
		}
	};

	const handleCancelBatchDelete = () => {
		setBatchDeleteConfirm(null);
	};

	const handleOpenCardSource = (card: Card) => {
		if (card.source_url) {
			invoke("open_external_url", { url: card.source_url });
		}
	};

	const handleRevealSourceInFinder = useCallback(async (source: Source) => {
		try {
			await fileRevealInFinder({ id: source.id, entity_type: "source" });
		} catch (error) {
			console.error("在文件管理器中显示失败:", error);
			toast.error(
				`打开失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, []);

	const handleSetSourceScope = useCallback(
		async (source: Source, scope: "global" | "project") => {
			if (scope === "project" && !currentProjectId) {
				toast.warning("当前不在项目上下文，无法设为项目内可见");
				return;
			}
			try {
				await fileSetScope({
					id: source.id,
					entity_type: "source",
					scope,
					project_id:
						scope === "project" ? currentProjectId || undefined : undefined,
				});
				await fetchSources();
			} catch (error) {
				console.error("切换作用域失败:", error);
				toast.error(
					`切换作用域失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[currentProjectId, fetchSources],
	);

	const handleSetSourceTags = useCallback(
		async (source: Source) => {
			const next = await inputDialog.show({
				title: "编辑标签",
				message: "请输入标签（使用逗号分隔）",
				defaultValue: (source.tags || []).join(", "),
				confirmText: "保存",
				cancelText: "取消",
			});
			if (next == null) return;
			const tags = next
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
			try {
				await fileSetTags({
					id: source.id,
					entity_type: "source",
					tags,
				});
				await fetchSources();
			} catch (error) {
				console.error("更新标签失败:", error);
				toast.error(
					`更新标签失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[fetchSources],
	);

	const sourceContextMenuItems = useMemo(() => {
		if (!contextMenu) return [];
		const source = contextMenu.source;
		const fileActions = buildFileItemContextMenu({
			onOpen: () => handleOpenDetail(source),
			onRename: async () => {
				const nextTitle = await inputDialog.show({
					title: "重命名资料",
					message: "请输入新的资料名称",
					defaultValue: source.title,
					confirmText: "保存",
					cancelText: "取消",
					validate: (value) => {
						if (!value.trim()) return "资料名称不能为空";
						return null;
					},
				});
				if (!nextTitle?.trim()) return;
				try {
					await updateSource({ id: source.id, title: nextTitle.trim() });
					await fetchSources();
				} catch (error) {
					console.error("重命名资料失败:", error);
					toast.error(
						`重命名失败: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			},
			onMove: () => {
				setSingleSourceMoveModal(source);
				setSingleSourceMoveTargetId(source.folder_id || UNASSIGNED_FOLDER_ID);
			},
			onCopyPath: async () => {
				const targetPath = source.storage_path?.trim();
				if (!targetPath) {
					toast.warning("该资料暂无物理路径");
					return;
				}
				await navigator.clipboard.writeText(targetPath);
				toast.success("路径已复制");
			},
			onReveal: () => void handleRevealSourceInFinder(source),
			onSetTags: () => void handleSetSourceTags(source),
			onSetGlobal: () => void handleSetSourceScope(source, "global"),
			onSetProject: () => void handleSetSourceScope(source, "project"),
			onDelete: () => void handleDeleteSource(source),
			canSetScope: true,
		});
		return [
			{
				label: "添加到 AI 上下文",
				onClick: () => events.emit(EVENTS.ADD_TO_CONTEXT, { source }),
			},
			{ separator: true, label: "" as string, onClick: () => { } },
			...fileActions,
		];
	}, [
		contextMenu,
		fetchSources,
		handleDeleteSource,
		handleOpenDetail,
		handleRevealSourceInFinder,
		handleSetSourceScope,
		handleSetSourceTags,
	]);

	const folderContextMenuItems = useMemo(() => {
		if (!folderContextMenu) return [];
		const folder = folderContextMenu.folder;
		return buildFolderItemContextMenu({
			onCreateFile: () => {
				setCurrentFolder(folder.id);
				setActiveTab("text");
				setIsAddModalOpen(true);
			},
			onCreateSubFolder: () => {
				setCurrentFolder(folder.id);
				setIsFolderModalOpen(true);
			},
			onRename: () => {
				setRenameFolderTarget(folder);
				setRenameFolderName(folder.name);
				setIsRenameFolderModalOpen(true);
			},
			onMove: () => {
				setMoveFolderSource(folder);
				setMoveFolderToTargetId(folder.parent_id || "");
				setIsMoveFolderToModalOpen(true);
			},
			onReveal: () => {
				const projectId = folder.project_id || currentProjectId || undefined;
				void revealFolderProjectDirectory(projectId);
			},
			onDelete: () => void handleDeleteFolder(folder),
		});
	}, [
		currentProjectId,
		folderContextMenu,
		handleDeleteFolder,
		revealFolderProjectDirectory,
		setCurrentFolder,
	]);

	// 创建资料
	const handleCreateSource = async () => {
		const created = await createSourceFromModal({
			title: newSourceTitle,
			content: newSourceContent,
			activeTab,
		});
		if (!created) return;

		setIsAddModalOpen(false);
		setNewSourceTitle("");
		setNewSourceContent("");
		setSelectedFile(null);
	};

	const getIconForSource = (kind: SourceType) => {
		switch (kind) {
			case SourceType.Web:
				return <Globe className="w-4 h-4" />;
			case SourceType.Audio:
				return <Mic className="w-4 h-4" />;
			case SourceType.Document:
				return <FileText className="w-4 h-4" />;
			case SourceType.Text:
				return <Type className="w-4 h-4" />;
			case SourceType.Image:
				return <ImageIcon className="w-4 h-4" />;
			default:
				return <FileText className="w-4 h-4" />;
		}
	};

	const getKindColor = (kind: SourceType) => {
		switch (kind) {
			case SourceType.Web:
				return "bg-blue-500";
			case SourceType.Audio:
				return "bg-purple-500";
			case SourceType.Document:
				return "bg-orange-500";
			case SourceType.Text:
				return "bg-green-500";
			case SourceType.Image:
				return "bg-pink-500";
			default:
				return "bg-zinc-500";
		}
	};

	const getScopeLabel = useCallback((source: Source) => {
		return source.scope === "project" ? "项目内" : "全局";
	}, []);

	const getScopeBadgeClassName = useCallback((source: Source) => {
		return source.scope === "project"
			? "bg-zinc-100/80 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300"
			: "bg-indigo-50 dark:bg-indigo-900/25 text-indigo-600 dark:text-indigo-300";
	}, []);

	// 获取步骤图标
	const getStepIcon = (step: ResearchStep) => {
		if (step.status === "running") {
			return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
		}
		if (step.status === "completed") {
			return <CheckCircle2 className="w-4 h-4 text-green-500" />;
		}
		if (step.status === "error") {
			return <AlertCircle className="w-4 h-4 text-red-500" />;
		}
		return <Circle className="w-4 h-4 text-zinc-300" />;
	};

	// 保存编辑
	const handleSaveEdit = async () => {
		if (!previewSource || !sourceDetail) return;

		try {
			setIsSaving(true);

			// 更新 Source 标题
			if (editTitle !== previewSource.title) {
				await updateSource({
					id: previewSource.id,
					title: editTitle,
				});
			}

			// 更新 Note 内容
			if (sourceDetail.note) {
				// 如果有 HTML 内容，更新 content_html；否则更新 content
				if (sourceDetail.note.content_html) {
					await updateNote({
						id: sourceDetail.note.id,
						content_html: editHtmlContent,
					});
				} else {
					await updateNote({
						id: sourceDetail.note.id,
						content: editContent,
					});
				}
			}

			// 刷新数据
			const updatedDetail = await getSourceDetail(previewSource.id);
			setSourceDetail(updatedDetail);

			// 刷新完整列表，确保数据一致性
			await fetchSources();

			setIsEditing(false);
		} catch (error) {
			console.error("保存失败:", error);
			toast.error("保存失败，请重试");
		} finally {
			setIsSaving(false);
		}
	};

	// 复制全部内容到编辑器
	const handleCopyToEditor = () => {
		if (!sourceDetail) return;

		// 优先使用 HTML，如果没有则使用 Markdown
		// 但插入编辑器通常最好是 Markdown，除非编辑器支持 HTML
		// 目前 EditorCanvas 可能是 Tiptap 或类似，支持 HTML 粘贴，但 insertContent 可能需要 Markdown
		// 这里我们构建一个引用块

		let contentToInsert = "";
		if (sourceDetail.note?.content) {
			contentToInsert = sourceDetail.note.content;
		} else if (sourceDetail.note?.content_html) {
			// 简单的 HTML -> Text 降级，或者直接提示用户
			// TODO: 引入 html-to-markdown 库会更好
			contentToInsert = "HTML 内容暂不支持直接转换，请使用划词引用。";
		}

		events.emit(EVENTS.INSERT_TO_EDITOR, {
			content: `> ${previewSource?.title}\n\n${contentToInsert}\n\n`,
			source: previewSource?.title,
		});
	};

	// 右键菜单状态
	const [contentContextMenu, setContentContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// 处理内容区右键菜单
	const handleContentContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		const selection = window.getSelection();
		const hasSelection =
			selection &&
			!selection.isCollapsed &&
			selection.toString().trim().length > 0;

		if (hasSelection) {
			setContentContextMenu({ x: e.clientX, y: e.clientY });
		}
	};

	// 渲染详情视图
	const renderDetailView = () => {
		if (!previewSource) return null;

		// 判断是 Source 还是 ResearchSource
		const isSource = "kind" in previewSource;

		return (
			<div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200 bg-white dark:bg-[#1E1E1E]">
				{/* 划词引用弹窗 */}
				{selectionPopup && (
					<div
						className="fixed z-50 animate-in fade-in zoom-in-95 duration-150"
						style={{
							left: selectionPopup.x,
							top: selectionPopup.y,
							transform: "translate(-50%, -100%)",
						}}
					>
						<button
							onClick={handleInsertSelection}
							className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded-lg shadow-lg transition-colors"
						>
							<Quote className="w-3 h-3" />
							引用到编辑器
						</button>
					</div>
				)}

				{/* 右键菜单 */}
				{contentContextMenu && (
					<>
						<div
							className="fixed inset-0 z-40"
							onClick={() => setContentContextMenu(null)}
						/>
						<div
							className="fixed z-50 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 py-1.5 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
							style={{ left: contentContextMenu.x, top: contentContextMenu.y }}
						>
							<button
								onClick={() => {
									handleInsertSelection();
									setContentContextMenu(null);
								}}
								className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
							>
								<Quote className="w-4 h-4" />
								引用到编辑器
							</button>
							<button
								onClick={() => {
									const selection = window.getSelection();
									if (selection) {
										navigator.clipboard.writeText(selection.toString());
									}
									setContentContextMenu(null);
								}}
								className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
							>
								<Copy className="w-4 h-4" />
								复制
							</button>
						</div>
					</>
				)}

				{/* Header */}
				<div className="px-4 py-3 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 shrink-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
					<button
						onClick={handleCloseDetail}
						className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
					>
						<ArrowLeft className="w-4 h-4" />
					</button>

					<div className="flex-1 min-w-0">
						{isEditing ? (
							<input
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								className="w-full px-2 py-1 text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 rounded focus:outline-none focus:ring-2 focus:ring-zinc-200"
								placeholder="标题"
							/>
						) : (
							<h2
								className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 truncate"
								title={previewSource.title}
							>
								{previewSource.title}
							</h2>
						)}
					</div>

					{isSource && !isEditing && (
						<div className="flex items-center gap-1">
							<button
								onClick={() => setIsEditing(true)}
								className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
								title="编辑"
							>
								<Edit2 className="w-4 h-4" />
							</button>
						</div>
					)}

					{isSource && isEditing && (
						<div className="flex items-center gap-1">
							<button
								onClick={() => setIsEditing(false)}
								className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg"
								title="取消"
							>
								<X className="w-4 h-4" />
							</button>
							<button
								onClick={handleSaveEdit}
								disabled={isSaving}
								className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
								title="保存"
							>
								{isSaving ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Save className="w-4 h-4" />
								)}
							</button>
						</div>
					)}
				</div>

				{/* Content */}
				<div
					className="flex-1 overflow-y-auto scrollbar-hide bg-[#FDFDFD] dark:bg-[#1E1E1E]"
					onContextMenu={handleContentContextMenu}
				>
					{isLoadingDetail ? (
						<div className="flex items-center justify-center h-48">
							<Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
						</div>
					) : (
						<div className="p-6 space-y-6 max-w-3xl mx-auto">
							{/* Meta Info (Read Only) */}
							{!isEditing && (
								<div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap pb-4 border-b border-zinc-100 dark:border-zinc-800/50">
									{isSource && (
										<span
											className={`w-2 h-2 rounded-full ${getKindColor((previewSource as Source).kind)}`}
										/>
									)}
									<span className="flex items-center gap-1">
										<Clock className="w-3 h-3" />
										{isSource
											? new Date(
												(previewSource as Source).created_at,
											).toLocaleDateString("zh-CN")
											: new Date(
												(previewSource as ResearchSource).timestamp,
											).toLocaleDateString("zh-CN")}
									</span>
									{/* 来源标记 */}
									{isSource &&
										(previewSource as Source).source_type ===
										SourceOrigin.BrowserClip && (
											<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-medium">
												<Globe className="w-2.5 h-2.5" />
												浏览器剪存
											</span>
										)}
									{isSource &&
										(previewSource as Source).source_type ===
										SourceOrigin.WebSearch && (
											<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium">
												<Search className="w-2.5 h-2.5" />
												网络搜索
											</span>
										)}
									{isSource &&
										(previewSource as Source).source_type ===
										SourceOrigin.Import && (
											<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-100/70 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 rounded text-[10px] font-medium">
												<ArrowDownToLine className="w-2.5 h-2.5" />
												本地导入
											</span>
										)}
									{isSource && (
										<span
											className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getScopeBadgeClassName(previewSource as Source)}`}
										>
											{getScopeLabel(previewSource as Source)}
										</span>
									)}
									{isSource &&
										((previewSource as Source).tags || [])
											.slice(0, 3)
											.map((tag) => (
												<span
													key={`${previewSource.id}-detail-tag-${tag}`}
													className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100/80 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300"
												>
													#{tag}
												</span>
											))}
									{isSource && (previewSource as Source).storage_path ? (
										<button
											onClick={() =>
												void navigator.clipboard.writeText(
													(previewSource as Source).storage_path!,
												)
											}
											className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-700 text-[11px]"
											title={(previewSource as Source).storage_path}
										>
											<Copy className="w-3 h-3" />
											复制路径
										</button>
									) : null}

									{/* URL Link */}
									{previewSource.url && (
										<button
											onClick={() =>
												invoke("open_external_url", { url: previewSource.url })
											}
											className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline cursor-pointer ml-auto"
										>
											<ExternalLink className="w-3 h-3" />
											访问原文
										</button>
									)}
								</div>
							)}

							{/* Main Content */}
							<div
								className="relative min-h-[200px]"
								onMouseUp={!isEditing ? handleTextSelection : undefined}
							>
								{isEditing ? (
									<div className="space-y-4">
										{sourceDetail?.note?.content_html ? (
											// HTML 内容编辑：使用 contentEditable 富文本编辑
											<div
												contentEditable
												suppressContentEditableWarning
												onBlur={(e) =>
													setEditHtmlContent(e.currentTarget.innerHTML)
												}
												dangerouslySetInnerHTML={{ __html: editHtmlContent }}
												className="w-full min-h-[60vh] p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-base leading-7 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 prose prose-zinc dark:prose-invert max-w-none overflow-auto"
											/>
										) : (
											<textarea
												value={editContent}
												onChange={(e) => setEditContent(e.target.value)}
												className="w-full h-[60vh] p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-zinc-200 resize-none font-mono"
												placeholder="输入内容..."
											/>
										)}
									</div>
								) : (
									<>
										{isSource ? (
											// 智能渲染：检测内容类型
											(() => {
												const contentHtml = sourceDetail?.note?.content_html;
												const content = sourceDetail?.note?.content;
												const isImageExtraction = contentHtml?.includes(
													'data-has-markdown="true"',
												);
												const docInfo = contentHtml
													? extractDocumentInfo(contentHtml)
													: null;

												// 文档类型：使用内嵌阅读器
												if (docInfo && docInfo.src) {
													return (
														<DocumentViewer
															src={docInfo.src}
															type={docInfo.type}
															className="min-h-[60vh]"
														/>
													);
												}

												if (isImageExtraction && content && contentHtml) {
													// 图片抽取结果：先渲染 Markdown 内容，再显示原图
													return (
														<div className="space-y-6">
															<article className="prose prose-zinc dark:prose-invert max-w-none select-text">
																<MarkdownRenderer
																	content={content}
																	className="text-base leading-relaxed"
																/>
															</article>
															<RichContentWithStyles
																html={contentHtml}
																className="text-base leading-relaxed select-text"
															/>
														</div>
													);
												} else if (contentHtml) {
													// 普通富文本内容
													return (
														<RichContentWithStyles
															html={contentHtml}
															className="text-base leading-relaxed select-text prose-lg"
														/>
													);
												} else if (content) {
													// 纯 Markdown 内容
													return (
														<article className="prose prose-zinc dark:prose-invert max-w-none select-text">
															<MarkdownRenderer
																content={content}
																className="text-base leading-relaxed"
															/>
														</article>
													);
												} else {
													// 无内容
													return (
														<div className="flex flex-col items-center justify-center py-12 text-zinc-400">
															<FileEdit className="w-8 h-8 mb-2 opacity-50" />
															<p className="text-sm">暂无内容</p>
															<button
																onClick={() => setIsEditing(true)}
																className="mt-2 text-xs text-blue-600 hover:underline"
															>
																开始编辑
															</button>
														</div>
													);
												}
											})()
										) : // ResearchSource
											(previewSource as ResearchSource).content ? (
												<article className="prose prose-zinc dark:prose-invert max-w-none select-text">
													<MarkdownRenderer
														content={(previewSource as ResearchSource).content!}
														className="text-base leading-relaxed"
													/>
												</article>
											) : (previewSource as ResearchSource).snippet ? (
												<p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed select-text">
													{(previewSource as ResearchSource).snippet}
												</p>
											) : (
												<p className="text-sm text-zinc-400 text-center py-8">
													暂无内容
												</p>
											)}
									</>
								)}
							</div>
						</div>
					)}
				</div>

				{/* 固定底部操作栏 */}
				{!isEditing && (
					<div className="shrink-0 px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
						<div className="flex items-center gap-2">
							{/* 在中间栏阅读按钮 */}
							{isSource && sourceDetail && (
								<button
									onClick={() => {
										const source = previewSource as Source;
										openSourceInMainView(
											source.id,
											source.title,
											sourceDetail.note
												? {
													content: sourceDetail.note.content,
													content_html: sourceDetail.note.content_html,
												}
												: undefined,
										);
									}}
									className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
								>
									<BookOpen className="w-4 h-4" />
									全屏阅读
								</button>
							)}
							<button
								onClick={handleCopyToEditor}
								className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
							>
								<PenLine className="w-4 h-4" />
								添加到编辑器
							</button>
							{isSource && (
								<button
									onClick={() => handleDeleteSource(previewSource as Source)}
									className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
									title="删除"
								>
									<Trash2 className="w-4 h-4" />
								</button>
							)}
						</div>
					</div>
				)}
			</div>
		);
	};

	// 渲染研究进度视图
	const renderResearchView = () => {
		if (!currentResearch) {
			return (
				<div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
					<div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
						<Search className="w-8 h-8 text-zinc-400" />
					</div>
					<h3 className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">
						暂无研究任务
					</h3>
					<p className="text-sm text-zinc-400 max-w-[200px]">
						在右侧 AI 助手中发起深度研究
					</p>
					<button
						onClick={() => setLeftSidebarView("sources")}
						className="mt-4 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
					>
						返回资料库
					</button>
				</div>
			);
		}

		return (
			<div className="flex flex-col h-full">
				{/* Header */}
				<div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
					<button
						onClick={() => setLeftSidebarView("sources")}
						className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
					>
						<ArrowLeft className="w-4 h-4" />
					</button>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<Sparkles className="w-4 h-4 text-blue-500" />
							<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
								深度研究
							</h2>
						</div>
						<p className="text-xs text-zinc-400 truncate mt-0.5">
							{currentResearch.query}
						</p>
					</div>
					{currentResearch.status === "completed" && (
						<button
							onClick={() => workspaceStore.clearCurrentResearch()}
							className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>

				{/* Research Progress */}
				<div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4">
					{/* Steps Timeline */}
					<div className="space-y-3">
						<h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
							研究进度
						</h3>
						<div className="space-y-2">
							{currentResearch.steps.map((step) => (
								<div
									key={step.id}
									className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${step.status === "running"
										? "bg-blue-50 dark:bg-blue-900/20"
										: step.status === "completed"
											? "bg-green-50/50 dark:bg-green-900/10"
											: step.status === "error"
												? "bg-red-50/50 dark:bg-red-900/10"
												: "bg-zinc-50 dark:bg-zinc-800/50"
										}`}
								>
									<div className="mt-0.5">{getStepIcon(step)}</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
											{step.title}
										</p>
										{step.description && (
											<p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
												{step.description}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Found Sources */}
					{currentResearch.sources.length > 0 && (
						<div className="space-y-3">
							<h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
								发现的资料 ({currentResearch.sources.length})
							</h3>
							<div className="space-y-2">
								{currentResearch.sources.map((source) => (
									<button
										key={source.id}
										onClick={() => handleOpenResearchSource(source)}
										className="w-full flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-left transition-colors group"
									>
										<div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 shrink-0">
											{source.type === "search_result" ? (
												<Globe className="w-4 h-4" />
											) : (
												<FileText className="w-4 h-4" />
											)}
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
												{source.title}
											</p>
											{source.snippet && (
												<p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
													{source.snippet}
												</p>
											)}
										</div>
										<ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 shrink-0 mt-1" />
									</button>
								))}
							</div>
						</div>
					)}

					{/* Summary */}
					{currentResearch.summary && (
						<div className="space-y-3">
							<h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
								研究总结
							</h3>
							<div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
								<article className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
									<MarkdownRenderer
										content={currentResearch.summary}
										className="text-sm"
									/>
								</article>
							</div>
						</div>
					)}
				</div>
			</div>
		);
	};

	// 渲染资料列表视图
	const renderViewTabs = () => (
		<div className="flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 p-1">
			{(["sources", "cards"] as const).map((tab) => {
				const isActive = leftSidebarView === tab;
				return (
					<button
						key={tab}
						onClick={() => setLeftSidebarView(tab)}
						className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${isActive
							? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm"
							: "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
							}`}
					>
						{tab === "sources" ? "资料" : "卡片"}
					</button>
				);
			})}
		</div>
	);

	const renderSourceCard = useCallback(
		(source: Source) => {
			const isSelected = selectedIdSet.has(source.id);
			const cardBase =
				viewMode === "grid" ? "p-3 flex flex-col" : "p-2 flex items-center gap-3";
			const cardState = selectionMode
				? isSelected
					? "ring-1 ring-blue-500 bg-blue-50/50 dark:bg-blue-900/20"
					: "border border-dashed border-zinc-200 dark:border-zinc-700"
				: viewMode === "grid"
					? "ring-1 ring-zinc-200/60 dark:ring-zinc-700/50 bg-white dark:bg-zinc-800/50 hover:ring-zinc-300/80 dark:hover:ring-zinc-600/60 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:-translate-y-0.5"
					: "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 hover:pl-3";
			const isDraggingThis = isMouseDragging && dragItem?.sourceId === source.id;
			return (
				<div
					key={source.id}
					draggable={!selectionMode}
					onDragStart={(e) => {
						if (selectionMode) {
							e.preventDefault();
							return;
						}
						handleDragStart(e, source.id);
					}}
					onDragEnd={handleDragEnd}
					onMouseDown={(e) => {
						if (e.button === 0 && !selectionMode) {
							startDrag(
								{
									type: "source",
									sourceId: source.id,
									sourceData: source,
								},
								e,
							);
						}
					}}
					onClick={() =>
						selectionMode ? toggleSelection(source.id) : handleOpenDetail(source)
					}
					onContextMenu={(e) => {
						if (selectionMode) return;
						e.preventDefault();
						setContextMenu({ x: e.clientX, y: e.clientY, source });
					}}
					className={`group cursor-pointer rounded-xl transition-all duration-200 relative ${cardBase} ${cardState} ${isDraggingThis ? "opacity-50 scale-95" : ""}`}
				>
					{selectionMode ? (
						<button
							onClick={(e) => {
								e.stopPropagation();
								toggleSelection(source.id);
							}}
							className={`absolute top-2 left-2 p-1 rounded-md transition-colors ${isSelected
								? "bg-blue-600 text-white"
								: "bg-white/80 dark:bg-zinc-900/60 text-zinc-400"
								}`}
						>
							{isSelected ? (
								<CheckSquare className="w-4 h-4" />
							) : (
								<Square className="w-4 h-4" />
							)}
						</button>
					) : null}
					<div
						className={`w-8 h-8 rounded-lg ${getKindColor(source.kind)} bg-opacity-10 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105`}
					>
						{getIconForSource(source.kind)}
					</div>
					<div className={viewMode === "grid" ? "mt-2" : "flex-1 min-w-0 ml-1"}>
						<h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">
							{source.title}
						</h3>
						<div className="flex items-center gap-2 mt-1">
							<p className="text-[10px] text-zinc-400">
								{new Date(source.created_at).toLocaleDateString("zh-CN", {
									month: "short",
									day: "numeric",
								})}
							</p>
							<span
								className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getScopeBadgeClassName(source)}`}
							>
								{getScopeLabel(source)}
							</span>
							{source.source_type === SourceOrigin.BrowserClip ? (
								<span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-medium">
									<Globe className="w-2.5 h-2.5" />
									剪存
								</span>
							) : null}
							{source.source_type === SourceOrigin.WebSearch ? (
								<span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium">
									<Search className="w-2.5 h-2.5" />
									搜索
								</span>
							) : null}
							{source.source_type === SourceOrigin.Import ? (
								<span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-zinc-100/70 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 rounded text-[10px] font-medium">
									<ArrowDownToLine className="w-2.5 h-2.5" />
									导入
								</span>
							) : null}
							{(source.tags || []).slice(0, 2).map((tag) => (
								<span
									key={`${source.id}-tag-${tag}`}
									className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100/80 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-300"
								>
									#{tag}
								</span>
							))}
						</div>
					</div>
					{!selectionMode ? (
						<button
							onClick={(e) => {
								e.stopPropagation();
								void handleDeleteSource(source);
							}}
							className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all shrink-0 hover:scale-110"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					) : null}
				</div>
			);
		},
		[
			selectedIdSet,
			viewMode,
			selectionMode,
			isMouseDragging,
			dragItem,
			startDrag,
			handleDragStart,
			handleDragEnd,
			handleOpenDetail,
			getScopeBadgeClassName,
			getScopeLabel,
		],
	);

	const renderSourcesView = () => {
		return (
			<>
				<ResourceSidebarHeader
					currentResearch={currentResearch}
					viewMode={viewMode}
					selectionMode={selectionMode}
					viewTabs={renderViewTabs()}
					onOpenResearch={() => setLeftSidebarView("research")}
					onOpenFolderModal={() => setIsFolderModalOpen(true)}
					onToggleViewMode={() =>
						setViewMode(viewMode === "grid" ? "list" : "grid")
					}
					onOpenSettings={onOpenSettings}
					onToggleSelectionMode={() =>
						selectionMode ? exitSelectionMode() : setSelectionMode(true)
					}
				/>

				{renderBreadcrumb()}

				{selectionMode && (
					<div className="px-4 py-2 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/30 backdrop-blur-sm text-xs">
						<span className="text-zinc-500">已选 {selectedIds.length} 条</span>
						<button
							onClick={handleSelectAll}
							className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 transition-colors"
						>
							{selectedIds.length === sources.length ? "取消全选" : "全选"}
						</button>
						<div className="flex items-center gap-2 ml-auto">
							<button
								onClick={handleBulkAddToContext}
								disabled={selectedSources.length === 0}
								className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedSources.length === 0
									? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/50"
									: "bg-zinc-900 text-white hover:bg-zinc-800"
									}`}
							>
								添加到 AI 上下文
							</button>
							<button
								onClick={() => {
									const initialTarget =
										currentFolderId && currentFolderId !== UNASSIGNED_FOLDER_ID
											? currentFolderId
											: UNASSIGNED_FOLDER_ID;
									setMoveFolderTargetId(initialTarget);
									setIsMoveFolderModalOpen(true);
								}}
								disabled={selectedSources.length === 0}
								className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedSources.length === 0
									? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/50"
									: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
									}`}
							>
								移动
							</button>
							<button
								onClick={handleDeleteSelected}
								disabled={selectedSources.length === 0}
								className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedSources.length === 0
									? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/50"
									: "bg-red-50 text-red-600 hover:bg-red-100"
									}`}
							>
								删除
							</button>
						</div>
					</div>
				)}

				{/* Content */}
				<div
					ref={sourceListScrollRef}
					className="flex-1 overflow-y-auto scrollbar-hide p-3"
					onDragOver={(e) => {
						// 在整个内容区域处理拖拽，允许 drop
						const hasSourceData =
							draggedSourceId ||
							e.dataTransfer.types.includes("application/x-source-id");
						if (uiDebugLogsEnabled) {
							debugLog(
								"[Drag] 内容区域 onDragOver, hasSourceData:",
								hasSourceData,
								"types:",
								Array.from(e.dataTransfer.types),
							);
						}
						if (hasSourceData) {
							e.preventDefault();
							e.stopPropagation();
							e.dataTransfer.dropEffect = "move";
						}
					}}
					onDrop={(e) => {
						// 在内容区域 drop，检查是否在文件夹上
						e.preventDefault();
						e.stopPropagation();

						const sourceId =
							draggedSourceId ||
							e.dataTransfer.getData("application/x-source-id");
						if (uiDebugLogsEnabled) {
							debugLog(
								"[Drag] 内容区域 onDrop 触发, sourceId:",
								sourceId,
								"target:",
								(e.target as HTMLElement)?.tagName,
							);
						}

						if (!sourceId) {
							debugWarn("[Drag] 没有 sourceId");
							return;
						}

						// 查找最近的文件夹元素
						const target = e.target as HTMLElement;
						const folderElement = target.closest("[data-folder-id]");

						if (folderElement) {
							const folderId = folderElement.getAttribute("data-folder-id");
							if (folderId) {
								debugLog("[Drag] 在内容区域 drop，找到文件夹:", folderId);
								handleFolderDrop(e, folderId);
								return;
							}
						}

						// 如果没有找到文件夹，移动到未归类
						debugLog("[Drag] 在内容区域 drop，未找到文件夹，移动到未归类");
						handleFolderDrop(e, UNASSIGNED_FOLDER_ID);
					}}
				>
					{errorMessage ? (
						<div className="text-center py-8">
							<p className="text-sm text-red-500 mb-2">{errorMessage}</p>
							<button
								onClick={fetchSources}
								className="text-xs text-blue-600 hover:underline"
							>
								重试
							</button>
						</div>
					) : isLoading ? (
						<div className="flex items-center justify-center h-32">
							<Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
						</div>
					) : sources.length === 0 && currentSubfolders.length === 0 ? (
						<div className="text-center py-12">
							<div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
								<FileText className="w-7 h-7 text-zinc-400" />
							</div>
							<p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
								暂无资料
							</p>
							<p className="text-xs text-zinc-400">点击下方按钮添加</p>
						</div>
					) : (
						<div
							className={
								viewMode === "grid" ? "grid grid-cols-2 gap-2" : "space-y-1"
							}
							onDragOver={(e) => {
								// 在整个列表容器上处理拖拽，允许 drop
								const hasSourceData =
									draggedSourceId ||
									e.dataTransfer.types.includes("application/x-source-id");
								if (uiDebugLogsEnabled) {
									debugLog(
										"[Drag] 列表容器 onDragOver, hasSourceData:",
										hasSourceData,
										"types:",
										Array.from(e.dataTransfer.types),
									);
								}
								if (hasSourceData) {
									e.preventDefault();
									e.stopPropagation();
									e.dataTransfer.dropEffect = "move";
								}
							}}
							onDrop={(e) => {
								// 在列表容器上 drop，检查是否在文件夹上
								e.preventDefault();
								e.stopPropagation();

								const sourceId =
									draggedSourceId ||
									e.dataTransfer.getData("application/x-source-id");
								if (uiDebugLogsEnabled) {
									debugLog(
										"[Drag] 列表容器 onDrop 触发, sourceId:",
										sourceId,
										"target:",
										(e.target as HTMLElement)?.tagName,
										"className:",
										(e.target as HTMLElement)?.className,
									);
								}

								if (!sourceId) {
									debugWarn("[Drag] 列表容器 drop，没有 sourceId");
									return;
								}

								// 查找最近的文件夹元素
								const target = e.target as HTMLElement;
								const folderElement = target.closest("[data-folder-id]");

								if (folderElement) {
									const folderId = folderElement.getAttribute("data-folder-id");
									if (folderId) {
										debugLog(
											"[Drag] 在列表容器 drop，找到文件夹:",
											folderId,
										);
										handleFolderDrop(e, folderId);
										return;
									}
								}

								// 如果没有找到文件夹，移动到未归类
								debugLog(
									"[Drag] 在列表容器 drop，未找到文件夹，移动到未归类",
								);
								handleFolderDrop(e, UNASSIGNED_FOLDER_ID);
							}}
						>
							{/* 文件夹列表 */}
							{currentSubfolders.map((folder) => renderFolderItem(folder))}

							{/* 资料列表 */}
							{shouldVirtualizeSources ? (
								<div
									style={{
										height: `${sourceVirtualizer.getTotalSize()}px`,
										position: "relative",
									}}
								>
									{sourceVirtualizer.getVirtualItems().map((virtualRow) => {
										const source = sources[virtualRow.index];
										if (!source) return null;
										return (
											<div
												key={source.id}
												data-index={virtualRow.index}
												ref={sourceVirtualizer.measureElement}
												style={{
													position: "absolute",
													top: 0,
													left: 0,
													width: "100%",
													transform: `translateY(${virtualRow.start}px)`,
												}}
											>
												{renderSourceCard(source)}
											</div>
										);
									})}
								</div>
							) : (
								sources.map((source) => (
									<div
										key={source.id}
										style={
											viewMode === "list"
												? ({ contentVisibility: "auto" } as const)
												: undefined
										}
									>
										{renderSourceCard(source)}
									</div>
								))
							)}
						</div>
					)}
				</div>

				{/* Bottom Actions */}
				<div className="p-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center gap-2 flex-wrap shrink-0">
					<button
						onClick={() => {
							setLeftSidebarView("websearch");
						}}
						onMouseEnter={preloadWebSearchModule}
						className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg text-xs font-medium text-white transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
					>
						<Search className="w-3.5 h-3.5" />
						网络搜索
					</button>
					<button
						onClick={() => {
							setActiveTab("text");
							setIsAddModalOpen(true);
						}}
						className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-zinc-800 ring-1 ring-zinc-200/70 dark:ring-zinc-700/50 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
					>
						<PenLine className="w-3.5 h-3.5" />
						笔记
					</button>
					<button
						onClick={() => {
							setActiveTab("web");
							setIsAddModalOpen(true);
						}}
						className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-zinc-800 ring-1 ring-zinc-200/70 dark:ring-zinc-700/50 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
					>
						<Link className="w-3.5 h-3.5" />
						链接
					</button>
					<button
						onClick={() => {
							setActiveTab("file");
							setIsAddModalOpen(true);
						}}
						className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-zinc-800 ring-1 ring-zinc-200/70 dark:ring-zinc-700/50 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
					>
						<Paperclip className="w-3.5 h-3.5" />
						文件
					</button>
				</div>
			</>
		);
	};

	const renderCardsView = () => {
		return (
			<>
				<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-zinc-100 dark:border-zinc-800">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<ImageIcon className="w-4 h-4 text-zinc-400" />
							<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
								分享卡片
							</h2>
						</div>
						{renderViewTabs()}
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={fetchCards}
							className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
							title="刷新卡片"
						>
							{isLoadingCards ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<RefreshCw className="w-4 h-4" />
							)}
						</button>
						<button
							onClick={onOpenSettings}
							className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							<Settings className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto scrollbar-hide p-3">
					{cardErrorMessage ? (
						<div className="text-center py-10">
							<p className="text-sm text-red-500 mb-2">{cardErrorMessage}</p>
							<button
								onClick={fetchCards}
								className="text-xs text-blue-600 hover:underline"
							>
								重试
							</button>
						</div>
					) : isLoadingCards ? (
						<div className="flex items-center justify-center h-32">
							<Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
						</div>
					) : cards.length === 0 ? (
						<div className="text-center py-12">
							<div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
								<ImageIcon className="w-7 h-7 text-zinc-400" />
							</div>
							<p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
								暂无分享卡片
							</p>
							<p className="text-xs text-zinc-400">
								请在浏览器插件中生成并发送卡片
							</p>
						</div>
					) : (
						<div className="space-y-4">
							{cards.map((card) => {
								const imageSrc = cardImages[card.id];
								return (
									<div
										key={card.id}
										onClick={() => setCardPreview(card)}
										className="group rounded-2xl bg-white dark:bg-zinc-800/50 ring-1 ring-zinc-200/50 dark:ring-zinc-700/40 hover:ring-zinc-300/80 dark:hover:ring-zinc-600/60 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer overflow-hidden hover:-translate-y-1"
									>
										{/* 卡片图片区域 */}
										<div className="relative bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900">
											{imageSrc ? (
												<img
													src={imageSrc}
													alt={card.title}
													className="w-full object-contain"
													onError={(e) => {
														console.error("图片加载失败:", imageSrc);
														(e.target as HTMLImageElement).style.display =
															"none";
													}}
												/>
											) : (
												<div className="aspect-[4/5] flex items-center justify-center">
													<div className="text-center">
														<ImageIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
														<p className="text-xs text-zinc-400">
															图片加载中...
														</p>
													</div>
												</div>
											)}
											{/* 主题标签 */}
											{card.theme_id && (
												<span className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-medium rounded-full bg-white/90 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-300 shadow-sm backdrop-blur-sm">
													{card.theme_id}
												</span>
											)}
										</div>

										{/* 卡片信息区域 */}
										<div className="p-4 space-y-3">
											<div className="flex items-start justify-between gap-3">
												<h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 leading-snug line-clamp-2 flex-1">
													{card.title}
												</h3>
												{card.source_url && (
													<button
														onClick={(e) => {
															e.stopPropagation();
															handleOpenCardSource(card);
														}}
														className="shrink-0 p-1.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
														title="访问原文"
													>
														<ExternalLink className="w-3.5 h-3.5" />
													</button>
												)}
											</div>

											<p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-3">
												{card.text}
											</p>

											<div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-700/50">
												<div className="flex items-center gap-2 text-xs text-zinc-400">
													{card.aspect_ratio && (
														<span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700/50 rounded text-[10px]">
															{card.aspect_ratio}
														</span>
													)}
													<span>
														{new Date(card.created_at).toLocaleDateString(
															"zh-CN",
															{ month: "short", day: "numeric" },
														)}
													</span>
												</div>
												<button
													onClick={(e) => {
														e.stopPropagation();
														handleDeleteCard(card);
													}}
													className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
													title="删除卡片"
												>
													<Trash2 className="w-3.5 h-3.5" />
												</button>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</>
		);
	};

	return (
		<aside
			data-resource-sidebar
			className="flex-1 bg-white dark:bg-zinc-900 flex flex-col h-full font-sans min-w-0 relative"
			onDragOver={handleContainerDragOver}
			onDrop={handleContainerDrop}
		>
			<DragAndDropImportUI
				isDragging={dragImport.isDragging && !draggedSourceId}
				queue={dragImport.queue}
				queueStatus={dragImport.queueStatus}
				onStart={handleStartDragImport}
				onCancel={handleCancelDragImport}
				onClear={dragImport.clearQueue}
				onRemoveItem={dragImport.removeItem}
			/>
			<ResourceSidebarDialogs
				deleteConfirm={deleteConfirm}
				onCancelDeleteSource={() => setDeleteConfirm(null)}
				onConfirmDeleteSource={(source) => {
					void handleDeleteSource(source, true);
				}}
				cardDeleteConfirm={cardDeleteConfirm}
				onCancelDeleteCard={() => setCardDeleteConfirm(null)}
				onConfirmDeleteCard={() => {
					void confirmDeleteCard();
				}}
				batchDeleteConfirm={batchDeleteConfirm}
				onCancelBatchDelete={handleCancelBatchDelete}
				onConfirmBatchDelete={() => {
					void handleConfirmBatchDelete();
				}}
				folderDeleteConfirm={folderDeleteConfirm}
				onCancelDeleteFolder={() => setFolderDeleteConfirm(null)}
				onConfirmDeleteFolder={(folder) => {
					void handleDeleteFolder(folder, true);
				}}
			/>

			{cardPreview && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
					onClick={() => setCardPreview(null)}
				>
					<div
						className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
						onClick={(e) => e.stopPropagation()}
					>
						{/* 头部 */}
						<div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
							<div className="flex-1 min-w-0 pr-4">
								<h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 truncate">
									{cardPreview.title}
								</h3>
								<p className="text-xs text-zinc-400 mt-0.5">
									{new Date(cardPreview.created_at).toLocaleString("zh-CN", {
										year: "numeric",
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</p>
							</div>
							<div className="flex items-center gap-1.5 shrink-0">
								{cardPreview.source_url && (
									<button
										onClick={() => handleOpenCardSource(cardPreview)}
										className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
									>
										访问原文
									</button>
								)}
								<button
									onClick={() => setCardPreview(null)}
									className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
								>
									<X className="w-4 h-4" />
								</button>
							</div>
						</div>

						{/* 内容区域 - 可滚动 */}
						<div className="overflow-y-auto max-h-[calc(90vh-80px)]">
							{/* 图片 */}
							<div className="bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900">
								{cardImages[cardPreview.id] ? (
									<img
										src={cardImages[cardPreview.id]}
										alt={cardPreview.title}
										className="w-full object-contain"
										onError={(e) => {
											(e.target as HTMLImageElement).style.display = "none";
										}}
									/>
								) : (
									<div className="aspect-[4/5] flex items-center justify-center">
										<div className="text-center">
											<ImageIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
											<p className="text-sm text-zinc-400">图片加载中...</p>
										</div>
									</div>
								)}
							</div>

							{/* 文本内容 */}
							<div className="p-5 space-y-4">
								<div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
									<p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
										{cardPreview.text}
									</p>
								</div>

								{/* 元信息 */}
								<div className="flex flex-wrap gap-2">
									{cardPreview.theme_id && (
										<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-400">
											<span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
											{cardPreview.theme_id}
										</span>
									)}
									{cardPreview.font_id && (
										<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-400">
											<Type className="w-3 h-3" />
											{cardPreview.font_id}
										</span>
									)}
									{cardPreview.aspect_ratio && (
										<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-400">
											<ImageIcon className="w-3 h-3" />
											{cardPreview.aspect_ratio}
										</span>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* 右键菜单 */}
			{contextMenu && sourceContextMenuItems.length > 0 ? (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={sourceContextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			) : null}

			{/* 文件夹右键菜单 */}
			{folderContextMenu && folderContextMenuItems.length > 0 ? (
				<ContextMenu
					x={folderContextMenu.x}
					y={folderContextMenu.y}
					items={folderContextMenuItems}
					onClose={() => setFolderContextMenu(null)}
				/>
			) : null}

			{/* 主内容区域 - 根据视图模式切换 */}
				{leftSidebarView === "detail" && previewSource ? (
					renderDetailView()
				) : leftSidebarView === "research" ? (
					renderResearchView()
				) : leftSidebarView === "agent" ? (
					<Suspense
						fallback={
							<div className="flex h-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
								正在加载 Agent 面板...
							</div>
						}
					>
						<div onMouseEnter={preloadAgentTaskPanel}>
							<AgentTaskPanel
								onBack={() => setLeftSidebarView("sources")}
								onArtifactClick={(artifact) => {
									if (artifact.url) {
										workspaceStore.setMainView("browser");
									}
								}}
							/>
						</div>
					</Suspense>
				) : leftSidebarView === "cards" ? (
					renderCardsView()
				) : leftSidebarView === "websearch" ? (
				<div className="flex flex-col h-full">
					{/* Header */}
					<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-zinc-100 dark:border-zinc-800">
						<div className="flex items-center gap-2">
							<button
								onClick={() => setLeftSidebarView("sources")}
								className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
							>
								<ArrowLeft className="w-4 h-4" />
							</button>
							<Search className="w-4 h-4 text-blue-500" />
							<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
								网络搜索
							</h2>
						</div>
						<button
							onClick={onOpenSettings}
							className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							<Settings className="w-4 h-4" />
						</button>
					</div>

					{/* Search Module */}
						<div className="flex-1 overflow-y-auto scrollbar-hide p-3">
							<Suspense
								fallback={
									<div className="flex h-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
										正在加载搜索模块...
									</div>
								}
							>
								<WebSearchModule
									onAddSource={(_sourceId) => {
										void fetchSources();
									}}
								/>
							</Suspense>
						</div>
					</div>
				) : (
				renderSourcesView()
			)}

			{/* Folder Modal */}
			<Modal
				isOpen={isFolderModalOpen}
				onClose={() => setIsFolderModalOpen(false)}
				title="新建文件夹"
			>
				<div className="space-y-4">
					<div className="text-xs text-zinc-500">
						{currentFolderId && currentFolderId !== UNASSIGNED_FOLDER_ID
							? `父文件夹：${foldersById.get(currentFolderId)?.name || "（未知）"}`
							: "父文件夹：根目录"}
					</div>
					<input
						type="text"
						value={newFolderName}
						onChange={(e) => setNewFolderName(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-base font-medium placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
						placeholder="输入文件夹名称..."
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreateFolder();
						}}
					/>
					<div className="flex items-center justify-end gap-2">
						<button
							onClick={() => setIsFolderModalOpen(false)}
							className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleCreateFolder}
							disabled={!newFolderName.trim()}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							创建
						</button>
					</div>
				</div>
			</Modal>

			{/* Move Folder Modal */}
			<Modal
				isOpen={isMoveFolderModalOpen}
				onClose={() => setIsMoveFolderModalOpen(false)}
				title="移动到文件夹"
			>
				<div className="space-y-4">
					<div className="text-xs text-zinc-500">
						将 {selectedIds.length} 条资料移动到：
					</div>
					<select
						value={moveFolderTargetId}
						onChange={(e) => setMoveFolderTargetId(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
					>
						<option value={UNASSIGNED_FOLDER_ID}>未归类</option>
						{flatFolderOptions.map((opt) => (
							<option key={opt.id} value={opt.id}>
								{`${"—".repeat(opt.depth)}${opt.depth > 0 ? " " : ""}${opt.name}`}
							</option>
						))}
					</select>
					<div className="flex items-center justify-end gap-2">
						<button
							onClick={() => setIsMoveFolderModalOpen(false)}
							className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleMoveSelectedToFolder}
							disabled={!selectedIds.length}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							移动
						</button>
					</div>
				</div>
			</Modal>

			{/* Rename Folder Modal */}
			<Modal
				isOpen={isRenameFolderModalOpen}
				onClose={() => {
					setIsRenameFolderModalOpen(false);
					setRenameFolderTarget(null);
					setRenameFolderName("");
				}}
				title="重命名文件夹"
			>
				<div className="space-y-4">
					<input
						type="text"
						value={renameFolderName}
						onChange={(e) => setRenameFolderName(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-base font-medium placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
						placeholder="输入新名称..."
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRenameFolder();
						}}
					/>
					<div className="flex items-center justify-end gap-2">
						<button
							onClick={() => {
								setIsRenameFolderModalOpen(false);
								setRenameFolderTarget(null);
								setRenameFolderName("");
							}}
							className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleRenameFolder}
							disabled={!renameFolderName.trim()}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							确认
						</button>
					</div>
				</div>
			</Modal>

			{/* Move Folder To Modal */}
			<Modal
				isOpen={isMoveFolderToModalOpen}
				onClose={() => {
					setIsMoveFolderToModalOpen(false);
					setMoveFolderSource(null);
					setMoveFolderToTargetId("");
				}}
				title="移动文件夹"
			>
				<div className="space-y-4">
					<div className="text-xs text-zinc-500">
						将「{moveFolderSource?.name}」移动到：
					</div>
					<select
						value={moveFolderToTargetId}
						onChange={(e) => setMoveFolderToTargetId(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
					>
						<option value="">根目录</option>
						{moveFolderSource &&
							getAvailableParentFolders(moveFolderSource.id).map((opt) => (
								<option key={opt.id} value={opt.id}>
									{`${"—".repeat(opt.depth)}${opt.depth > 0 ? " " : ""}${opt.name}`}
								</option>
							))}
					</select>
					<div className="flex items-center justify-end gap-2">
						<button
							onClick={() => {
								setIsMoveFolderToModalOpen(false);
								setMoveFolderSource(null);
								setMoveFolderToTargetId("");
							}}
							className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleMoveFolderTo}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90"
						>
							移动
						</button>
					</div>
				</div>
			</Modal>

			{/* Single Source Move Modal */}
			<Modal
				isOpen={!!singleSourceMoveModal}
				onClose={() => {
					setSingleSourceMoveModal(null);
					setSingleSourceMoveTargetId("");
				}}
				title="移动到文件夹"
			>
				<div className="space-y-4">
					<div className="text-xs text-zinc-500 dark:text-zinc-400">
						将「{singleSourceMoveModal?.title}」移动到：
					</div>
					<div className="max-h-[300px] overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/30">
						<div className="p-2 space-y-1">
							{/* 未归类选项 */}
							<button
								onClick={() =>
									setSingleSourceMoveTargetId(UNASSIGNED_FOLDER_ID)
								}
								className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${singleSourceMoveTargetId === UNASSIGNED_FOLDER_ID
									? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
									: "hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
									}`}
							>
								<FolderIcon className="w-4 h-4 shrink-0" />
								<span className="text-sm font-medium">未归类</span>
							</button>
							{/* 文件夹树 */}
							{flatFolderOptions.map((opt) => (
								<button
									key={opt.id}
									onClick={() => setSingleSourceMoveTargetId(opt.id)}
									className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${singleSourceMoveTargetId === opt.id
										? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
										: "hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
										}`}
									style={{ paddingLeft: 12 + opt.depth * 20 }}
								>
									<FolderIcon className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
									<span className="text-sm font-medium truncate">
										{opt.name}
									</span>
								</button>
							))}
						</div>
					</div>
					<div className="flex items-center justify-end gap-2 pt-2">
						<button
							onClick={() => {
								setSingleSourceMoveModal(null);
								setSingleSourceMoveTargetId("");
							}}
							className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleSingleSourceMove}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity font-medium"
						>
							移动
						</button>
					</div>
				</div>
			</Modal>

			{/* Add Modal */}
			<Modal
				isOpen={isAddModalOpen}
				onClose={() => setIsAddModalOpen(false)}
				title="新增资料"
			>
				<div className="space-y-4">
					{/* Tabs */}
					<div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
						{(["web", "text", "file"] as const).map((tab) => (
							<button
								key={tab}
								onClick={() => setActiveTab(tab)}
								className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${activeTab === tab
									? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
									: "text-zinc-500"
									}`}
							>
								{tab === "web" ? "网页" : tab === "text" ? "笔记" : "文件"}
							</button>
						))}
					</div>

					<input
						type="text"
						value={newSourceTitle}
						onChange={(e) => setNewSourceTitle(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-base font-medium placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
						placeholder="输入标题..."
					/>

					{activeTab === "web" && (
						<input
							type="url"
							value={newSourceContent}
							onChange={(e) => setNewSourceContent(e.target.value)}
							className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-sm font-mono placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
							placeholder="https://..."
						/>
					)}

					{activeTab === "text" && (
						<textarea
							value={newSourceContent}
							onChange={(e) => setNewSourceContent(e.target.value)}
							className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-sm h-48 resize-none placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 leading-relaxed"
							placeholder="输入内容..."
						/>
					)}

					{activeTab === "file" && (
						<div className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-8 text-center hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors relative group">
							<input
								type="file"
								accept=".txt,.md,.markdown,.json,.csv,.html,.htm,.xml,.yaml,.yml,.toml,.rst,.log,.conf,.ini,.rtf,.pdf,.docx,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.svg"
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (!file) return;
									const reader = new FileReader();
									reader.onload = (event) => {
										setNewSourceContent(event.target?.result as string);
										setNewSourceTitle(file.name);
										setSelectedFile(file);
									};
									reader.readAsText(file);
								}}
							/>
							<div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
								<Paperclip className="w-5 h-5 text-zinc-400" />
							</div>
							<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
								{selectedFile ? selectedFile.name : "点击或拖拽文件上传"}
							</p>
							<p className="text-xs text-zinc-400 mt-1">
								支持文本、PDF、Word、图片等常见格式
							</p>
						</div>
					)}

					<div className="flex justify-end gap-2 pt-4">
						<button
							onClick={() => setIsAddModalOpen(false)}
							className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleCreateSource}
							className="px-6 py-2 bg-black dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-black text-sm font-medium rounded-lg shadow-sm transition-colors"
						>
							创建文档
						</button>
					</div>
				</div>
			</Modal>
		</aside>
	);
}
