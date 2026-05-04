import { Eye, RefreshCw, Workflow, X } from "lucide-react";
import { IconButton } from "../../ui/Button";
import { cn } from "../../../lib/utils";

interface ManagedCenterHeaderProps {
	centerView: "graph" | "preview";
	headerTitle: string;
	headerMeta: string;
	density?: "comfortable" | "compact";
	isRefreshing: boolean;
	onSetCenterView: (view: "graph" | "preview") => void;
	onRefresh: () => void;
	onExit: () => void;
}

export function ManagedCenterHeader({
	centerView,
	headerTitle,
	headerMeta,
	density = "comfortable",
	isRefreshing,
	onSetCenterView,
	onRefresh,
	onExit,
}: ManagedCenterHeaderProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-between border-b border-border/80 bg-surface/92/88 backdrop-blur-sm shrink-0",
				density === "compact" ? "px-3 py-2" : "px-4 py-2.5",
			)}
		>
			<div className="flex items-center gap-3">
				<div className="flex items-center bg-warm-200 rounded-xl p-0.5">
					<button
						type="button"
						onClick={() => onSetCenterView("graph")}
						className={cn(
							"inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-ring cursor-pointer",
							centerView === "graph"
								? "bg-surface dark:bg-cream-700 text-text-primary shadow-sm"
								: "text-text-secondary hover:text-text-primary dark:hover:text-zinc-200",
						)}
						title="运行图 (Alt+1)"
						aria-label="切换到运行图"
					>
						<Workflow className="w-4 h-4" strokeWidth={1.5} />
						运行图
					</button>
					<button
						type="button"
						onClick={() => onSetCenterView("preview")}
						className={cn(
							"inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-ring cursor-pointer",
							centerView === "preview"
								? "bg-surface dark:bg-cream-700 text-text-primary shadow-sm"
								: "text-text-secondary hover:text-text-primary dark:hover:text-zinc-200",
						)}
						title="产物预览视角 (Alt+2)"
						aria-label="切换到产物预览视角"
					>
						<Eye className="w-4 h-4" />
						产物预览
					</button>
				</div>

				<div className="w-px h-5 bg-warm-300 dark:bg-cream-700" />

				<div className="min-w-0">
					<h2 className="text-sm font-medium text-text-secondary dark:text-zinc-200 truncate">
						{headerTitle}
						<span className="ml-2 text-xs text-text-muted font-normal">
							{headerMeta}
						</span>
					</h2>
					<div className="mt-0.5 text-xs text-text-muted">
						快捷键: Alt+1 运行图 · Alt+2 产物预览
					</div>
				</div>
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
				<IconButton
					onClick={onExit}
					aria-label="关闭托管模式"
					title="关闭托管模式"
					variant="ghost"
					size="sm"
				>
					<X className="w-4 h-4" />
				</IconButton>
			</div>
		</div>
	);
}
