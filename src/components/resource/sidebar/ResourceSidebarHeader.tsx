import {
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
	/** 当前层级下的资料条数（不含子文件夹里的） */
	itemCount?: number;
	/** 当前层级下的子文件夹数量 */
	folderCount?: number;
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
	itemCount,
	folderCount,
	onOpenResearch,
	onOpenFolderModal,
	onToggleViewMode,
	onOpenSettings,
	onToggleSelectionMode,
}: ResourceSidebarHeaderProps) {
	// 「资料库」这个标题去掉了——上方的知识 tab 条已经写着它。但整行左侧空着
	// 也不对：一排图标孤零零挤在右上角，读起来像浮在半空。改成放当前层级的
	// 计数，既补上视觉重心，也是这一屏真正缺的信息（层级由面包屑那行负责）。
	const counts = [
		folderCount ? `${folderCount} 个文件夹` : null,
		itemCount === undefined ? null : `${itemCount} 项`,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
			<div className="flex min-w-0 items-center gap-2">
				{viewTabs}
				<span className="min-w-0 truncate text-[11px] text-text-muted">
					{counts}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-0.5">
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
					className={`ml-0.5 flex items-center gap-1 rounded-lg py-1.5 pl-1.5 pr-2 text-xs font-medium transition-colors focus-ring cursor-pointer ${
						selectionMode
							? "text-primary bg-primary/10"
							: "text-text-muted hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200"
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
