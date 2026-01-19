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
}

export function DragAndDropImportUI<TResult = unknown>({
	isDragging,
	queue,
	queueStatus,
	onStart,
	onCancel,
	onClear,
	onRemoveItem,
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
			? "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400"
			: summary.error > 0
				? "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400"
				: summary.success > 0
					? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400"
					: "text-zinc-600 bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400";

	const canStart = queueStatus === "idle" && hasPending;
	const canCancel = queueStatus === "importing";
	const canClear = queueStatus === "idle" && queue.length > 0;

	return (
		<>
			{isDragging && (
				<div className="absolute inset-0 z-40 pointer-events-none">
					<div className="absolute inset-0 bg-white/60 dark:bg-black/40 backdrop-blur-md" />
					<div className="absolute inset-0 flex items-center justify-center p-6">
						<div className="w-full max-w-sm rounded-3xl bg-white/85 dark:bg-zinc-900/80 shadow-[0_8px_30px_rgb(0,0,0,0.10)] ring-1 ring-black/5 dark:ring-white/10 px-5 py-4">
							<div className="flex items-center gap-4">
								<div className="w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
									<ArrowDownToLine className="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
								</div>
								<div className="flex-1">
									<p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
										松开以导入到资料库
									</p>
									<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
										支持文本 / PDF / Word / 图片等常见格式
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{queue.length > 0 && (
				<div className="absolute bottom-3 left-3 right-3 z-30">
					<div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_8px_30px_rgb(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
						<div className="px-4 py-3 flex items-center justify-between">
							<div className="flex items-center gap-2 min-w-0">
								<span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
									导入队列
								</span>
								<span
									className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClassName}`}
								>
									{statusLabel}
								</span>
								<span className="text-[11px] text-zinc-400 truncate">
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
										className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
										title="开始导入"
									>
										<Play className="w-4 h-4" />
									</button>
								)}
								{canCancel && (
									<button
										onClick={onCancel}
										className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
										title="取消"
									>
										<Ban className="w-4 h-4" />
									</button>
								)}
								{canClear && (
									<button
										onClick={onClear}
										className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
										title="清空"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								)}
							</div>
						</div>

						<div className="max-h-52 overflow-y-auto scrollbar-hide border-t border-zinc-100 dark:border-zinc-800">
							{queue.map((item) => (
								<div
									key={item.id}
									className="px-4 py-2.5 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
								>
									<div className="mt-0.5">
										{item.status === "importing" ? (
											<Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
										) : item.status === "success" ? (
											<CheckCircle2 className="w-4 h-4 text-emerald-500" />
										) : item.status === "error" ? (
											<AlertCircle className="w-4 h-4 text-red-500" />
										) : (
											<Circle className="w-4 h-4 text-zinc-300" />
										)}
									</div>

									<div className="flex-1 min-w-0">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
													{item.name}
												</p>
												{item.error && (
													<p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 line-clamp-2">
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
												className="shrink-0 p-1 rounded-md text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
												title="移除"
											>
												<X className="w-3.5 h-3.5" />
											</button>
										</div>

										<div className="mt-2 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
											<div
												className={`h-full rounded-full transition-all ${
													item.status === "error"
														? "bg-red-500"
														: item.status === "success"
															? "bg-emerald-500"
															: "bg-blue-500"
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
