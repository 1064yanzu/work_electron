import { Circle, FileText, GripVertical, Plus, X } from "lucide-react";
import type { DragEvent, MouseEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileList, fileMove } from "../lib/api";
import { buildDocumentTabContextMenu } from "../lib/contextMenu/actions";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../lib/workspaceStore";
import { isInteractiveTypingTarget } from "./editor/list/documentListMeta";
import { confirmDialog } from "./ui/ConfirmDialog";
import { ContextMenu } from "./ui/ContextMenu";
import { cn } from "../lib/utils";

interface DocumentTabsProps {
	onNewDoc?: () => void;
	onCloseDoc?: (docId: string, dirty: boolean) => void;
	onDeleteDoc?: (docId: string) => void;
}

const getDocDirty = (docId: string) =>
	Boolean(workspaceStore.getState().docCache[docId]?.dirty);

const DocumentTabItem = memo(function DocumentTabItem({
	docId,
	index,
	isActive,
	dragIndex,
	dropIndex,
	onActivate,
	onClose,
	onContextMenu,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDragLeave,
}: {
	docId: string;
	index: number;
	isActive: boolean;
	dragIndex: number | null;
	dropIndex: number | null;
	onActivate: (docId: string) => void;
	onClose: (docId: string) => void;
	onContextMenu: (e: MouseEvent, docId: string) => void;
	onDragStart: (e: DragEvent, index: number) => void;
	onDragEnd: (e: DragEvent) => void;
	onDragOver: (e: DragEvent, index: number) => void;
	onDragLeave: () => void;
}) {
	const label =
		useWorkspaceStoreSelector((state) => state.docCache[docId]?.title) ||
		"未命名文档";
	const dirty = useWorkspaceStoreSelector((state) =>
		Boolean(state.docCache[docId]?.dirty),
	);
	const isDragging = dragIndex === index;
	const isDropTarget = dropIndex === index && dragIndex !== index;

	return (
		<div
			data-doc-id={docId}
			draggable
			onDragStart={(e) => onDragStart(e, index)}
			onDragEnd={onDragEnd}
			onDragOver={(e) => onDragOver(e, index)}
			onDragLeave={onDragLeave}
			onContextMenu={(e) => onContextMenu(e, docId)}
			className={cn(
				"group flex items-center gap-1 rounded-xl border min-h-11 px-1.5 py-1 shrink-0 transition-all duration-150",
				isActive
					? "bg-[#faf9f5] dark:bg-[#1e1d1b] border-[#e8e6dc] dark:border-[#30302e] shadow-sm"
					: "bg-transparent border-transparent hover:bg-[#f0eee6] dark:hover:bg-[#30302e]",
				isDragging && "opacity-40 scale-95",
				isDropTarget && "border-primary/50 bg-primary/5 dark:bg-primary/10",
			)}
		>
			<div
				className="flex items-center justify-center w-4 h-4 text-[#d1cfc5] dark:text-[#4a4845] opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
				aria-hidden="true"
			>
				<GripVertical className="w-3 h-3" />
			</div>

			<button
				type="button"
				role="tab"
				aria-selected={isActive}
				aria-label={dirty ? `${label}，未保存` : label}
				onClick={() => onActivate(docId)}
				className="focus-ring min-h-9 pl-0.5 pr-1.5 inline-flex items-center gap-2 rounded-lg text-left cursor-pointer"
			>
				<FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-300" />
				<span
					className={cn(
						"text-sm font-medium max-w-[200px] truncate",
						isActive
							? "text-zinc-900 dark:text-zinc-100"
							: "text-zinc-700 dark:text-zinc-300",
					)}
				>
					{label}
				</span>
				{dirty ? (
					<span
						className="inline-flex items-center justify-center w-4 h-4"
						title="该文档有未保存修改"
					>
						<Circle className="w-2.5 h-2.5 fill-primary text-primary" />
					</span>
				) : null}
			</button>

			<button
				type="button"
				onClick={() => onClose(docId)}
				className="focus-ring min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors cursor-pointer"
				aria-label={`关闭文档 ${label}`}
				title="关闭文档"
			>
				<X className="w-3.5 h-3.5" />
			</button>
		</div>
	);
});

