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
			className={`group relative px-3 py-2.5 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 hover:bg-warm-50/45 ${
				isError
					? "text-error"
					: isRunning
						? "text-success"
						: "text-text-primary"
			}`}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<div
						className={`relative w-7 h-7 rounded-md flex items-center justify-center shrink-0 ring-1 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ${
							isError
								? "bg-error-muted text-error ring-error/20"
								: isRunning
									? "bg-success-muted text-success ring-success/30"
									: "bg-warm-100 text-text-muted ring-border/70"
						}`}
					>
						{isRunning && (
							<span className="absolute inset-0 rounded-md ring-2 ring-success/30 animate-ping" />
						)}
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
								isRunning ? "text-success font-medium" : "text-text-muted"
							}`}
						>
							{/* 进行中指示用呼吸点（thinking-dot），弹跳动效过于喧闹 */}
							{isRunning && (
								<span className="inline-flex gap-0.5">
									<span
										className="w-1 h-1 rounded-full bg-current animate-thinking-dot"
										style={{ animationDelay: "0ms" }}
									/>
									<span
										className="w-1 h-1 rounded-full bg-current animate-thinking-dot"
										style={{ animationDelay: "150ms" }}
									/>
									<span
										className="w-1 h-1 rounded-full bg-current animate-thinking-dot"
										style={{ animationDelay: "300ms" }}
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
						<Loader2 className="w-4 h-4 animate-spin text-success" />
					) : isError ? (
						<X className="w-4 h-4 text-error" />
					) : (
						<Check className="w-4 h-4 text-success animate-in zoom-in-50 duration-150" />
					)}
				</div>
			</div>
			{/* 进度条：running 时显示 indeterminate 动画 */}
			{isRunning && (
				<div className="absolute left-0 right-0 bottom-0 h-0.5 overflow-hidden bg-success/10">
					<span className="block h-full w-1/3 bg-success rounded-full animate-file-progress" />
				</div>
			)}
		</div>
	);
}
