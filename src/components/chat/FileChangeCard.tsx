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
			className={`group relative px-3 py-2.5 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 hover:bg-warm-50/45 dark:hover:bg-cream-900/35 ${
				isError
					? "text-red-600 dark:text-red-300"
					: isRunning
						? "text-emerald-600 dark:text-emerald-300"
						: "text-text-primary dark:text-cream-200"
			}`}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<div
						className={`relative w-7 h-7 rounded-md flex items-center justify-center shrink-0 ring-1 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ${
							isError
								? "bg-red-50 text-red-600 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60"
								: isRunning
									? "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-700/70"
									: "bg-warm-100 text-text-muted ring-border/70 dark:bg-cream-900 dark:text-cream-400 dark:ring-cream-800"
						}`}
					>
						{isRunning && (
							<span className="absolute inset-0 rounded-md ring-2 ring-emerald-400/40 dark:ring-emerald-500/30 animate-ping" />
						)}
						{isCreate ? (
							<FilePlus className="w-4.5 h-4.5 relative" />
						) : (
							<FilePen className="w-4.5 h-4.5 relative" />
						)}
					</div>

					{/* 文本信息 */}
					<div className="min-w-0 flex-1">
						<h4 className="font-medium text-text-primary text-sm truncate leading-tight mb-0.5 dark:text-cream-200">
							{update.fileName}
						</h4>
						<p
							className={`text-xs flex items-center gap-1.5 transition-colors ${
								isRunning
									? "text-emerald-600 dark:text-emerald-300 font-medium"
									: "text-text-muted"
							}`}
						>
							{isRunning && (
								<span className="inline-flex gap-0.5">
									<span
										className="w-1 h-1 rounded-full bg-current animate-bounce"
										style={{ animationDelay: "0ms" }}
									/>
									<span
										className="w-1 h-1 rounded-full bg-current animate-bounce"
										style={{ animationDelay: "120ms" }}
									/>
									<span
										className="w-1 h-1 rounded-full bg-current animate-bounce"
										style={{ animationDelay: "240ms" }}
									/>
								</span>
							)}
							{statusText}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 shrink-0 self-center">
					{update.additions > 0 && (
						<span className="text-xs font-mono font-medium text-text-secondary bg-warm-50 px-1.5 py-0.5 rounded">
							+{update.additions}
						</span>
					)}
					{update.deletions > 0 && (
						<span className="text-xs font-mono font-medium text-text-secondary bg-warm-50 px-1.5 py-0.5 rounded">
							-{update.deletions}
						</span>
					)}
					{isRunning ? (
						<Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-300" />
					) : isError ? (
						<X className="w-4 h-4 text-red-500 dark:text-red-300" />
					) : (
						<Check className="w-4 h-4 text-emerald-600 dark:text-emerald-300 animate-in zoom-in-50 duration-150" />
					)}
				</div>
			</div>
			{/* 进度条：running 时显示 indeterminate 动画 */}
			{isRunning && (
				<div className="absolute left-0 right-0 bottom-0 h-0.5 overflow-hidden bg-emerald-100/40 dark:bg-emerald-900/30">
					<span className="block h-full w-1/3 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-file-progress" />
				</div>
			)}
		</div>
	);
}
