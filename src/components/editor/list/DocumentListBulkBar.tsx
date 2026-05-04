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
			className="sticky top-0 z-20 rounded-2xl border border-border/80/70 bg-warm-50/95/92 backdrop-blur px-3 py-2.5 flex items-center justify-between gap-3"
			role="region"
			aria-label="批量管理工具栏"
		>
			<div className="flex items-center gap-2.5">
				<button
					type="button"
					onClick={onToggleSelectAll}
					className="focus-ring min-h-11 px-3 inline-flex items-center gap-2 rounded-xl border border-border bg-surface text-sm text-text-secondary dark:text-zinc-200 hover:bg-warm-200 dark:hover:bg-cream-700 transition-colors"
				>
					{isAllSelected ? (
						<CheckCircle2 className="w-4.5 h-4.5" />
					) : (
						<Circle className="w-4.5 h-4.5" />
					)}
					{isAllSelected ? "取消全选" : "全选"}
				</button>
				<span className="text-sm text-text-secondary dark:text-zinc-200">
					已选择 {selectedCount} 篇
				</span>
			</div>

			<button
				type="button"
				onClick={onDeleteSelected}
				disabled={selectedCount === 0 || isBulkDeleting}
				className="focus-ring min-h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-error hover:bg-[#9e2b2b] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
			>
				<Trash2 className="w-4 h-4" />
				批量删除
			</button>
		</div>
	);
}
