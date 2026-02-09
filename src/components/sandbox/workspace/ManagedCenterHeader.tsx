import { Eye, RefreshCw, Sparkles, X } from "lucide-react";
import { PanelIconButton } from "../../layout/PanelIconButton";
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
				"flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/92 dark:bg-zinc-900/88 backdrop-blur-sm shrink-0",
				density === "compact" ? "px-3 py-2" : "px-4 py-2.5",
			)}
		>
			<div className="flex items-center gap-3">
				<div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5">
					<button
						type="button"
						onClick={() => onSetCenterView("graph")}
						className={cn(
							"inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-ring",
							centerView === "graph"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
						)}
						title="运行图 (Alt+1)"
						aria-label="切换到运行图"
					>
						<Sparkles className="w-4 h-4" />
						运行图
					</button>
					<button
						type="button"
						onClick={() => onSetCenterView("preview")}
						className={cn(
							"inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-ring",
							centerView === "preview"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
						)}
						title="产物预览视角 (Alt+2)"
						aria-label="切换到产物预览视角"
					>
						<Eye className="w-4 h-4" />
						产物预览
					</button>
				</div>

				<div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />

				<div className="min-w-0">
					<h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">
						{headerTitle}
						<span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400 font-normal">
							{headerMeta}
						</span>
					</h2>
					<div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
						快捷键: Alt+1 运行图 · Alt+2 产物预览
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<PanelIconButton
					onClick={onRefresh}
					disabled={isRefreshing}
					label="刷新文件列表"
					className={cn(isRefreshing && "animate-spin")}
					icon={<RefreshCw className="w-4 h-4" />}
				/>
				<PanelIconButton
					onClick={onExit}
					label="关闭托管模式"
					icon={<X className="w-4 h-4" />}
				/>
			</div>
		</div>
	);
}
