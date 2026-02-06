import { Code, Eye, RefreshCw, Sparkles, X } from "lucide-react";
import { cn } from "../../../lib/utils";

interface ManagedCenterHeaderProps {
	centerView: "graph" | "preview" | "files";
	headerTitle: string;
	headerMeta: string;
	isRefreshing: boolean;
	onSetCenterView: (view: "graph" | "preview" | "files") => void;
	onRefresh: () => void;
	onExit: () => void;
}

export function ManagedCenterHeader({
	centerView,
	headerTitle,
	headerMeta,
	isRefreshing,
	onSetCenterView,
	onRefresh,
	onExit,
}: ManagedCenterHeaderProps) {
	return (
		<div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm shrink-0">
			<div className="flex items-center gap-3">
				<div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
					<button
						type="button"
						onClick={() => onSetCenterView("graph")}
						className={cn(
							"p-1.5 rounded-md transition-colors",
							centerView === "graph"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
						)}
						title="运行图 (Alt+1)"
					>
						<Sparkles className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => onSetCenterView("preview")}
						className={cn(
							"p-1.5 rounded-md transition-colors",
							centerView === "preview"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
						)}
						title="预览视角 (Alt+2)"
					>
						<Eye className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => onSetCenterView("files")}
						className={cn(
							"p-1.5 rounded-md transition-colors",
							centerView === "files"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
						)}
						title="文件视角 (Alt+3)"
					>
						<Code className="w-4 h-4" />
					</button>
				</div>

				<div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />

				<div className="min-w-0">
					<h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
						{headerTitle}
						<span className="ml-2 text-xs text-zinc-400 font-normal">
							{headerMeta}
						</span>
					</h2>
					<div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
						快捷键: Alt+1 运行图 · Alt+2 预览 · Alt+3 文件
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onRefresh}
					disabled={isRefreshing}
					className={cn(
						"p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors",
						isRefreshing && "animate-spin",
					)}
					title="刷新文件列表"
				>
					<RefreshCw className="w-4 h-4" />
				</button>
				<button
					type="button"
					onClick={onExit}
					className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
					title="关闭"
				>
					<X className="w-4 h-4" />
				</button>
			</div>
		</div>
	);
}
