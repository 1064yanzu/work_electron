// 提示词仓库弹窗 - Claude 风格高级质感
// 支持文件夹管理、拖拽排序
// 版本更新：完整的文件夹 CRUD 和拖拽功能

import {
	Archive,
	ArrowLeft,
	Check,
	Copy,
	Download,
	Edit3,
	Folder,
	FolderOpen,
	FolderPlus,
	LayoutGrid,
	LayoutList,
	Library,
	MoreHorizontal,
	Plus,
	Search,
	Sparkles,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { useState, useRef, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import {
	type CustomPrompt,
	useCustomPromptStore,
} from "../lib/customPromptStore";
import { confirmDialog } from "./ui/ConfirmDialog";
import { toast } from "./ui/Toast";

// ============================================================================
// Types & Constants
// ============================================================================

interface PromptLibraryModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSelectPrompt?: (prompt: CustomPrompt) => void;
}

const FOLDER_COLORS: Record<string, string> = {
	blue: "text-blue-600 dark:text-blue-400",
	orange: "text-orange-600 dark:text-orange-400",
	green: "text-green-600 dark:text-green-400",
	purple: "text-purple-600 dark:text-purple-400",
	pink: "text-pink-600 dark:text-pink-400",
};

// ============================================================================
// Component: PromptCard (with Drag Support)
// ============================================================================

function PromptCard({
	prompt,
	isSelected,
	onSelect,
	onEdit,
	onDelete,
	viewMode = "grid",
	onDragStart,
}: {
	prompt: CustomPrompt;
	isSelected?: boolean;
	onSelect: () => void;
	onEdit: (e: React.MouseEvent) => void;
	onDelete: (e: React.MouseEvent) => void;
	viewMode: "grid" | "list";
	onDragStart: (e: React.DragEvent, promptId: string) => void;
}) {
	const [isHovered, setIsHovered] = useState(false);
	const [hasCopied, setHasCopied] = useState(false);

	const handleCopy = async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(prompt.content);
			setHasCopied(true);
			setTimeout(() => setHasCopied(false), 2000);
		} catch (err) {
			console.error("复制失败:", err);
		}
	};

	if (viewMode === "list") {
		return (
			<div
				draggable
				onDragStart={(e) => onDragStart(e, prompt.id)}
				className={`group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200 border cursor-grab active:cursor-grabbing
                    ${
											isSelected
												? "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 shadow-sm ring-1 ring-black/5 dark:ring-white/5"
												: "bg-white/60 dark:bg-zinc-900/60 border-transparent hover:bg-white dark:hover:bg-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-sm"
										}`}
				onClick={onSelect}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				{/* 图标 */}
				<div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xl border border-zinc-200 dark:border-zinc-700 shadow-sm shrink-0 transition-transform group-hover:scale-105">
					{prompt.icon || "📝"}
				</div>

				{/* 内容 */}
				<div className="flex-1 min-w-0">
					<h4 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate mb-0.5">
						{prompt.name}
					</h4>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
						{prompt.shortDescription || prompt.content}
					</p>
				</div>

				{/* 操作按钮 - 始终可见但透明度变化 */}
				<div
					className={`flex items-center gap-1 transition-all duration-200 ${isHovered || isSelected ? "opacity-100" : "opacity-0"}`}
				>
					<button
						onClick={handleCopy}
						className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-all active:scale-90"
						title="复制"
					>
						{hasCopied ? (
							<Check className="w-5 h-5 text-green-500" />
						) : (
							<Copy className="w-5 h-5" />
						)}
					</button>
					<button
						onClick={onEdit}
						className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-all active:scale-90"
						title="编辑"
					>
						<Edit3 className="w-5 h-5" />
					</button>
					<button
						onClick={onDelete}
						className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-90"
						title="删除"
					>
						<Trash2 className="w-5 h-5" />
					</button>
				</div>
			</div>
		);
	}

	// Grid Mode
	return (
		<div
			draggable
			onDragStart={(e) => onDragStart(e, prompt.id)}
			className={`group relative flex flex-col p-4 md:p-5 rounded-2xl transition-all duration-300 border cursor-grab active:cursor-grabbing h-full
                ${
									isSelected
										? "bg-white dark:bg-zinc-800 ring-1 ring-zinc-900 dark:ring-zinc-100 shadow-xl"
										: "bg-white dark:bg-zinc-900 border-zinc-200/40 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)] hover:-translate-y-1 hover:scale-[1.01]"
								}`}
			onClick={onSelect}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* 头部：图标 + 操作按钮 */}
			<div className="flex items-start justify-between mb-4">
				<div className="w-14 h-14 flex items-center justify-center rounded-xl bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-50 dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800 border border-zinc-200/50 dark:border-zinc-700/50 text-2xl shadow-sm group-hover:scale-105 transition-all duration-300">
					{prompt.icon || "📝"}
				</div>
				{/* 操作按钮 - 始终占位但悬停时显示 */}
				<div
					className={`flex gap-0.5 transition-all duration-200 ${isHovered || isSelected ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"}`}
				>
					<button
						onClick={handleCopy}
						className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-all active:scale-90"
						title="复制"
					>
						{hasCopied ? (
							<Check className="w-5 h-5 text-green-500" />
						) : (
							<Copy className="w-5 h-5" />
						)}
					</button>
					<button
						onClick={onEdit}
						className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-all active:scale-90"
						title="编辑"
					>
						<Edit3 className="w-5 h-5" />
					</button>
					<button
						onClick={onDelete}
						className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-90"
						title="删除"
					>
						<Trash2 className="w-5 h-5" />
					</button>
				</div>
			</div>

			{/* 标题 */}
			<div className="mb-2">
				<h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg mb-1 line-clamp-1 tracking-tight">
					{prompt.name}
				</h3>
			</div>

			{/* 描述 */}
			<p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-4 leading-relaxed flex-1">
				{prompt.shortDescription || prompt.content}
			</p>
		</div>
	);
}

