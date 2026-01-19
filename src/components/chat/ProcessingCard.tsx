import { FilePen, FilePlus, Loader2 } from "lucide-react";

export function ProcessingCard({ type }: { type: "update" | "create" }) {
	return (
		<div className="my-4 group relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-800/50 ring-1 ring-zinc-900/5 dark:ring-zinc-100/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4 select-none transition-all hover:shadow-md">
			<div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-50/50 to-transparent dark:via-white/5 skeleton-shimmer" />
			<div className="flex items-center gap-4 relative z-10">
				<div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center shrink-0 ring-1 ring-zinc-900/5 dark:ring-zinc-700">
					{type === "create" ? (
						<FilePlus className="w-5 h-5 text-indigo-500 animate-pulse" />
					) : (
						<FilePen className="w-5 h-5 text-indigo-500 animate-pulse" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<p className="font-medium text-zinc-800 dark:text-zinc-100 text-sm tracking-tight">
							{type === "create" ? "正在构思新文档" : "正在优化文档内容"}
						</p>
						<Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500/70" />
					</div>
					<p className="text-xs text-zinc-400 mt-0.5 font-medium">
						AI 正在实时生成并应用变更...
					</p>
				</div>
			</div>
		</div>
	);
}
