import type { Card, Folder, Source } from "../../../types";
import { FocusTrap } from "../../ui/FocusTrap";

interface ResourceSidebarDialogsProps {
	deleteConfirm: Source | null;
	onCancelDeleteSource: () => void;
	onConfirmDeleteSource: (source: Source) => void;
	cardDeleteConfirm: Card | null;
	onCancelDeleteCard: () => void;
	onConfirmDeleteCard: () => void;
	batchDeleteConfirm: string[] | null;
	onCancelBatchDelete: () => void;
	onConfirmBatchDelete: () => void;
	folderDeleteConfirm: Folder | null;
	onCancelDeleteFolder: () => void;
	onConfirmDeleteFolder: (folder: Folder) => void;
}

export function ResourceSidebarDialogs({
	deleteConfirm,
	onCancelDeleteSource,
	onConfirmDeleteSource,
	cardDeleteConfirm,
	onCancelDeleteCard,
	onConfirmDeleteCard,
	batchDeleteConfirm,
	onCancelBatchDelete,
	onConfirmBatchDelete,
	folderDeleteConfirm,
	onCancelDeleteFolder,
	onConfirmDeleteFolder,
}: ResourceSidebarDialogsProps) {
	return (
		<>
			{deleteConfirm ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<FocusTrap
						role="dialog"
						aria-modal="true"
						onEscape={onCancelDeleteSource}
						className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150"
					>
						<h3 className="font-semibold text-lg text-text-primary mb-2">
							删除资料
						</h3>
						<p className="text-sm text-text-muted mb-6">
							确定要删除「{deleteConfirm.title}」吗？此操作无法撤销。
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={onCancelDeleteSource}
								className="px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								type="button"
								onClick={() => onConfirmDeleteSource(deleteConfirm)}
								className="px-4 py-2 text-sm text-white bg-error hover:bg-error rounded-lg transition-colors"
							>
								删除
							</button>
						</div>
					</FocusTrap>
				</div>
			) : null}

			{cardDeleteConfirm ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
					<FocusTrap
						role="dialog"
						aria-modal="true"
						onEscape={onCancelDeleteCard}
						className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150"
					>
						<h3 className="font-semibold text-lg text-text-primary mb-2">
							删除分享卡
						</h3>
						<p className="text-sm text-text-muted mb-6">
							确定删除「{cardDeleteConfirm.title}」吗？图片文件也会一并移除。
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={onCancelDeleteCard}
								className="px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								type="button"
								onClick={onConfirmDeleteCard}
								className="px-4 py-2 text-sm text-white bg-error hover:bg-error rounded-lg transition-colors"
							>
								删除
							</button>
						</div>
					</FocusTrap>
				</div>
			) : null}

			{batchDeleteConfirm ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
					<FocusTrap
						role="dialog"
						aria-modal="true"
						onEscape={onCancelBatchDelete}
						className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150"
					>
						<h3 className="font-semibold text-lg text-text-primary mb-2">
							批量删除
						</h3>
						<p className="text-sm text-text-muted mb-6">
							已选择 {batchDeleteConfirm.length}{" "}
							条资料，删除后不可恢复，确认继续吗？
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={onCancelBatchDelete}
								className="px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								type="button"
								onClick={onConfirmBatchDelete}
								className="px-4 py-2 text-sm text-white bg-error hover:bg-error rounded-lg transition-colors"
							>
								删除
							</button>
						</div>
					</FocusTrap>
				</div>
			) : null}

			{folderDeleteConfirm ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<FocusTrap
						role="dialog"
						aria-modal="true"
						onEscape={onCancelDeleteFolder}
						className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150"
					>
						<h3 className="font-semibold text-lg text-text-primary mb-2">
							删除文件夹
						</h3>
						<p className="text-sm text-text-muted mb-6">
							确定要删除「{folderDeleteConfirm.name}
							」吗？文件夹内的资料将变为未归类状态。
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={onCancelDeleteFolder}
								className="px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								type="button"
								onClick={() => onConfirmDeleteFolder(folderDeleteConfirm)}
								className="px-4 py-2 text-sm text-white bg-error hover:bg-error rounded-lg transition-colors"
							>
								删除
							</button>
						</div>
					</FocusTrap>
				</div>
			) : null}
		</>
	);
}
