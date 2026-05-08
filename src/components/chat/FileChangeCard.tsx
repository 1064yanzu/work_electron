import { Check, FilePen, FilePlus, Loader2, X } from "lucide-react";

import type { FileUpdate } from "../../lib/chat/types";

export function FileChangeCard({ update }: { update: FileUpdate }) {
	const isCreate = update.type === "create";
	const status = update.status || "completed";
	const isRunning = status === "running";
	const isError = status === "error";
	const statusText = isError
		? "写入失败"
		: isRunning
			? isCreate
				? "正在创建"
				: "正在写入"
			: isCreate
				? "已创建"
				: "已写入";

	return (
		<div
			className={`my-5 group rounded-xl bg-surface ring-1 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-3.5 transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] ${
				isError
					? "ring-red-200 dark:ring-red-900/70"
					: isRunning
						? "ring-emerald-200/90 dark:ring-emerald-900/60"
						: "ring-zinc-200 dark:ring-zinc-800 hover:ring-zinc-300 dark:hover:ring-zinc-700"
			}`}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<div
						className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
							isError
								? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"
								: isRunning
									? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
									: "bg-warm-200 text-text-secondary"
						}`}
					>
						{isCreate ? (
							<FilePlus className="w-4.5 h-4.5" />
						) : (
							<FilePen className="w-4.5 h-4.5" />
						)}
					</div>

					{/* 文本信息 */}
					<div className="min-w-0 flex-1">
						<h4 className="font-medium text-text-primary text-sm truncate leading-tight mb-0.5">
							{update.fileName}
						</h4>
						<p className="text-xs text-text-muted flex items-center gap-1.5">
							{statusText}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 shrink-0 self-center">
					{update.additions > 0 && (
						<span className="text-[11px] font-mono font-medium text-text-secondary bg-warm-50 px-1.5 py-0.5 rounded">
							+{update.additions}
						</span>
					)}
					{update.deletions > 0 && (
						<span className="text-[11px] font-mono font-medium text-text-secondary bg-warm-50 px-1.5 py-0.5 rounded">
							-{update.deletions}
						</span>
					)}
					{isRunning ? (
						<Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-300" />
					) : isError ? (
						<X className="w-4 h-4 text-red-500 dark:text-red-300" />
					) : (
						<Check className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
					)}
				</div>
			</div>
		</div>
	);
}
