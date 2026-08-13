import { Check, FilePen, FilePlus, X } from "lucide-react";

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
			className={`group relative px-3 py-2.5 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 hover:bg-warm-50/45 ${
				isError
					? "text-error"
					: isRunning
						? "text-text-secondary"
						: "text-text-primary"
			}`}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<div
						className={`relative w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ring-1 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ${
							isError
								? "bg-error-muted text-error ring-error/20"
								: isRunning
									? "bg-warm-100 text-text-secondary ring-border/70"
									: "bg-warm-100 text-text-muted ring-border/70"
						}`}
					>
						{isCreate ? (
							<FilePlus className="w-4.5 h-4.5 relative" />
						) : (
							<FilePen className="w-4.5 h-4.5 relative" />
						)}
					</div>

					{/* 文本信息 */}
					<div className="min-w-0 flex-1">
						<h4 className="font-medium text-text-primary text-sm truncate leading-tight mb-0.5">
							{update.fileName}
						</h4>
						<p
							className={`text-xs flex items-center gap-1.5 transition-colors ${
								isRunning
									? "text-text-secondary font-medium"
									: "text-text-muted"
							}`}
						>
							{statusText}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 shrink-0 self-center">
					{update.additions > 0 && (
						<span className="text-xs font-mono font-medium text-text-secondary bg-warm-50 px-1.5 py-0.5 rounded-lg">
							+{update.additions}
						</span>
					)}
					{update.deletions > 0 && (
						<span className="text-xs font-mono font-medium text-text-secondary bg-warm-50 px-1.5 py-0.5 rounded-lg">
							-{update.deletions}
						</span>
					)}
					{isRunning ? null : isError ? (
						<X className="w-4 h-4 text-error" />
					) : (
						<Check className="w-4 h-4 text-success animate-in zoom-in-50 duration-150" />
					)}
				</div>
			</div>
			{/* 进度条：running 时显示 indeterminate 动画 */}
			{isRunning && (
				<div className="absolute left-0 right-0 bottom-0 h-0.5 overflow-hidden bg-warm-200">
					<span className="block h-full w-1/3 bg-text-muted rounded-full animate-file-progress" />
				</div>
			)}
		</div>
	);
}
