import { Eye, RefreshCw, Workflow } from "lucide-react";
import { IconButton } from "../../ui/Button";
import { cn } from "../../../lib/utils";

interface ManagedCenterHeaderProps {
	centerView: "graph" | "preview";
	headerTitle: string;
	headerMeta: string;
	density?: "comfortable" | "compact";
	isRefreshing: boolean;
	onRefresh: () => void;
}

/**
 * 沙盒工作区的内容头。
 *
 * 「运行图 / 预览」的切换已上移到中间栏的标签条（`CenterTabBar`），这里不再重复
 * 一套 segmented control —— 同一个动作出现在两个地方只会让人犹豫点哪个。
 */
export function ManagedCenterHeader({
	centerView,
	headerTitle,
	headerMeta,
	density = "comfortable",
	isRefreshing,
	onRefresh,
}: ManagedCenterHeaderProps) {
	const ViewIcon = centerView === "graph" ? Workflow : Eye;

	return (
		<div
			className={cn(
				"flex items-center justify-between border-b border-border/80 bg-surface/92 backdrop-blur-sm shrink-0",
				density === "compact" ? "px-3 py-2" : "px-4 py-2.5",
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<ViewIcon
					className="h-4 w-4 shrink-0 text-text-muted"
					strokeWidth={1.5}
				/>
				<h2 className="truncate text-sm font-medium text-text-secondary dark:text-zinc-200">
					{headerTitle}
					<span className="ml-2 text-xs font-normal text-text-muted">
						{headerMeta}
					</span>
				</h2>
			</div>

			<div className="flex items-center gap-2">
				<IconButton
					onClick={onRefresh}
					disabled={isRefreshing}
					aria-label="刷新文件列表"
					title="刷新文件列表"
					variant="ghost"
					size="sm"
					className={cn(isRefreshing && "animate-spin")}
				>
					<RefreshCw className="w-4 h-4" />
				</IconButton>
			</div>
		</div>
	);
}