export default function DocumentTabs({
	onNewDoc,
	onCloseDoc,
	onDeleteDoc,
}: DocumentTabsProps) {
	const openedDocs = useWorkspaceStoreSelector((state) => state.openedDocs);
	const activeDocId = useWorkspaceStoreSelector((state) => state.activeDocId);
	const setActiveDoc = workspaceStore.setActiveDoc.bind(workspaceStore);
	const closeDoc = workspaceStore.closeDoc.bind(workspaceStore);
	const reorderDocs = workspaceStore.reorderDocs.bind(workspaceStore);
	const tabsRef = useRef<HTMLDivElement>(null);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		docId: string;
	} | null>(null);

	// --- 拖拽状态 ---
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);

	useEffect(() => {
		if (!activeDocId || !tabsRef.current) return;
		const activeTab = tabsRef.current.querySelector(
			`[data-doc-id="${activeDocId}"]`,
		);
		if (!activeTab) return;
		activeTab.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
			inline: "nearest",
		});
	}, [activeDocId]);

	const closeCurrentDoc = (docId: string) => {
		const dirty = getDocDirty(docId);
		if (onCloseDoc) {
			onCloseDoc(docId, dirty);
		} else {
			closeDoc(docId);
		}
	};

	const closeOtherDocs = (docId: string) => {
		const targets = openedDocs.filter((id) => id !== docId);
		for (const id of targets) closeCurrentDoc(id);
		setActiveDoc(docId);
	};

	const closeRightDocs = (docId: string) => {
		const index = openedDocs.indexOf(docId);
		if (index < 0) return;
		for (const id of openedDocs.slice(index + 1)) closeCurrentDoc(id);
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isInteractiveTypingTarget(e.target)) return;

			if ((e.metaKey || e.ctrlKey) && e.key === "w") {
				e.preventDefault();
				if (activeDocId) closeCurrentDoc(activeDocId);
				return;
			}

			if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
				e.preventDefault();
				const index = Number.parseInt(e.key, 10) - 1;
				if (index < openedDocs.length) setActiveDoc(openedDocs[index]);
				return;
			}

			if (!activeDocId || openedDocs.length < 2) return;
			const currentIndex = openedDocs.indexOf(activeDocId);
			if (currentIndex < 0) return;

			if (e.key === "ArrowRight") {
				e.preventDefault();
				const nextIndex = (currentIndex + 1) % openedDocs.length;
				setActiveDoc(openedDocs[nextIndex]);
				return;
			}

			if (e.key === "ArrowLeft") {
				e.preventDefault();
				const prevIndex =
					(currentIndex - 1 + openedDocs.length) % openedDocs.length;
				setActiveDoc(openedDocs[prevIndex]);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [activeDocId, openedDocs, setActiveDoc, onCloseDoc, closeDoc]);

	const contextMenuItems = useMemo(() => {
		if (!contextMenu) return [];
		const docId = contextMenu.docId;
		return buildDocumentTabContextMenu({
			onClose: () => closeCurrentDoc(docId),
			onCloseOthers: () => closeOtherDocs(docId),
			onCloseRight: () => closeRightDocs(docId),
			onCopyPath: async () => {
				const all = await fileList({
					entity_type: "output",
					include_deleted: true,
				});
				const record = all.find((item) => item.id === docId);
				if (record?.storage_path) {
					await navigator.clipboard.writeText(record.storage_path);
				}
			},
			onMove: async () => {
				const all = await fileList({
					entity_type: "output",
					include_deleted: true,
				});
				const record = all.find((item) => item.id === docId);
				const moveToProject = await confirmDialog.show({
					title: "移动文档",
					message:
						"点击\u201c移动到项目目录\u201d将文档移动到项目目录；点击\u201c移动到全局目录\u201d将文档移动到全局共享目录。",
					confirmText: "移动到项目目录",
					cancelText: "移动到全局目录",
					type: "info",
				});
				await fileMove({
					id: docId,
					entity_type: "output",
					destination: moveToProject ? "project_docs" : "global_shared",
					project_id: moveToProject ? record?.project_id : undefined,
				});
			},
			onDelete: onDeleteDoc
				? () => onDeleteDoc(docId)
				: () => closeCurrentDoc(docId),
		});
	}, [
		contextMenu,
		openedDocs,
		onDeleteDoc,
		onCloseDoc,
		closeDoc,
		setActiveDoc,
	]);

	// --- 拖拽事件处理 ---
	const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
		setDragIndex(index);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", String(index));
		// 半透明拖拽效果
		if (e.currentTarget instanceof HTMLElement) {
			e.currentTarget.style.opacity = "0.4";
		}
	}, []);

	const handleDragEnd = useCallback(
		(e: React.DragEvent) => {
			if (e.currentTarget instanceof HTMLElement) {
				e.currentTarget.style.opacity = "1";
			}
			// 执行重排
			if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
				reorderDocs(dragIndex, dropIndex);
			}
			setDragIndex(null);
			setDropIndex(null);
		},
		[dragIndex, dropIndex, reorderDocs],
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent, index: number) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			if (index !== dropIndex) {
				setDropIndex(index);
			}
		},
		[dropIndex],
	);

	const handleDragLeave = useCallback(() => {
		// 不在此清除 dropIndex，避免闪烁
	}, []);

	if (openedDocs.length === 0) return null;

	return (
		<div className="doc-toolbar border-b border-zinc-200/70 dark:border-zinc-800/70 px-2 py-1.5 flex items-center gap-1.5">
			<div
				ref={tabsRef}
				className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide"
				role="tablist"
				aria-label="已打开文档标签"
			>
				{openedDocs.map((docId, index) => (
					<DocumentTabItem
						key={docId}
						docId={docId}
						index={index}
						isActive={docId === activeDocId}
						dragIndex={dragIndex}
						dropIndex={dropIndex}
						onActivate={setActiveDoc}
						onClose={closeCurrentDoc}
						onContextMenu={(e, targetDocId) => {
							e.preventDefault();
							setContextMenu({
								x: e.clientX,
								y: e.clientY,
								docId: targetDocId,
							});
						}}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
					/>
				))}
			</div>

			{onNewDoc ? (
				<button
					type="button"
					onClick={onNewDoc}
					className="focus-ring min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
					aria-label="新建文档"
					title="新建文档 (Cmd+N)"
				>
					<Plus className="w-4.5 h-4.5" />
				</button>
			) : null}

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
