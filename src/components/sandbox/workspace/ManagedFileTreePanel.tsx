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
				className="flex min-h-11 items-center gap-2 px-3 py-1.5 w-full group text-left focus-ring"
			>
				<span className="text-text-light transition-transform">
					{isExpanded ? (
						<ChevronDown className="w-3 h-3" />
					) : (
						<ChevronRight className="w-3 h-3" />
					)}
				</span>
				<span className="text-xs font-medium tracking-wide text-text-secondary uppercase">
					{title}
				</span>
				<span className="text-[11px] text-text-muted ml-1">{files.length}</span>
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
									"w-full min-h-11 flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors focus-ring",
									isSelected
										? "bg-warm-200 text-text-primary"
										: "text-text-secondary hover:bg-warm-50/50",
								)}
							>
								<span
									className={cn(
										"shrink-0",
										isSelected ? "text-text-secondary" : "text-text-light",
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
	density?: "comfortable" | "compact";
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
	sandboxDir: string | null;
	onRevealSandboxDir: () => void;
}

export const ManagedFileTreePanel = memo(function ManagedFileTreePanel({
	density = "comfortable",
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
	sandboxDir,
	onRevealSandboxDir,
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
	const isCompact = density === "compact";

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
		<div className="h-full flex flex-col border-r border-border bg-surface">
			<div
				className={cn("border-b border-border", isCompact ? "p-2.5" : "p-3")}
			>
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
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
						className="w-full pl-8 pr-8 py-2 text-sm bg-warm-50 border border-border rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 dark:focus-visible:ring-primary/45 transition-all placeholder:text-text-muted dark:placeholder:text-text-muted"
						aria-label="搜索文件"
					/>
					{hasSearch ? (
						<button
							type="button"
							onClick={() => onSearchQueryChange("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-text-secondary dark:hover:text-zinc-200 hover:bg-warm-200 dark:hover:bg-cream-700 transition-colors focus-ring"
							title="清空搜索"
							aria-label="清空搜索"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					) : null}
				</div>
				<div className="mt-2 flex items-center justify-between text-xs text-text-secondary">
					<span>
						{hasSearch
							? `匹配 ${visibleCount}/${totalFiles}`
							: `共 ${totalFiles} 个文件`}
					</span>
					<div className="inline-flex items-center gap-1">
						<button
							type="button"
							onClick={handleExpandAll}
							className="px-2 py-1 rounded-md hover:bg-warm-200 transition-colors focus-ring"
						>
							展开
						</button>
						<button
							type="button"
							onClick={handleCollapseAll}
							className="px-2 py-1 rounded-md hover:bg-warm-200 transition-colors focus-ring"
						>
							收起
						</button>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto py-2">
				{totalFiles === 0 ? (
					<div className="px-4 py-8 text-center">
						<p className="text-sm text-text-light mb-1">暂无文件</p>
						<p className="text-xs text-text-light">等待 AI 生成...</p>
					</div>
				) : hasSearch && visibleCount === 0 ? (
					<div className="px-4 py-8 text-center">
						<p className="text-sm text-text-muted mb-1">没有匹配文件</p>
						<button
							type="button"
							onClick={() => onSearchQueryChange("")}
							className="text-xs text-text-muted underline underline-offset-2"
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
				<div className="p-3 border-t border-border">
					<button
						type="button"
						onClick={onRevealSandboxDir}
						disabled={!sandboxDir}
						className={cn(
							"w-full min-h-11 py-2 text-xs font-medium rounded-lg transition-colors border focus-ring",
							sandboxDir
								? "text-text-secondary bg-warm-50 hover:bg-warm-200 dark:hover:bg-cream-700 border-border"
								: "text-text-light bg-warm-200/60 border-border cursor-not-allowed",
						)}
					>
						打开沙盒目录
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
