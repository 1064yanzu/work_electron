// 资料侧边栏 - 主容器（组合各子模块）

import { ArrowLeft, Search, Settings } from "lucide-react";
import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
	fileDelete,
	fileRestore,
	fileRevealInFinder,
	fileSetScope,
	fileSetTags,
	updateSource,
} from "../../lib/api";
import { getPerformanceTuning } from "../../lib/config";
import {
	buildFileItemContextMenu,
	buildFolderItemContextMenu,
} from "../../lib/contextMenu/actions";
import { EVENTS, events } from "../../lib/events";
import { queryKeys, useSourcesQuery } from "../../lib/query";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import type { Source } from "../../types";
import { ResourceSidebarDialogs } from "./sidebar/ResourceSidebarDialogs";
import { useResourceSidebarActions } from "./sidebar/useResourceSidebarActions";
import { ContextMenu } from "../ui/ContextMenu";
import { DragAndDropImportUI } from "../ui/DragAndDropImportUI";
import { inputDialog } from "../ui/InputDialog";
import { toast } from "../ui/Toast";

// Extracted hooks
import {
	UNASSIGNED_FOLDER_ID,
	useFolderManagement,
} from "./hooks/useFolderManagement";
import { useSourceDragDrop } from "./hooks/useSourceDragDrop";
import { useSourceImport } from "./hooks/useSourceImport";
import { useSourceSelection } from "./hooks/useSourceSelection";

// Extracted view components
import { CardsHubView } from "./CardsHubView";
import { ResearchView } from "./ResearchView";
import { ResourceModals } from "./ResourceModals";
import {
	SourceDetailView,
	type SourceDetailViewHandle,
} from "./SourceDetailView";
import { SourceListView } from "./SourceListView";
import { SidebarRail } from "../layout/SidebarRail";
import { ThreadsView } from "./ThreadsView";
import { ProjectFilesView } from "./ProjectFilesView";
import { SkillsView } from "./SkillsView";
import { WikiView } from "../wiki/WikiView";
import { useLayoutStoreSelector } from "../../lib/stores/layoutStore";

const AgentTaskPanel = lazy(() => import("../agent/AgentTaskPanel"));
const WebSearchModule = lazy(() => import("../WebSearchModule"));

interface ResourceSidebarProps {
	onOpenSettings: () => void;
}

