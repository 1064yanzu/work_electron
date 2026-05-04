import type { OutputAsset } from "../../types";

interface EditorDialogsProps {
	showBulkDeleteConfirm: boolean;
	selectedForManageCount: number;
	isBulkDeleting: boolean;
	onCloseBulkDeleteConfirm: () => void;
	onConfirmBulkDelete: () => void | Promise<void>;
	deleteConfirm: OutputAsset | null;
	onCloseDeleteConfirm: () => void;
	onConfirmDelete: (target: OutputAsset) => void | Promise<void>;
}

export function EditorDialogs({
	showBulkDeleteConfirm,
	selectedForManageCount,
	isBulkDeleting,
	onCloseBulkDeleteConfirm,
	onConfirmBulkDelete,
	deleteConfirm,
	onCloseDeleteConfirm,
	onConfirmDelete,
}: EditorDialogsProps) {
	return (
		<>
			{showBulkDeleteConfirm ? (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
						<h3 className="font-semibold text-lg text-text-primary mb-2">
							确认批量删除
						</h3>
						<p className="text-sm text-text-muted mb-6">
							确定要删除选中的 {selectedForManageCount}{" "}
							篇文档吗？此操作无法撤销。
						</p>
						<div className="flex justify-end gap-2">
							<button
								onClick={onCloseBulkDeleteConfirm}
								className="px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								onClick={() => void onConfirmBulkDelete()}
								disabled={isBulkDeleting}
								className="px-4 py-2 text-sm text-white bg-error hover:bg-error disabled:opacity-50 rounded-lg transition-colors"
							>
								{isBulkDeleting ? "删除中…" : "确认删除"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{deleteConfirm ? (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
						<h3 className="font-semibold text-lg text-text-primary mb-2">
							确认删除
						</h3>
						<p className="text-sm text-text-muted mb-6">
							确定要删除「{deleteConfirm.title || "未命名文档"}
							」吗？此操作无法撤销。
						</p>
						<div className="flex justify-end gap-2">
							<button
								onClick={onCloseDeleteConfirm}
								className="px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								onClick={() => void onConfirmDelete(deleteConfirm)}
								className="px-4 py-2 text-sm text-white bg-error hover:bg-error rounded-lg transition-colors"
							>
								删除
							</button>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
