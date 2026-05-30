import {
	AlertCircle,
	ArrowDownToLine,
	Ban,
	CheckCircle2,
	Circle,
	Loader2,
	Play,
	Trash2,
	X,
} from "lucide-react";
import { useMemo } from "react";

import type {
	DragAndDropImportItem,
	DragAndDropQueueStatus,
} from "../../hooks/useDragAndDropImport";

interface DragAndDropImportUIProps<TResult = unknown> {
	isDragging: boolean;
	queue: Array<DragAndDropImportItem<TResult>>;
	queueStatus: DragAndDropQueueStatus;
	onStart: () => void;
	onCancel: () => void;
	onClear: () => void;
	onRemoveItem: (id: string) => void;
	/** 拖拽悬停时的主文字，默认"松开以导入到资料库" */
	dragLabel?: string;
	/** 拖拽悬停时的副文字，默认显示支持的格式提示 */
	dragSubLabel?: string;
}

export function DragAndDropImportUI<TResult = unknown>({
	isDragging,
	queue,
	queueStatus,
	onStart,
	onCancel,
	onClear,
	onRemoveItem,
	dragLabel = "松开以导入到资料库",
	dragSubLabel = "支持文本 / PDF / Word / 图片等常见格式",
}: DragAndDropImportUIProps<TResult>) {
	const summary = useMemo(() => {
		const total = queue.length;
		const pending = queue.filter((i) => i.status === "pending").length;
		const importing = queue.filter((i) => i.status === "importing").length;
		const success = queue.filter((i) => i.status === "success").length;
		const error = queue.filter((i) => i.status === "error").length;
		return { total, pending, importing, success, error };
	}, [queue]);

	const hasPending = summary.pending > 0;
	const statusLabel =
		queueStatus === "importing" ? "导入中" : hasPending ? "待导入" : "已完成";

	const statusClassName =
		queueStatus === "importing"
			? "text-focus bg-focus/8 dark:bg-blue-900/20 dark:text-focus"
			: summary.error > 0
				? "text-error bg-[rgba(181,51,51,0.08)] dark:bg-red-900/20 dark:text-error"
				: summary.success > 0
					? "text-success bg-success/8 dark:bg-emerald-900/20 dark:text-success"
					: "text-text-secondary bg-warm-50";

	const canStart = queueStatus === "idle" && hasPending;
	const canCancel = queueStatus === "importing";
	const canClear = queueStatus === "idle" && queue.length > 0;

	return (
		<>
			{isDragging && (
				<div className="absolute inset-0 z-40 pointer-events-none">
					<div className="absolute inset-0 bg-surface/60 dark:bg-black/40 backdrop-blur-md" />
					<div className="absolute inset-0 flex items-center justify-center p-6">
						<div className="w-full max-w-sm rounded-3xl bg-surface/85/80 shadow-[0_8px_30px_rgb(0,0,0,0.10)] ring-1 ring-black/5 dark:ring-white/10 px-5 py-4">
							<div className="flex items-center gap-4">
								<div className="w-11 h-11 rounded-2xl bg-warm-200 flex items-center justify-center">
									<ArrowDownToLine className="w-5 h-5 text-text-secondary dark:text-zinc-200" />
								</div>
								<div className="flex-1">
									<p className="text-sm font-semibold text-text-primary">
										{dragLabel}
									</p>
									<p className="text-xs text-text-muted mt-0.5">
										{dragSubLabel}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{queue.length > 0 && (
				<div className="absolute bottom-3 left-3 right-3 z-30">
					<div className="rounded-2xl bg-surface shadow-[0_8px_30px_rgb(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
						<div className="px-4 py-3 flex items-center justify-between">
							<div className="flex items-center gap-2 min-w-0">
								<span className="text-xs font-semibold text-text-primary">
									导入队列
								</span>
								<span
									className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClassName}`}
								>
									{statusLabel}
								</span>
								<span className="text-[11px] text-text-light truncate">
									{summary.total > 0 ? `共 ${summary.total}` : ""}
									{summary.success > 0 ? ` · 成功 ${summary.success}` : ""}
									{summary.error > 0 ? ` · 失败 ${summary.error}` : ""}
									{summary.pending > 0 ? ` · 待导入 ${summary.pending}` : ""}
								</span>
							</div>

							<div className="flex items-center gap-1 shrink-0">
								{canStart && (
									<button
										onClick={onStart}
										className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-warm-200 transition-colors"
										title="开始导入"
									>
										<Play className="w-4 h-4" />
									</button>
								)}
								{canCancel && (
									<button
										onClick={onCancel}
										className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-warm-200 transition-colors"
										title="取消"
									>
										<Ban className="w-4 h-4" />
									</button>
								)}
								{canClear && (
									<button
										onClick={onClear}
										className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-warm-200 transition-colors"
										title="清空"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								)}
							</div>
						</div>

						<div className="max-h-52 overflow-y-auto scrollbar-hide border-t border-border">
							{queue.map((item) => (
								<div
									key={item.id}
									className="px-4 py-2.5 flex items-start gap-3 hover:bg-warm-50/50 transition-colors"
								>
									<div className="mt-0.5">
										{item.status === "importing" ? (
											<Loader2 className="w-4 h-4 text-focus animate-spin" />
										) : item.status === "success" ? (
											<CheckCircle2 className="w-4 h-4 text-success" />
										) : item.status === "error" ? (
											<AlertCircle className="w-4 h-4 text-error" />
										) : (
											<Circle className="w-4 h-4 text-text-light" />
										)}
									</div>

									<div className="flex-1 min-w-0">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="text-xs font-medium text-text-primary truncate">
													{item.name}
												</p>
												{item.error && (
													<p className="text-[11px] text-error dark:text-error mt-0.5 line-clamp-2">
														{item.error}
													</p>
												)}
											</div>

											<button
												onClick={() => onRemoveItem(item.id)}
												disabled={
													queueStatus === "importing" &&
													item.status === "importing"
												}
												className="shrink-0 p-1 rounded-md text-text-light hover:text-text-secondary dark:hover:text-zinc-200 hover:bg-warm-200 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
												title="移除"
											>
												<X className="w-3.5 h-3.5" />
											</button>
										</div>

										<div className="mt-2 h-1.5 bg-warm-200 rounded-full overflow-hidden">
											<div
												className={`h-full rounded-full transition-all ${
													item.status === "error"
														? "bg-error"
														: item.status === "success"
															? "bg-success"
															: "bg-focus"
												}`}
												style={{
													width: `${Math.max(0, Math.min(1, item.progress)) * 100}%`,
												}}
											/>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</>
	);
}
