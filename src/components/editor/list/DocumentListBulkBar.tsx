import { CheckCircle2, Circle, Trash2 } from "lucide-react";

interface DocumentListBulkBarProps {
	selectedCount: number;
	isAllSelected: boolean;
	onToggleSelectAll: () => void;
	onDeleteSelected: () => void;
	isBulkDeleting: boolean;
}

export function DocumentListBulkBar({
	selectedCount,
	isAllSelected,
	onToggleSelectAll,
	onDeleteSelected,
	isBulkDeleting,
}: DocumentListBulkBarProps) {
	return (
		<div
			className="sticky top-0 z-20 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/70 bg-zinc-50/95 dark:bg-zinc-900/92 backdrop-blur px-3 py-2.5 flex items-center justify-between gap-3"
			role="region"
			aria-label="批量管理工具栏"
		>
			<div className="flex items-center gap-2.5">
				<button
					type="button"
					onClick={onToggleSelectAll}
					className="focus-ring min-h-11 px-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
				>
					{isAllSelected ? (
						<CheckCircle2 className="w-4.5 h-4.5" />
					) : (
						<Circle className="w-4.5 h-4.5" />
					)}
					{isAllSelected ? "取消全选" : "全选"}
				</button>
				<span className="text-sm text-zinc-700 dark:text-zinc-200">
					已选择 {selectedCount} 篇
				</span>
			</div>

			<button
				type="button"
				onClick={onDeleteSelected}
				disabled={selectedCount === 0 || isBulkDeleting}
				className="focus-ring min-h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
			>
				<Trash2 className="w-4 h-4" />
				批量删除
			</button>
		</div>
	);
}
