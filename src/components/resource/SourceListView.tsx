// 资料列表视图组件

import {
	FileText,
	Folder as FolderIcon,
	Link,
	Loader2,
	MoreHorizontal,
	Paperclip,
	PenLine,
} from "lucide-react";
import { ChevronRight } from "lucide-react";
import { useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { moveSourcesToFolder } from "../../lib/api";
import { useMouseDrag } from "../../hooks/useMouseDrag";
import { measureNextPaint } from "../../lib/performance/devMetrics";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import type { Folder, Source } from "../../types";
import { ResourceSidebarHeader } from "./sidebar/ResourceSidebarHeader";
import { SourceCard } from "./cards/SourceCard";
import { UNASSIGNED_FOLDER_ID } from "./hooks/useFolderManagement";

interface SourceListViewProps {
	// Data
	sources: Source[];
	setSources: React.Dispatch<React.SetStateAction<Source[]>>;
	setRawSources: React.Dispatch<React.SetStateAction<Source[]>>;
	errorMessage: string | null;
	isLoading: boolean;
	viewMode: "grid" | "list";
	setViewMode: React.Dispatch<React.SetStateAction<"grid" | "list">>;

	// Folder
	currentSubfolders: Folder[];
	breadcrumbPath: Array<{ id: string | null; name: string }>;
	getFolderSubtreeCount: (folderId: string) => number;

	// Drag & Drop
	draggedSourceId: string | null;
	dragOverFolderId: string | null;
	setDragOverFolderId: React.Dispatch<React.SetStateAction<string | null>>;
	handleDragStart: (e: React.DragEvent, sourceId: string) => void;
	handleDragEnd: (e: React.DragEvent) => void;
	handleFolderDragOver: (e: React.DragEvent, folderId: string) => void;
	handleFolderDragLeave: (e: React.DragEvent) => void;
	handleFolderDrop: (e: React.DragEvent, folderId: string) => Promise<void>;

	// Selection
	selectionMode: boolean;
	setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
	selectedIds: string[];
	selectedIdSet: Set<string>;
	selectedSources: Source[];
	exitSelectionMode: () => void;
	toggleSelection: (sourceId: string) => void;
	handleSelectAll: () => void;
	handleBulkAddToContext: () => void;
	handleDeleteSelected: () => void;
	setIsMoveFolderModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	setMoveFolderTargetId: React.Dispatch<React.SetStateAction<string>>;

	// Context menus
	handleFolderContextMenu: (e: React.MouseEvent, folder: Folder) => void;
	setContextMenu: React.Dispatch<
		React.SetStateAction<{ x: number; y: number; source: Source } | null>
	>;

	// Actions
	fetchSources: () => Promise<void>;
	onOpenDetail: (source: Source) => void;
	onOpenSettings: () => void;
	onDeleteSource: (source: Source) => void;
	onOpenFolderModal: () => void;
	setActiveTab: React.Dispatch<React.SetStateAction<"web" | "text" | "file">>;
	setIsAddModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

	// View tabs
	viewTabs: React.ReactNode;
	currentResearch: { status?: string } | null;

	// Debug
	uiDebugLogsEnabled: boolean;
	debugLog: (...args: unknown[]) => void;
	debugWarn: (...args: unknown[]) => void;
}

export function SourceListView({
	sources,
	setSources,
	setRawSources,
	errorMessage,
	isLoading,
	viewMode,
	setViewMode,
	currentSubfolders,
	breadcrumbPath,
	getFolderSubtreeCount,
	draggedSourceId,
	dragOverFolderId,
	setDragOverFolderId,
	handleDragStart,
	handleDragEnd,
	handleFolderDragOver,
	handleFolderDragLeave,
	handleFolderDrop,
	selectionMode,
	setSelectionMode,
	selectedIds,
	selectedIdSet,
	selectedSources,
	exitSelectionMode,
	toggleSelection,
	handleSelectAll,
	handleBulkAddToContext,
	handleDeleteSelected,
	setIsMoveFolderModalOpen,
	setMoveFolderTargetId,
	handleFolderContextMenu,
	setContextMenu,
	fetchSources,
	onOpenDetail,
	onOpenSettings,
	onDeleteSource,
	onOpenFolderModal,
	setActiveTab,
	setIsAddModalOpen,
	viewTabs,
	currentResearch,
	uiDebugLogsEnabled,
	debugLog,
	debugWarn,
}: SourceListViewProps) {
	const { startDrag, isDragging: isMouseDragging, dragItem } = useMouseDrag();
	const sourceListScrollRef = useRef<HTMLDivElement | null>(null);
	const scrollMetricPendingRef = useRef(false);

	const currentFolderId = useWorkspaceStoreSelector(
		(state) => state.currentFolderId,
	);
	const leftSidebarView = useWorkspaceStoreSelector(
		(state) => state.leftSidebarView,
	);
	const setLeftSidebarView =
		workspaceStore.setLeftSidebarView.bind(workspaceStore);
	const setCurrentFolder = workspaceStore.setCurrentFolder.bind(workspaceStore);

	const shouldVirtualizeSources = viewMode === "list";
	const sourceVirtualizer = useVirtualizer({
		count: shouldVirtualizeSources ? sources.length : 0,
		getScrollElement: () => sourceListScrollRef.current,
		estimateSize: () => 62,
		overscan: 14,
	});

	const handleToggleViewMode = useCallback(() => {
		const nextMode = viewMode === "grid" ? "list" : "grid";
		const startedAt = performance.now();
		setViewMode(nextMode);
		measureNextPaint("resource.list.view_mode_toggle", startedAt, {
			nextMode,
			sourceCount: sources.length,
		});
	}, [setViewMode, sources.length, viewMode]);

	const handleListScroll = useCallback(() => {
		if (scrollMetricPendingRef.current) return;
		scrollMetricPendingRef.current = true;
		const startedAt = performance.now();
		measureNextPaint("resource.list.scroll", startedAt, {
			sourceCount: sources.length,
			viewMode,
		});
		requestAnimationFrame(() => {
			scrollMetricPendingRef.current = false;
		});
	}, [sources.length, viewMode]);

	// 渲染面包屑导航
	const renderBreadcrumb = useCallback(() => {
		if (breadcrumbPath.length <= 1) return null;

		return (
			<div className="px-3 py-2 flex items-center gap-1 text-xs border-b border-border bg-warm-50/30 overflow-x-auto scrollbar-hide">
				{breadcrumbPath.map((item, index) => (
					<div
						key={item.id ?? "root"}
						className="flex items-center gap-1 shrink-0"
					>
						{index > 0 && <ChevronRight className="w-3 h-3 text-text-light" />}
						<button
							onClick={() => {
								// 点击面包屑时，如果当前在详情视图，先切换回资料列表
								if (leftSidebarView === "detail") {
									setLeftSidebarView("sources");
								}
								setCurrentFolder(item.id);
							}}
							className={`px-1.5 py-0.5 rounded hover:bg-warm-300 dark:hover:bg-cream-700 transition-colors ${
								index === breadcrumbPath.length - 1
									? "text-text-primary dark:text-zinc-200 font-medium"
									: "text-text-muted"
							}`}
						>
							{item.name}
						</button>
					</div>
				))}
			</div>
		);
	}, [breadcrumbPath, setCurrentFolder, leftSidebarView, setLeftSidebarView]);

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
										debugLog("[MouseDrag] 移动成功 (grid), 影响行数:", count);
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
						className={`group cursor-pointer p-3 flex flex-col rounded-xl transition-all duration-200 border relative ${
							isDragOver
								? "bg-focus/16 dark:bg-blue-900/30 border-focus dark:border-focus ring-2 ring-blue-400/50 scale-[1.02]"
								: "bg-gradient-to-br from-amber-50/60 to-orange-50/40 dark:from-amber-900/10 dark:to-orange-900/10 hover:from-amber-100/80 hover:to-orange-100/60 dark:hover:from-amber-900/20 dark:hover:to-orange-900/15 border-amber-200/50 dark:border-amber-800/30 hover:shadow-[0_4px_16px_rgba(251,191,36,0.08)] hover:-translate-y-0.5"
						}`}
					>
						<div
							className={`w-10 h-10 rounded-xl flex items-center justify-center pointer-events-none transition-colors duration-200 ${
								isDragOver
									? "bg-blue-200 dark:bg-blue-800/50"
									: "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30"
							}`}
						>
							<FolderIcon
								className={`w-5 h-5 ${isDragOver ? "text-focus dark:text-focus" : "text-peach-500 dark:text-amber-400"}`}
							/>
						</div>
						<div className="mt-2 pointer-events-none">
							<h3 className="text-sm font-medium text-text-primary dark:text-zinc-200 line-clamp-2 leading-snug">
								{folder.name}
							</h3>
							<p className="text-[10px] text-text-light mt-1">{count} 项</p>
						</div>
						<button
							onClick={(e) => {
								e.stopPropagation();
								handleFolderContextMenu(e, folder);
							}}
							className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 text-text-light hover:text-text-secondary hover:bg-surface/50 dark:hover:bg-black/20 rounded transition-all pointer-events-auto"
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
					className={`group cursor-pointer p-2 flex items-center gap-3 rounded-xl transition-all duration-200 ${
						isDragOver
							? "bg-focus/16 dark:bg-blue-900/30 ring-2 ring-blue-400/50"
							: "hover:bg-peach-100/70 dark:hover:bg-amber-900/10 hover:pl-3"
					}`}
				>
					<div
						className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 pointer-events-none transition-colors duration-200 ${
							isDragOver
								? "bg-blue-200 dark:bg-blue-800/50"
								: "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30"
						}`}
					>
						<FolderIcon
							className={`w-4 h-4 ${isDragOver ? "text-focus dark:text-focus" : "text-peach-500 dark:text-amber-400"}`}
						/>
					</div>
					<div className="flex-1 min-w-0 ml-1 pointer-events-none">
						<h3 className="text-sm font-medium text-text-primary dark:text-zinc-200 truncate">
							{folder.name}
						</h3>
						<p className="text-[10px] text-text-light">{count} 项</p>
					</div>
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleFolderContextMenu(e, folder);
						}}
						className="opacity-0 group-hover:opacity-100 p-1 text-text-light hover:text-text-secondary hover:bg-warm-200 rounded transition-all shrink-0 pointer-events-auto"
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
			handleFolderDragOver,
			handleFolderDragLeave,
			handleFolderDrop,
			setDragOverFolderId,
			setSources,
			setRawSources,
		],
	);

	const renderSourceCard = useCallback(
		(source: Source) => {
			const isSelected = selectedIdSet.has(source.id);
			const isDraggingThis =
				isMouseDragging && dragItem?.sourceId === source.id;
			return (
				<SourceCard
					key={source.id}
					source={source}
					viewMode={viewMode}
					selectionMode={selectionMode}
					isSelected={isSelected}
					isDraggingThis={isDraggingThis}
					onClick={() =>
						selectionMode ? toggleSelection(source.id) : onOpenDetail(source)
					}
					onContextMenu={(e) => {
						if (selectionMode) return;
						e.preventDefault();
						setContextMenu({ x: e.clientX, y: e.clientY, source });
					}}
					onToggleSelect={() => toggleSelection(source.id)}
					onDelete={() => {
						void onDeleteSource(source);
					}}
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
				/>
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
			onOpenDetail,
			toggleSelection,
			setContextMenu,
			onDeleteSource,
		],
	);

	return (
		<>
			<ResourceSidebarHeader
				currentResearch={currentResearch}
				viewMode={viewMode}
				selectionMode={selectionMode}
				viewTabs={viewTabs}
				onOpenResearch={() => setLeftSidebarView("research")}
				onOpenFolderModal={onOpenFolderModal}
				onToggleViewMode={handleToggleViewMode}
				onOpenSettings={onOpenSettings}
				onToggleSelectionMode={() =>
					selectionMode ? exitSelectionMode() : setSelectionMode(true)
				}
			/>

			{renderBreadcrumb()}

			{selectionMode && (
				<div className="px-4 py-2 flex items-center gap-3 border-b border-border bg-warm-50/30 backdrop-blur-sm text-xs">
					<span className="text-text-muted">已选 {selectedIds.length} 条</span>
					<button
						onClick={handleSelectAll}
						className="px-2 py-1 rounded-md border border-border text-text-muted hover:text-text-primary hover:border-cream-400 transition-colors"
					>
						{selectedIds.length === sources.length ? "取消全选" : "全选"}
					</button>
					<div className="flex items-center gap-2 ml-auto">
						<button
							onClick={handleBulkAddToContext}
							disabled={selectedSources.length === 0}
							className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
								selectedSources.length === 0
									? "bg-warm-200 text-text-light/50"
									: "bg-dark-muted text-white hover:bg-dark-surface"
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
							className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
								selectedSources.length === 0
									? "bg-warm-200 text-text-light/50"
									: "bg-surface border border-border text-text-secondary dark:text-zinc-200 hover:bg-warm-50"
							}`}
						>
							移动
						</button>
						<button
							onClick={handleDeleteSelected}
							disabled={selectedSources.length === 0}
							className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
								selectedSources.length === 0
									? "bg-warm-200 text-text-light/50"
									: "bg-[rgba(181,51,51,0.08)] text-error hover:bg-[rgba(181,51,51,0.16)]"
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
				onScroll={handleListScroll}
				onDragOver={(e) => {
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
					// 仅处理「内部资料拖到内容区域」这一种场景：
					// - 有 application/x-source-id 数据 → 是内部资料拖拽
					// - 没有则可能是「外部文件拖入资料库」，必须放行让事件冒泡到
					//   window 上的 useDragAndDropImport 监听器，否则 isDragging
					//   的提示框不会消失、文件也不会进入导入队列。
					const sourceId =
						draggedSourceId ||
						e.dataTransfer.getData("application/x-source-id");

					if (!sourceId) {
						// 外部文件拖拽：不要 preventDefault / stopPropagation，
						// 让 window 层的 useDragAndDropImport 接管。
						if (uiDebugLogsEnabled) {
							debugLog(
								"[Drag] 内容区域 onDrop 检测到外部文件拖入，交由 window 处理",
								"types:",
								Array.from(e.dataTransfer.types),
							);
						}
						return;
					}

					e.preventDefault();
					e.stopPropagation();

					if (uiDebugLogsEnabled) {
						debugLog(
							"[Drag] 内容区域 onDrop 触发, sourceId:",
							sourceId,
							"target:",
							(e.target as HTMLElement)?.tagName,
						);
					}

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

					debugLog("[Drag] 在内容区域 drop，未找到文件夹，移动到未归类");
					handleFolderDrop(e, UNASSIGNED_FOLDER_ID);
				}}
			>
				{errorMessage ? (
					<div className="text-center py-8">
						<p className="text-sm text-error mb-2">{errorMessage}</p>
						<button
							onClick={fetchSources}
							className="text-xs text-focus hover:underline"
						>
							重试
						</button>
					</div>
				) : isLoading ? (
					<div className="flex items-center justify-center h-32">
						<Loader2 className="w-5 h-5 animate-spin text-text-light" />
					</div>
				) : sources.length === 0 && currentSubfolders.length === 0 ? (
					<div className="text-center py-12">
						<div className="w-16 h-16 bg-warm-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
							<FileText className="w-7 h-7 text-text-light" />
						</div>
						<p className="text-sm font-medium text-text-secondary mb-1">
							暂无资料
						</p>
						<p className="text-xs text-text-light">点击下方按钮添加</p>
					</div>
				) : (
					<div
						className={
							viewMode === "grid" ? "grid grid-cols-2 gap-2" : "space-y-1"
						}
						onDragOver={(e) => {
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

							const target = e.target as HTMLElement;
							const folderElement = target.closest("[data-folder-id]");

							if (folderElement) {
								const folderId = folderElement.getAttribute("data-folder-id");
								if (folderId) {
									debugLog("[Drag] 在列表容器 drop，找到文件夹:", folderId);
									handleFolderDrop(e, folderId);
									return;
								}
							}

							debugLog("[Drag] 在列表容器 drop，未找到文件夹，移动到未归类");
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
								<div key={source.id}>{renderSourceCard(source)}</div>
							))
						)}
					</div>
				)}
			</div>

			{/* Bottom Actions */}
			<div className="p-3 border-t border-border flex items-center justify-center gap-2 flex-wrap shrink-0">
				<button
					onClick={() => {
						setActiveTab("text");
						setIsAddModalOpen(true);
					}}
					className="flex items-center gap-1.5 px-3 py-2 bg-surface ring-1 ring-zinc-200/70 dark:ring-zinc-700/50 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:bg-warm-50 dark:hover:bg-cream-700/80 rounded-lg text-xs font-medium text-text-secondary transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
				>
					<PenLine className="w-3.5 h-3.5" />
					笔记
				</button>
				<button
					onClick={() => {
						setActiveTab("web");
						setIsAddModalOpen(true);
					}}
					className="flex items-center gap-1.5 px-3 py-2 bg-surface ring-1 ring-zinc-200/70 dark:ring-zinc-700/50 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:bg-warm-50 dark:hover:bg-cream-700/80 rounded-lg text-xs font-medium text-text-secondary transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
				>
					<Link className="w-3.5 h-3.5" />
					链接
				</button>
				<button
					onClick={() => {
						setActiveTab("file");
						setIsAddModalOpen(true);
					}}
					className="flex items-center gap-1.5 px-3 py-2 bg-surface ring-1 ring-zinc-200/70 dark:ring-zinc-700/50 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:bg-warm-50 dark:hover:bg-cream-700/80 rounded-lg text-xs font-medium text-text-secondary transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
				>
					<Paperclip className="w-3.5 h-3.5" />
					文件
				</button>
			</div>
		</>
	);
}
