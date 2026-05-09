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
			className={`group px-3 py-2.5 transition-colors hover:bg-warm-50/45 dark:hover:bg-zinc-900/35 ${
				isError
					? "text-red-600 dark:text-red-300"
					: isRunning
						? "text-emerald-600 dark:text-emerald-300"
						: "text-text-primary dark:text-zinc-200"
			}`}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<div
						className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ring-1 ${
							isError
								? "bg-red-50 text-red-600 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60"
								: isRunning
									? "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60"
									: "bg-warm-100 text-text-muted ring-border/70 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800"
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
						<h4 className="font-medium text-text-primary text-sm truncate leading-tight mb-0.5 dark:text-zinc-200">
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
