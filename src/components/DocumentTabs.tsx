import { Circle, FileText, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileList, fileMove } from "../lib/api";
import { buildDocumentTabContextMenu } from "../lib/contextMenu/actions";
import { useWorkspaceStore } from "../lib/workspaceStore";
import { isInteractiveTypingTarget } from "./editor/list/documentListMeta";
import { confirmDialog } from "./ui/ConfirmDialog";
import { ContextMenu } from "./ui/ContextMenu";
import { cn } from "../lib/utils";

interface DocumentTabsProps {
	onNewDoc?: () => void;
	onCloseDoc?: (docId: string, dirty: boolean) => void;
	onDeleteDoc?: (docId: string) => void;
}

export default function DocumentTabs({
	onNewDoc,
	onCloseDoc,
	onDeleteDoc,
}: DocumentTabsProps) {
	const { openedDocs, activeDocId, docCache, setActiveDoc, closeDoc } =
		useWorkspaceStore();
	const tabsRef = useRef<HTMLDivElement>(null);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		docId: string;
	} | null>(null);

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
		const doc = docCache[docId];
		if (onCloseDoc) {
			onCloseDoc(docId, doc?.dirty || false);
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
	}, [activeDocId, openedDocs, setActiveDoc, onCloseDoc, closeDoc, docCache]);

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
						"点击“移动到项目目录”将文档移动到项目目录；点击“移动到全局目录”将文档移动到全局共享目录。",
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
		docCache,
	]);

	if (openedDocs.length === 0) return null;

	return (
		<div className="doc-toolbar border-b border-zinc-200/70 dark:border-zinc-800/70 px-2 py-1.5 flex items-center gap-1.5">
			<div
				ref={tabsRef}
				className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide"
				role="tablist"
				aria-label="已打开文档标签"
			>
				{openedDocs.map((docId) => {
					const doc = docCache[docId];
					const isActive = docId === activeDocId;
					const label = doc?.title || "未命名文档";
					const dirty = Boolean(doc?.dirty);

					return (
						<div
							key={docId}
							data-doc-id={docId}
							onContextMenu={(e) => {
								e.preventDefault();
								setContextMenu({ x: e.clientX, y: e.clientY, docId });
							}}
							className={cn(
								"group flex items-center gap-1.5 rounded-xl border min-h-11 px-2 py-1 shrink-0 transition-colors",
								isActive
									? "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 shadow-sm"
									: "bg-transparent border-transparent hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70",
							)}
						>
							<button
								type="button"
								role="tab"
								aria-selected={isActive}
								aria-label={dirty ? `${label}，未保存` : label}
								onClick={() => setActiveDoc(docId)}
								className="focus-ring min-h-9 pl-1 pr-1.5 inline-flex items-center gap-2 rounded-lg text-left"
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
								onClick={() => closeCurrentDoc(docId)}
								className="focus-ring min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors"
								aria-label={`关闭文档 ${label}`}
								title="关闭文档"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					);
				})}
			</div>

			{onNewDoc ? (
				<button
					type="button"
					onClick={onNewDoc}
					className="focus-ring min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
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