export default function ResourceSidebar({
	onOpenSettings,
}: ResourceSidebarProps) {
	const leftSidebarCollapsed = useLayoutStoreSelector(
		(state) => state.leftSidebarCollapsed,
	);
	const [sources, setSources] = useState<Source[]>([]);
	const [rawSources, setRawSources] = useState<Source[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [viewMode, setViewMode] = useState<"grid" | "list">("list");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// 右键菜单
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		source: Source;
	} | null>(null);

	// 删除确认
	const [deleteConfirm, setDeleteConfirm] = useState<Source | null>(null);

	// Modal State
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<"web" | "text" | "file">("web");
	const [newSourceTitle, setNewSourceTitle] = useState("");
	const [newSourceContent, setNewSourceContent] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);

	// Performance settings
	const [sourceAutoRefreshMs, setSourceAutoRefreshMs] = useState(10000);
	const [uiDebugLogsEnabled, setUiDebugLogsEnabled] = useState(false);
	const [isWindowVisible, setIsWindowVisible] = useState(
		typeof document === "undefined" || document.visibilityState === "visible",
	);

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
	const queryClient = useQueryClient();

	useEffect(() => {
		const handleVisibilityChange = () => {
			setIsWindowVisible(document.visibilityState === "visible");
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);
	const preloadAgentTaskPanel = useCallback(() => {
		void import("../agent/AgentTaskPanel");
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

	// --- Hooks ---
	const folderMgmt = useFolderManagement(rawSources);

	const fetchSources = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: queryKeys.sources(),
		});
	}, [queryClient]);

	const dragDrop = useSourceDragDrop({
		sources,
		fetchSources,
		debugLog,
		debugWarn,
	});

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
				setPreviewSource(null);
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
		[fetchSources, previewSource, setPreviewSource],
	);

	const selection = useSourceSelection({
		sources,
		fetchSources,
		deleteSourcesWithUndo,
	});

	const sourceImport = useSourceImport({ fetchSources });

	const sourcesQuery = useSourcesQuery(currentProjectId, {
		refetchInterval:
			leftSidebarView === "sources" &&
			isWindowVisible &&
			!sourceImport.dragImport.isDragging &&
			!dragDrop.draggedSourceId
				? sourceAutoRefreshMs
				: false,
	});

	const { createSourceFromModal, revealFolderProjectDirectory } =
		useResourceSidebarActions({
			onCreated: fetchSources,
		});

	// --- Source data sync ---
	useEffect(() => {
		if (Array.isArray(sourcesQuery.data)) {
			setRawSources(sourcesQuery.data);
			setErrorMessage(null);
		}
	}, [sourcesQuery.data]);

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

	// Recompute visible sources
	const recomputeVisibleSources = useCallback(() => {
		const base = rawSources;
		if (!currentFolderId || currentFolderId === UNASSIGNED_FOLDER_ID) {
			setSources(base.filter((s) => s.folder_id == null));
			return;
		}
		const subtreeIds = folderMgmt.getSubtreeFolderIds(currentFolderId);
		setSources(base.filter((s) => s.folder_id && subtreeIds.has(s.folder_id)));
	}, [rawSources, currentFolderId, folderMgmt.getSubtreeFolderIds]);

	useEffect(() => {
		recomputeVisibleSources();
	}, [recomputeVisibleSources]);

	// 切换文件夹时，清理选中状态
	useEffect(() => {
		selection.setSelectedIds([]);
		selection.setSelectionMode(false);
		if (
			previewSource &&
			"id" in previewSource &&
			leftSidebarView === "detail"
		) {
			const source = sources.find((s) => s.id === previewSource.id);
			if (!source) {
				setPreviewSource(null);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentFolderId]);

	// --- Source detail ref for SourceDetailView ---
	const sourceDetailViewRef = useRef<SourceDetailViewHandle>(null);

	// --- Handlers ---
	const handleDeleteSource = useCallback(
		async (source: Source, skipConfirm = false) => {
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
		},
		[deleteSourcesWithUndo],
	);

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
		async (source: Source) => {
			try {
				await fileSetScope({
					id: source.id,
					entity_type: "source",
					scope: "global",
				});
				await fetchSources();
			} catch (error) {
				console.error("切换作用域失败:", error);
				toast.error(
					`切换作用域失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[fetchSources],
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

	const handleOpenDetail = useCallback(
		(source: Source) => {
			// 设置 previewSource 会自动切换视图到 'detail'（在 workspaceStore 中处理）
			// SourceDetailView 的 useEffect 会自动加载详情数据
			setPreviewSource(source);
		},
		[setPreviewSource],
	);

	const handleCreateSource = useCallback(async () => {
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
	}, [createSourceFromModal, newSourceTitle, newSourceContent, activeTab]);

	const handleSingleSourceMove = useCallback(async () => {
		await folderMgmt.handleSingleSourceMove(fetchSources);
	}, [folderMgmt, fetchSources]);

	// --- Context menu items ---
	const sourceContextMenuItems = useCallback(() => {
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
				folderMgmt.setSingleSourceMoveModal(source);
				folderMgmt.setSingleSourceMoveTargetId(
					source.folder_id || UNASSIGNED_FOLDER_ID,
				);
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
			onSetGlobal: () => void handleSetSourceScope(source),
			onDelete: () => void handleDeleteSource(source),
			canSetScope: true,
		});
		return [
			{
				label: "添加到 AI 上下文",
				onClick: () => events.emit(EVENTS.ADD_TO_CONTEXT, { source }),
			},
			{ separator: true, label: "" as string, onClick: () => {} },
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
		folderMgmt,
	]);

	const folderContextMenuItems = useCallback(() => {
		if (!folderMgmt.folderContextMenu) return [];
		const folder = folderMgmt.folderContextMenu.folder;
		return buildFolderItemContextMenu({
			onCreateFile: () => {
				setCurrentFolder(folder.id);
				setActiveTab("text");
				setIsAddModalOpen(true);
			},
			onCreateSubFolder: () => {
				setCurrentFolder(folder.id);
				folderMgmt.setIsFolderModalOpen(true);
			},
			onRename: () => {
				folderMgmt.setRenameFolderTarget(folder);
				folderMgmt.setRenameFolderName(folder.name);
				folderMgmt.setIsRenameFolderModalOpen(true);
			},
			onMove: () => {
				folderMgmt.setMoveFolderSource(folder);
				folderMgmt.setMoveFolderToTargetId(folder.parent_id || "");
				folderMgmt.setIsMoveFolderToModalOpen(true);
			},
			onReveal: () => {
				const projectId = folder.project_id || currentProjectId || undefined;
				void revealFolderProjectDirectory(projectId);
			},
			onDelete: () => void folderMgmt.handleDeleteFolder(folder),
		});
	}, [
		currentProjectId,
		folderMgmt,
		revealFolderProjectDirectory,
		setCurrentFolder,
	]);

	const computedContextMenuItems = sourceContextMenuItems();
	const computedFolderContextMenuItems = folderContextMenuItems();

	return (
		<div className="flex flex-row h-full w-full min-w-0">
			<SidebarRail onOpenSettings={onOpenSettings} />
			{leftSidebarCollapsed ? null : (
				<aside
					data-resource-sidebar
					className="flex-1 bg-transparent flex flex-col h-full font-sans min-w-0 relative"
					onDragOver={dragDrop.handleContainerDragOver}
					onDrop={dragDrop.handleContainerDrop}
				>
					<DragAndDropImportUI
						isDragging={
							sourceImport.dragImport.isDragging && !dragDrop.draggedSourceId
						}
						queue={sourceImport.dragImport.queue}
						queueStatus={sourceImport.dragImport.queueStatus}
						onStart={sourceImport.handleStartDragImport}
						onCancel={sourceImport.handleCancelDragImport}
						onClear={sourceImport.dragImport.clearQueue}
						onRemoveItem={sourceImport.dragImport.removeItem}
					/>
					<ResourceSidebarDialogs
						deleteConfirm={deleteConfirm}
						onCancelDeleteSource={() => setDeleteConfirm(null)}
						onConfirmDeleteSource={(source) => {
							void handleDeleteSource(source, true);
						}}
						cardDeleteConfirm={null}
						onCancelDeleteCard={() => {}}
						onConfirmDeleteCard={() => {}}
						batchDeleteConfirm={selection.batchDeleteConfirm}
						onCancelBatchDelete={selection.handleCancelBatchDelete}
						onConfirmBatchDelete={() => {
							void selection.handleConfirmBatchDelete();
						}}
						folderDeleteConfirm={folderMgmt.folderDeleteConfirm}
						onCancelDeleteFolder={() => folderMgmt.setFolderDeleteConfirm(null)}
						onConfirmDeleteFolder={(folder) => {
							void folderMgmt.handleDeleteFolder(folder, true);
						}}
					/>

					{/* 右键菜单 */}
					{contextMenu && computedContextMenuItems.length > 0 ? (
						<ContextMenu
							x={contextMenu.x}
							y={contextMenu.y}
							items={computedContextMenuItems}
							onClose={() => setContextMenu(null)}
						/>
					) : null}

					{/* 文件夹右键菜单 */}
					{folderMgmt.folderContextMenu &&
					computedFolderContextMenuItems.length > 0 ? (
						<ContextMenu
							x={folderMgmt.folderContextMenu.x}
							y={folderMgmt.folderContextMenu.y}
							items={computedFolderContextMenuItems}
							onClose={() => folderMgmt.setFolderContextMenu(null)}
						/>
					) : null}

					{/* 主内容区域 - 根据视图模式切换 */}
					{leftSidebarView === "detail" && previewSource ? (
						<SourceDetailView
							ref={sourceDetailViewRef}
							fetchSources={fetchSources}
							onDeleteSource={(source) => void handleDeleteSource(source)}
						/>
					) : leftSidebarView === "research" ? (
						<ResearchView
							onOpenResearchSource={(source) => {
								setPreviewSource(source);
							}}
						/>
					) : leftSidebarView === "agent" ? (
						<Suspense
							fallback={
								<div className="flex h-full items-center justify-center text-xs text-text-muted">
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
						<CardsHubView />
					) : leftSidebarView === "threads" ? (
						<ThreadsView />
					) : leftSidebarView === "files" ? (
						<ProjectFilesView />
					) : leftSidebarView === "skills" ? (
						<SkillsView />
					) : leftSidebarView === "wiki" ? (
						<WikiView />
					) : leftSidebarView === "websearch" ? (
						<div className="flex flex-col h-full">
							{/* Header */}
							<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-border">
								<div className="flex items-center gap-2">
									<button
										onClick={() => setLeftSidebarView("sources")}
										className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
									>
										<ArrowLeft className="w-4 h-4" />
									</button>
									<Search className="w-4 h-4 text-focus" />
									<h2 className="font-semibold text-sm text-text-primary">
										网络搜索
									</h2>
								</div>
								<button
									onClick={onOpenSettings}
									className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
								>
									<Settings className="w-4 h-4" />
								</button>
							</div>

							{/* Search Module */}
							<div className="flex-1 overflow-y-auto scrollbar-hide p-3">
								<Suspense
									fallback={
										<div className="flex h-full items-center justify-center text-xs text-text-muted">
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
						<SourceListView
							sources={sources}
							setSources={setSources}
							setRawSources={setRawSources}
							errorMessage={errorMessage}
							isLoading={isLoading}
							viewMode={viewMode}
							setViewMode={setViewMode}
							currentSubfolders={folderMgmt.currentSubfolders}
							breadcrumbPath={folderMgmt.breadcrumbPath}
							getFolderSubtreeCount={folderMgmt.getFolderSubtreeCount}
							draggedSourceId={dragDrop.draggedSourceId}
							dragOverFolderId={dragDrop.dragOverFolderId}
							setDragOverFolderId={dragDrop.setDragOverFolderId}
							handleDragStart={dragDrop.handleDragStart}
							handleDragEnd={dragDrop.handleDragEnd}
							handleFolderDragOver={dragDrop.handleFolderDragOver}
							handleFolderDragLeave={dragDrop.handleFolderDragLeave}
							handleFolderDrop={dragDrop.handleFolderDrop}
							selectionMode={selection.selectionMode}
							setSelectionMode={selection.setSelectionMode}
							selectedIds={selection.selectedIds}
							selectedIdSet={selection.selectedIdSet}
							selectedSources={selection.selectedSources}
							exitSelectionMode={selection.exitSelectionMode}
							toggleSelection={selection.toggleSelection}
							handleSelectAll={selection.handleSelectAll}
							handleBulkAddToContext={selection.handleBulkAddToContext}
							handleDeleteSelected={selection.handleDeleteSelected}
							setIsMoveFolderModalOpen={selection.setIsMoveFolderModalOpen}
							setMoveFolderTargetId={selection.setMoveFolderTargetId}
							handleFolderContextMenu={folderMgmt.handleFolderContextMenu}
							setContextMenu={setContextMenu}
							fetchSources={fetchSources}
							onOpenDetail={handleOpenDetail}
							onOpenSettings={onOpenSettings}
							onDeleteSource={(source) => void handleDeleteSource(source)}
							onOpenFolderModal={() => folderMgmt.setIsFolderModalOpen(true)}
							setActiveTab={setActiveTab}
							setIsAddModalOpen={setIsAddModalOpen}
							viewTabs={null}
							currentResearch={currentResearch}
							uiDebugLogsEnabled={uiDebugLogsEnabled}
							debugLog={debugLog}
							debugWarn={debugWarn}
						/>
					)}

					{/* Modals */}
					<ResourceModals
						isFolderModalOpen={folderMgmt.isFolderModalOpen}
						setIsFolderModalOpen={folderMgmt.setIsFolderModalOpen}
						newFolderName={folderMgmt.newFolderName}
						setNewFolderName={folderMgmt.setNewFolderName}
						handleCreateFolder={folderMgmt.handleCreateFolder}
						currentFolderId={currentFolderId}
						foldersById={folderMgmt.foldersById}
						isMoveFolderModalOpen={selection.isMoveFolderModalOpen}
						setIsMoveFolderModalOpen={selection.setIsMoveFolderModalOpen}
						moveFolderTargetId={selection.moveFolderTargetId}
						setMoveFolderTargetId={selection.setMoveFolderTargetId}
						handleMoveSelectedToFolder={selection.handleMoveSelectedToFolder}
						selectedIds={selection.selectedIds}
						flatFolderOptions={folderMgmt.flatFolderOptions}
						isRenameFolderModalOpen={folderMgmt.isRenameFolderModalOpen}
						setIsRenameFolderModalOpen={folderMgmt.setIsRenameFolderModalOpen}
						renameFolderTarget={folderMgmt.renameFolderTarget}
						setRenameFolderTarget={folderMgmt.setRenameFolderTarget}
						renameFolderName={folderMgmt.renameFolderName}
						setRenameFolderName={folderMgmt.setRenameFolderName}
						handleRenameFolder={folderMgmt.handleRenameFolder}
						isMoveFolderToModalOpen={folderMgmt.isMoveFolderToModalOpen}
						setIsMoveFolderToModalOpen={folderMgmt.setIsMoveFolderToModalOpen}
						moveFolderSource={folderMgmt.moveFolderSource}
						setMoveFolderSource={folderMgmt.setMoveFolderSource}
						moveFolderToTargetId={folderMgmt.moveFolderToTargetId}
						setMoveFolderToTargetId={folderMgmt.setMoveFolderToTargetId}
						handleMoveFolderTo={folderMgmt.handleMoveFolderTo}
						getAvailableParentFolders={folderMgmt.getAvailableParentFolders}
						singleSourceMoveModal={folderMgmt.singleSourceMoveModal}
						setSingleSourceMoveModal={folderMgmt.setSingleSourceMoveModal}
						singleSourceMoveTargetId={folderMgmt.singleSourceMoveTargetId}
						setSingleSourceMoveTargetId={folderMgmt.setSingleSourceMoveTargetId}
						handleSingleSourceMove={handleSingleSourceMove}
						isAddModalOpen={isAddModalOpen}
						setIsAddModalOpen={setIsAddModalOpen}
						activeTab={activeTab}
						setActiveTab={setActiveTab}
						newSourceTitle={newSourceTitle}
						setNewSourceTitle={setNewSourceTitle}
						newSourceContent={newSourceContent}
						setNewSourceContent={setNewSourceContent}
						selectedFile={selectedFile}
						setSelectedFile={setSelectedFile}
						handleCreateSource={handleCreateSource}
					/>
				</aside>
			)}
		</div>
	);
}
