import {
	ChevronDown,
	ChevronRight,
	Database,
	FileCode,
	FileText,
	Image as ImageIcon,
	Search,
	X,
} from "lucide-react";
import { memo, type MouseEvent, useMemo, useState } from "react";
import { buildFileItemContextMenu } from "../../../lib/contextMenu/actions";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { cn } from "../../../lib/utils";
import { ContextMenu } from "../../ui/ContextMenu";

const FileTypeIcons = {
	code: <FileCode className="w-3.5 h-3.5" />,
	images: <ImageIcon className="w-3.5 h-3.5" />,
	data: <Database className="w-3.5 h-3.5" />,
	docs: <FileText className="w-3.5 h-3.5" />,
	other: <FileText className="w-3.5 h-3.5" />,
} as const;

interface FileCategoryGroupProps {
	files: SandboxFile[];
	title: string;
	isExpanded: boolean;
	onToggle: () => void;
	selectedFileId: string | null;
	onSelectFile: (fileId: string) => void;
	onFileContextMenu: (
		event: MouseEvent<HTMLButtonElement>,
		file: SandboxFile,
	) => void;
}

const FileCategoryGroup = memo(function FileCategoryGroup({
	files,
	title,
	isExpanded,
	onToggle,
	selectedFileId,
	onSelectFile,
	onFileContextMenu,
}: FileCategoryGroupProps) {
	if (files.length === 0) return null;

	return (
		<div className="mb-3">
			<button
				type="button"
				onClick={onToggle}
				className="flex items-center gap-1.5 px-3 py-1 w-full group text-left"
			>
				<span className="text-zinc-400 transition-transform">
					{isExpanded ? (
						<ChevronDown className="w-3 h-3" />
					) : (
						<ChevronRight className="w-3 h-3" />
					)}
				</span>
				<span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
					{title}
				</span>
				<span className="text-[10px] text-zinc-400 ml-1">{files.length}</span>
			</button>
			{isExpanded && (
				<div className="mt-0.5 space-y-px">
					{files.map((file) => {
						const isSelected = selectedFileId === file.id;
						return (
							<button
								key={file.id}
								type="button"
								onClick={() => onSelectFile(file.id)}
								onContextMenu={(e) => onFileContextMenu(e, file)}
								className={cn(
									"w-full flex items-center gap-2 px-3 py-1.5 text-[13px] transition-colors",
									isSelected
										? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
										: "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
								)}
							>
								<span
									className={cn(
										"shrink-0",
										isSelected
											? "text-zinc-700 dark:text-zinc-300"
											: "text-zinc-400",
									)}
								>
									{FileTypeIcons[file.category] || FileTypeIcons.other}
								</span>
								<span className="truncate flex-1 text-left">{file.name}</span>
								{file.isNew ? (
									<span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
								) : null}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
});

interface ManagedFileTreePanelProps {
	searchQuery: string;
	onSearchQueryChange: (query: string) => void;
	totalFiles: number;
	categories: Array<{
		key: "docs" | "code" | "images" | "data" | "other";
		title: string;
	}>;
	filteredTree: {
		docs: SandboxFile[];
		code: SandboxFile[];
		images: SandboxFile[];
		data: SandboxFile[];
		other: SandboxFile[];
	};
	expandedFolders: Set<string>;
	onToggleCategory: (key: string) => void;
	selectedFileId: string | null;
	onSelectFile: (id: string) => void;
	onCopyPath: (file: SandboxFile) => Promise<void> | void;
	onRevealFile: (file: SandboxFile) => Promise<void> | void;
	onMoveFile: (file: SandboxFile) => Promise<void> | void;
	onDeleteFile: (file: SandboxFile) => Promise<void> | void;
}

export const ManagedFileTreePanel = memo(function ManagedFileTreePanel({
	searchQuery,
	onSearchQueryChange,
	totalFiles,
	categories,
	filteredTree,
	expandedFolders,
	onToggleCategory,
	selectedFileId,
	onSelectFile,
	onCopyPath,
	onRevealFile,
	onMoveFile,
	onDeleteFile,
}: ManagedFileTreePanelProps) {
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		file: SandboxFile;
	} | null>(null);
	const visibleCount = useMemo(
		() =>
			filteredTree.docs.length +
			filteredTree.code.length +
			filteredTree.images.length +
			filteredTree.data.length +
			filteredTree.other.length,
		[filteredTree],
	);
	const hasSearch = searchQuery.trim().length > 0;

	const handleExpandAll = () => {
		for (const cat of categories) {
			if (!expandedFolders.has(cat.key)) {
				onToggleCategory(cat.key);
			}
		}
	};

	const handleCollapseAll = () => {
		for (const cat of categories) {
			if (expandedFolders.has(cat.key)) {
				onToggleCategory(cat.key);
			}
		}
	};

	return (
		<div className="h-full flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
			<div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
					<input
						type="text"
						placeholder="搜索文件..."
						value={searchQuery}
						onChange={(e) => onSearchQueryChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								onSearchQueryChange("");
							}
						}}
						className="w-full pl-8 pr-8 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 transition-all placeholder:text-zinc-400"
					/>
					{hasSearch ? (
						<button
							type="button"
							onClick={() => onSearchQueryChange("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
							title="清空搜索"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					) : null}
				</div>
				<div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
					<span>
						{hasSearch
							? `匹配 ${visibleCount}/${totalFiles}`
							: `共 ${totalFiles} 个文件`}
					</span>
					<div className="inline-flex items-center gap-1">
						<button
							type="button"
							onClick={handleExpandAll}
							className="px-1.5 py-0.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						>
							展开
						</button>
						<button
							type="button"
							onClick={handleCollapseAll}
							className="px-1.5 py-0.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						>
							收起
						</button>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto py-2">
				{totalFiles === 0 ? (
					<div className="px-4 py-8 text-center">
						<p className="text-sm text-zinc-400 mb-1">暂无文件</p>
						<p className="text-xs text-zinc-300">等待 AI 生成...</p>
					</div>
				) : hasSearch && visibleCount === 0 ? (
					<div className="px-4 py-8 text-center">
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
							没有匹配文件
						</p>
						<button
							type="button"
							onClick={() => onSearchQueryChange("")}
							className="text-xs text-zinc-500 dark:text-zinc-300 underline underline-offset-2"
						>
							清空搜索
						</button>
					</div>
				) : (
					categories.map((cat) => (
						<FileCategoryGroup
							key={cat.key}
							files={filteredTree[cat.key]}
							title={cat.title}
							isExpanded={expandedFolders.has(cat.key)}
							onToggle={() => onToggleCategory(cat.key)}
							selectedFileId={selectedFileId}
							onSelectFile={onSelectFile}
							onFileContextMenu={(event, file) => {
								event.preventDefault();
								event.stopPropagation();
								setContextMenu({ x: event.clientX, y: event.clientY, file });
							}}
						/>
					))
				)}
			</div>

			{totalFiles > 0 ? (
				<div className="p-3 border-t border-zinc-100 dark:border-zinc-800">
					<button className="w-full py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors">
						全部下载
					</button>
				</div>
			) : null}
			{contextMenu ? (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={buildFileItemContextMenu({
						onOpen: () => onSelectFile(contextMenu.file.id),
						onMove: () => void onMoveFile(contextMenu.file),
						onCopyPath: () => void onCopyPath(contextMenu.file),
						onReveal: () => void onRevealFile(contextMenu.file),
						onDelete: () => void onDeleteFile(contextMenu.file),
					})}
					onClose={() => setContextMenu(null)}
				/>
			) : null}
		</div>
	);
});
