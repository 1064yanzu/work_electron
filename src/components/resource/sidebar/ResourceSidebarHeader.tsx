import {
	BookOpen,
	CheckSquare,
	FolderPlus,
	Grid,
	List,
	Settings,
	Zap,
	Square,
} from "lucide-react";
import type React from "react";
import { IconButton } from "../../ui/Button";

interface ResourceSidebarHeaderProps {
	currentResearch?: { status?: string } | null;
	viewMode: "grid" | "list";
	selectionMode: boolean;
	viewTabs: React.ReactNode;
	onOpenResearch: () => void;
	onOpenFolderModal: () => void;
	onToggleViewMode: () => void;
	onOpenSettings: () => void;
	onToggleSelectionMode: () => void;
}

export function ResourceSidebarHeader({
	currentResearch,
	viewMode,
	selectionMode,
	viewTabs,
	onOpenResearch,
	onOpenFolderModal,
	onToggleViewMode,
	onOpenSettings,
	onToggleSelectionMode,
}: ResourceSidebarHeaderProps) {
	return (
		<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-zinc-100 dark:border-zinc-800">
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-2">
					<BookOpen className="w-4 h-4 text-zinc-400" />
					<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
						资料库
					</h2>
				</div>
				{viewTabs}
			</div>
			<div className="flex items-center gap-1">
				{currentResearch ? (
					<div className="relative">
						<IconButton
							onClick={onOpenResearch}
							aria-label="查看研究进度"
							title="查看研究进度"
							variant="ghost"
							size="sm"
							className="text-primary hover:text-primary"
						>
							<Zap className="w-4 h-4" />
						</IconButton>
						{currentResearch.status !== "completed" ? (
							<span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
						) : null}
					</div>
				) : null}
				<IconButton
					onClick={onOpenFolderModal}
					aria-label="新建文件夹"
					title="新建文件夹"
					variant="ghost"
					size="sm"
				>
					<FolderPlus className="w-4 h-4" />
				</IconButton>
				<IconButton
					onClick={onToggleViewMode}
					aria-label={viewMode === "grid" ? "切换到列表视图" : "切换到平铺视图"}
					title={viewMode === "grid" ? "切换到列表视图" : "切换到平铺视图"}
					variant="ghost"
					size="sm"
				>
					{viewMode === "grid" ? (
						<List className="w-4 h-4" />
					) : (
						<Grid className="w-4 h-4" />
					)}
				</IconButton>
				<IconButton
					onClick={onOpenSettings}
					aria-label="打开设置"
					title="打开设置"
					variant="ghost"
					size="sm"
				>
					<Settings className="w-4 h-4" />
				</IconButton>
				<button
					type="button"
					onClick={onToggleSelectionMode}
					aria-label={selectionMode ? "退出批量管理" : "进入批量管理"}
					className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium focus-ring cursor-pointer ${
						selectionMode
							? "text-primary bg-primary/10"
							: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
					}`}
				>
					{selectionMode ? (
						<CheckSquare className="w-3.5 h-3.5" />
					) : (
						<Square className="w-3.5 h-3.5" />
					)}
					{selectionMode ? "完成" : "管理"}
				</button>
			</div>
		</div>
	);
}