// ============================================================================
// Main Component
// ============================================================================

export function PromptLibraryModal({
	isOpen,
	onClose,
	onSelectPrompt,
}: PromptLibraryModalProps) {
	const {
		prompts,
		folders,
		addPrompt,
		updatePrompt,
		deletePrompt,
		addFolder,
		updateFolder,
		deleteFolder,
		movePromptToFolder,
		exportPrompts,
		importPrompts,
	} = useCustomPromptStore();

	// State
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [activeFolderId, setActiveFolderId] = useState<string | null>(null); // null = 全部, "uncategorized" = 未分类
	const [searchQuery, setSearchQuery] = useState("");
	const [isEditing, setIsEditing] = useState(false);
	const [editingPrompt, setEditingPrompt] =
		useState<Partial<CustomPrompt> | null>(null);

	// Folder management
	const [isAddingFolder, setIsAddingFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");
	const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
	const [editingFolderName, setEditingFolderName] = useState("");
	const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
	const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const newFolderInputRef = useRef<HTMLInputElement>(null);

	// Derived State
	const filteredPrompts = useMemo(() => {
		let result = prompts;

		if (activeFolderId === "uncategorized") {
			result = result.filter((p) => !p.folderId);
		} else if (activeFolderId !== null) {
			result = result.filter((p) => p.folderId === activeFolderId);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					p.shortDescription.toLowerCase().includes(q) ||
					p.content.toLowerCase().includes(q),
			);
		}
		return result;
	}, [prompts, activeFolderId, searchQuery]);

	// Folder prompt counts
	const folderCounts = useMemo(() => {
		const counts: Record<string, number> = { uncategorized: 0 };
		folders.forEach((f) => {
			counts[f.id] = 0;
		});
		prompts.forEach((p) => {
			if (p.folderId && counts[p.folderId] !== undefined) {
				counts[p.folderId]++;
			} else {
				counts.uncategorized++;
			}
		});
		return counts;
	}, [prompts, folders]);

	// Handlers
	const handleStartEdit = (prompt?: CustomPrompt) => {
		setEditingPrompt(
			prompt
				? { ...prompt }
				: {
						name: "",
						shortDescription: "",
						content: "",
						folderId:
							activeFolderId === "uncategorized"
								? undefined
								: activeFolderId || undefined,
						icon: "📝",
					},
		);
		setIsEditing(true);
	};

	const handleSave = () => {
		if (!editingPrompt?.name || !editingPrompt.content) return;

		if (editingPrompt.id) {
			updatePrompt(editingPrompt.id, editingPrompt);
		} else {
			addPrompt(
				editingPrompt as Omit<CustomPrompt, "id" | "createdAt" | "updatedAt">,
			);
		}
		setIsEditing(false);
		setEditingPrompt(null);
	};

	// Folder handlers
	const handleCreateFolder = () => {
		if (!newFolderName.trim()) return;
		const id = addFolder(newFolderName.trim(), "📁");
		setActiveFolderId(id);
		setIsAddingFolder(false);
		setNewFolderName("");
	};

	const handleRenameFolder = (id: string) => {
		if (!editingFolderName.trim()) return;
		updateFolder(id, { name: editingFolderName.trim() });
		setEditingFolderId(null);
		setEditingFolderName("");
	};

	const handleDeleteFolder = (id: string, withPrompts: boolean) => {
		deleteFolder(id, withPrompts);
		if (activeFolderId === id) {
			setActiveFolderId(null);
		}
		setFolderMenuId(null);
	};

	// Drag handlers
	const handleDragStart = (e: React.DragEvent, promptId: string) => {
		e.dataTransfer.setData("promptId", promptId);
		e.dataTransfer.effectAllowed = "move";
	};

	const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setDragOverFolderId(folderId);
	};

	const handleDragLeave = () => {
		setDragOverFolderId(null);
	};

	const handleDrop = (e: React.DragEvent, folderId: string | undefined) => {
		e.preventDefault();
		const promptId = e.dataTransfer.getData("promptId");
		if (promptId) {
			movePromptToFolder(promptId, folderId);
		}
		setDragOverFolderId(null);
	};

	const handleImport = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (event) => {
				const res = importPrompts(event.target?.result as string);
				if (res.success) {
					toast.success(`已导入 ${res.count} 条提示词`);
				}
			};
			reader.readAsText(file);
			e.target.value = "";
		},
		[importPrompts],
	);

	const handleExport = () => {
		const blob = new Blob([exportPrompts()], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `prompts-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) onClose();
	};

	if (!isOpen) return null;

	return ReactDOM.createPortal(
		<div
			className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/20 backdrop-blur-sm dark:bg-black/50 animate-in fade-in duration-200 p-4 sm:p-6 md:p-8"
			onClick={handleBackdropClick}
		>
			{/* 响应式弹窗容器 - Clean Modern Style */}
			<div className="w-[95vw] md:w-[90vw] max-w-[1100px] h-[90vh] md:h-[85vh] max-h-[850px] bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-zinc-200/50 dark:border-zinc-800 flex flex-col md:flex-row overflow-hidden ring-1 ring-black/5 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 font-sans">
				{/* Sidebar (Folder Navigation) */}
				<div className="w-full md:w-56 bg-zinc-50/50 dark:bg-zinc-900/50 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col p-3 md:p-4 backdrop-blur-xl shrink-0">
					<div className="flex items-center gap-3 px-2 mb-2 md:mb-4 mt-1">
						<div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-900 shadow-md shadow-zinc-900/5">
							<Library className="w-4 h-4" />
						</div>
						<span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
							提示词库
						</span>
					</div>

					<div className="px-2 mb-2 hidden md:block">
						<div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-1">
							文件夹
						</div>
					</div>

					<div className="flex md:flex-col gap-2 md:gap-1 md:space-y-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto pb-2 md:pb-0 pr-0 md:pr-2 no-scrollbar md:custom-scrollbar min-h-[50px] md:min-h-0 items-center md:items-stretch">
						{/* 全部 */}
						<button
							onClick={() => setActiveFolderId(null)}
							onDragOver={(e) => handleDragOver(e, null)}
							onDragLeave={handleDragLeave}
							className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group
								${
									activeFolderId === null
										? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-black/5 dark:ring-white/5 font-medium"
										: "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200"
								}`}
						>
							<div className="flex items-center gap-2.5">
								<LayoutGrid
									className={`w-4 h-4 ${activeFolderId === null ? "text-zinc-900 dark:text-zinc-100" : "opacity-70"}`}
								/>
								<span>全部</span>
							</div>
							<span className="text-xs text-zinc-400">{prompts.length}</span>
						</button>

						{/* 文件夹列表 */}
						{folders.map((folder) => (
							<div key={folder.id} className="relative">
								{editingFolderId === folder.id ? (
									<input
										ref={newFolderInputRef}
										type="text"
										value={editingFolderName}
										onChange={(e) => setEditingFolderName(e.target.value)}
										onBlur={() => handleRenameFolder(folder.id)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleRenameFolder(folder.id);
											if (e.key === "Escape") setEditingFolderId(null);
										}}
										className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border-2 border-blue-500 rounded-xl outline-none"
										autoFocus
									/>
								) : (
									<div
										onDragOver={(e) => handleDragOver(e, folder.id)}
										onDragLeave={handleDragLeave}
										onDrop={(e) => handleDrop(e, folder.id)}
										className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group cursor-pointer
										${dragOverFolderId === folder.id ? "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-400" : ""}
										${
											activeFolderId === folder.id
												? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-black/5 dark:ring-white/5 font-medium"
												: "text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-200"
										}`}
									>
										<div
											onClick={() => setActiveFolderId(folder.id)}
											className="flex items-center gap-2.5 flex-1"
										>
											{activeFolderId === folder.id ? (
												<FolderOpen
													className={`w-4 h-4 ${FOLDER_COLORS[folder.color || "blue"]}`}
												/>
											) : (
												<Folder
													className={`w-4 h-4 opacity-70 group-hover:opacity-100 ${FOLDER_COLORS[folder.color || "blue"]}`}
												/>
											)}
											<span className="truncate max-w-[100px]">
												{folder.name}
											</span>
										</div>
										<div className="flex items-center gap-1">
											<span className="text-xs text-zinc-400">
												{folderCounts[folder.id] || 0}
											</span>
											<button
												onClick={(e) => {
													e.stopPropagation();
													setFolderMenuId(
														folderMenuId === folder.id ? null : folder.id,
													);
												}}
												className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded transition-all"
											>
												<MoreHorizontal className="w-3.5 h-3.5" />
											</button>
										</div>
									</div>
								)}

								{/* Folder Context Menu */}
								{folderMenuId === folder.id && (
									<>
										{/* Backdrop to close menu when clicking outside */}
										<div
											className="fixed inset-0 z-[140]"
											onClick={(e) => {
												e.stopPropagation();
												setFolderMenuId(null);
											}}
										/>
										{/* Menu */}
										<div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 py-1 z-[150] animate-in fade-in slide-in-from-top-2 duration-150">
											<button
												onClick={(e) => {
													e.stopPropagation();
													setEditingFolderId(folder.id);
													setEditingFolderName(folder.name);
													setFolderMenuId(null);
												}}
												className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2"
											>
												<Edit3 className="w-3.5 h-3.5" />
												重命名
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteFolder(folder.id, false);
												}}
												className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2"
											>
												<Trash2 className="w-3.5 h-3.5" />
												删除（保留内容）
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteFolder(folder.id, true);
												}}
												className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
											>
												<Trash2 className="w-3.5 h-3.5" />
												删除（含内容）
											</button>
										</div>
									</>
								)}
							</div>
						))}

						{/* 未分类 */}
						<button
							onClick={() => setActiveFolderId("uncategorized")}
							onDragOver={(e) => handleDragOver(e, "uncategorized")}
							onDragLeave={handleDragLeave}
							onDrop={(e) => handleDrop(e, undefined)}
							className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group
								${dragOverFolderId === "uncategorized" ? "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-400" : ""}
								${
									activeFolderId === "uncategorized"
										? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-black/5 dark:ring-white/5 font-medium"
										: "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200"
								}`}
						>
							<div className="flex items-center gap-2.5">
								<Archive className="w-4 h-4 opacity-70" />
								<span>未分类</span>
							</div>
							<span className="text-xs text-zinc-400">
								{folderCounts.uncategorized}
							</span>
						</button>

						{/* New Folder Input */}
						{isAddingFolder ? (
							<div className="px-1 py-1">
								<input
									ref={newFolderInputRef}
									type="text"
									value={newFolderName}
									onChange={(e) => setNewFolderName(e.target.value)}
									onBlur={() => {
										if (!newFolderName.trim()) setIsAddingFolder(false);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleCreateFolder();
										if (e.key === "Escape") setIsAddingFolder(false);
									}}
									className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border-2 border-blue-500 rounded-xl outline-none"
									placeholder="输入文件夹名称..."
									autoFocus
								/>
							</div>
						) : (
							<button
								onClick={() => setIsAddingFolder(true)}
								className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all duration-200 border border-dashed border-zinc-300 dark:border-zinc-700"
							>
								<FolderPlus className="w-4 h-4" />
								<span>新建文件夹</span>
							</button>
						)}
					</div>

					<div className="pt-2 md:pt-4 border-t border-zinc-200/50 dark:border-zinc-800 mt-0 md:mt-2">
						<button
							onClick={() => handleStartEdit()}
							className="w-full flex items-center justify-center gap-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all active:scale-[0.98] font-medium text-sm shadow-sm"
						>
							<Plus className="w-4 h-4" />
							<span>新建提示词</span>
						</button>
					</div>
				</div>

				{/* Main Content */}
				<div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 relative min-w-0">
					{/* Header Toolbar */}
					<div className="px-3 md:px-6 py-3 flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md z-10">
						<div className="relative flex-1 max-w-md group">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-zinc-600 dark:group-focus-within:text-zinc-300 transition-colors" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="搜索..."
								className="w-full min-w-[120px] pl-9 pr-4 py-2 bg-zinc-100/50 dark:bg-zinc-900 border-none rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-800 transition-all outline-none"
							/>
						</div>

						<div className="flex items-center gap-0.5 bg-white dark:bg-zinc-800/50 p-1 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm">
							<button
								onClick={() => setViewMode("grid")}
								className={`p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-all ${viewMode === "grid" ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
								title="网格视图"
							>
								<LayoutGrid className="w-4 h-4" />
							</button>
							<button
								onClick={() => setViewMode("list")}
								className={`p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-all ${viewMode === "list" ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
								title="列表视图"
							>
								<LayoutList className="w-4 h-4" />
							</button>
						</div>

						<div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

						<div className="flex items-center gap-0.5">
							<input
								ref={fileInputRef}
								type="file"
								accept=".json"
								className="hidden"
								onChange={handleImport}
							/>
							<button
								onClick={() => fileInputRef.current?.click()}
								className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95"
								title="导入"
							>
								<Upload className="w-4.5 h-4.5" />
							</button>
							<button
								onClick={handleExport}
								className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95"
								title="导出"
							>
								<Download className="w-4.5 h-4.5" />
							</button>
							<button
								onClick={onClose}
								className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95"
								title="关闭"
							>
								<X className="w-4.5 h-4.5" />
							</button>
						</div>
					</div>

					{/* Prompts Grid */}
					<div className="flex-1 overflow-y-auto p-6 scroll-smooth">
						{filteredPrompts.length === 0 ? (
							<div className="h-full flex flex-col items-center justify-center text-center pb-20">
								<div className="w-20 h-20 rounded-3xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center mb-6 ring-1 ring-zinc-100 dark:ring-zinc-800">
									<Archive className="w-8 h-8 text-zinc-300" />
								</div>
								<h3 className="text-zinc-900 dark:text-zinc-100 font-medium text-lg mb-2">
									暂无提示词
								</h3>
								<p className="text-zinc-500 dark:text-zinc-400 max-w-xs text-sm">
									{activeFolderId === null
										? "创建一个新的提示词来开始使用。"
										: activeFolderId === "uncategorized"
											? "未分类的提示词会显示在这里。"
											: "当前文件夹为空，拖拽提示词到这里或新建一个。"}
								</p>
								<button
									onClick={() => handleStartEdit()}
									className="mt-6 px-6 py-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity"
								>
									新建提示词
								</button>
							</div>
						) : (
							<div
								className={
									viewMode === "grid"
										? "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 md:gap-6"
										: "flex flex-col gap-3"
								}
							>
								{filteredPrompts.map((prompt) => (
									<PromptCard
										key={prompt.id}
										prompt={prompt}
										viewMode={viewMode}
										onDragStart={handleDragStart}
										onSelect={() => {
											if (onSelectPrompt) {
												onSelectPrompt(prompt);
												onClose();
											} else {
												handleStartEdit(prompt);
											}
										}}
										onEdit={(e) => {
											e.stopPropagation();
											handleStartEdit(prompt);
										}}
										onDelete={(e) => {
											e.stopPropagation();
											void (async () => {
												const confirmed = await confirmDialog.danger(
													`确定删除「${prompt.name}」吗？`,
													"删除提示词",
												);
												if (confirmed) {
													deletePrompt(prompt.id);
												}
											})();
										}}
									/>
								))}
							</div>
						)}
					</div>

					{/* Editor Overlay */}
					{isEditing && (
						<div className="absolute inset-0 z-20 bg-white dark:bg-[#121212] flex flex-col animate-in slide-in-from-bottom-[5%] duration-300">
							<div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
								<div className="flex items-center gap-4">
									<button
										onClick={() => setIsEditing(false)}
										className="p-2 -ml-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
									>
										<ArrowLeft className="w-5 h-5" />
									</button>
									<span className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg">
										{editingPrompt?.id ? "编辑提示词" : "新建提示词"}
									</span>
								</div>
								<div className="flex items-center gap-3">
									<button
										onClick={() => setIsEditing(false)}
										className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
									>
										取消
									</button>
									<button
										onClick={handleSave}
										disabled={!editingPrompt?.name || !editingPrompt?.content}
										className="px-6 py-2 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
									>
										保存
									</button>
								</div>
							</div>

							<div className="flex-1 overflow-y-auto p-8 lg:p-12">
								<div className="max-w-3xl mx-auto space-y-8">
									<div className="flex gap-6 items-start">
										<div className="flex flex-col gap-2">
											<label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
												图标
											</label>
											<input
												type="text"
												value={editingPrompt?.icon || ""}
												onChange={(e) =>
													setEditingPrompt((prev) =>
														prev ? { ...prev, icon: e.target.value } : null,
													)
												}
												className="w-16 h-16 text-3xl text-center rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 outline-none transition-all"
												placeholder="📝"
											/>
										</div>
										<div className="flex-1 space-y-6">
											<div className="space-y-2">
												<label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
													名称
												</label>
												<input
													type="text"
													value={editingPrompt?.name || ""}
													onChange={(e) =>
														setEditingPrompt((prev) =>
															prev ? { ...prev, name: e.target.value } : null,
														)
													}
													className="w-full text-2xl font-bold bg-transparent border-b border-zinc-200 dark:border-zinc-800 pb-2 focus:border-zinc-900 dark:focus:border-zinc-100 outline-none transition-colors placeholder-zinc-300 dark:placeholder-zinc-700"
													placeholder="输入提示词名称..."
													autoFocus
												/>
											</div>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
												<div className="space-y-2">
													<label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
														文件夹
													</label>
													<select
														value={editingPrompt?.folderId || ""}
														onChange={(e) =>
															setEditingPrompt((prev) =>
																prev
																	? {
																			...prev,
																			folderId: e.target.value || undefined,
																		}
																	: null,
															)
														}
														className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 outline-none transition-all text-sm"
													>
														<option value="">未分类</option>
														{folders.map((f) => (
															<option key={f.id} value={f.id}>
																{f.name}
															</option>
														))}
													</select>
												</div>
												<div className="space-y-2">
													<label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
														简介
													</label>
													<input
														type="text"
														value={editingPrompt?.shortDescription || ""}
														onChange={(e) =>
															setEditingPrompt((prev) =>
																prev
																	? {
																			...prev,
																			shortDescription: e.target.value,
																		}
																	: null,
															)
														}
														className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 outline-none transition-all text-sm"
														placeholder="简短描述..."
													/>
												</div>
											</div>
										</div>
									</div>

									<div className="space-y-3 pt-4">
										<div className="flex items-center justify-between">
											<label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
												提示词内容
											</label>
											<div className="text-xs text-zinc-400 flex items-center gap-1">
												<Sparkles className="w-3 h-3" />
												<span>支持 {"{变量名}"} 格式的占位符</span>
											</div>
										</div>
										<div className="relative group">
											<div className="absolute top-0 bottom-0 left-0 w-1 bg-zinc-200 dark:bg-zinc-800 group-focus-within:bg-zinc-900 dark:group-focus-within:bg-zinc-100 transition-colors rounded-full" />
											<textarea
												value={editingPrompt?.content || ""}
												onChange={(e) =>
													setEditingPrompt((prev) =>
														prev ? { ...prev, content: e.target.value } : null,
													)
												}
												className="w-full h-[400px] pl-6 pr-4 py-2 bg-transparent resize-none outline-none font-mono text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-700"
												placeholder="在此输入详细的提示词内容..."
											/>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Note: Backdrop for folder menu is now rendered inline with the menu */}
		</div>,
		document.body,
	);
}
