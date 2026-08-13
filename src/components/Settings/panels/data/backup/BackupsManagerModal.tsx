/**
 * BackupsManagerModal — 本地备份管理弹窗（原 LocalBackupManagerModal，Phase 5 迁移到 backup/）
 *
 * 显示本地备份文件列表，支持恢复、删除、批量删除操作。
 * 原文件位于 `src/components/Settings/components/LocalBackupManagerModal.tsx`，
 * Phase 5 随 `data.backup` 面板拆分下沉到 `panels/data/backup/` 目录；
 * 同时保持 `LocalBackupManagerModal` 作为导出别名，避免下游误用旧 import 报错。
 */
import { AlertCircle, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	deleteLocalBackupFile,
	type LocalBackupFileInfo,
	listLocalBackupFiles,
	restoreFromLocalFile,
} from "../../../../../lib/api";
import { confirmDialog } from "../../../../ui/ConfirmDialog";
import { Modal } from "../../../../ui/Modal";
import { toast } from "../../../../ui/Toast";

interface BackupsManagerModalProps {
	isOpen: boolean;
	onClose: () => void;
	backupDir: string;
	onRestoreSuccess?: () => void;
}

function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function formatTime(isoString: string): string {
	const date = new Date(isoString);
	return date.toLocaleString("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function BackupsManagerModal({
	isOpen,
	onClose,
	backupDir,
	onRestoreSuccess,
}: BackupsManagerModalProps) {
	const [backupFiles, setBackupFiles] = useState<LocalBackupFileInfo[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
	const [isDeleting, setIsDeleting] = useState<string | null>(null);
	const [isRestoring, setIsRestoring] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const fetchBackupFiles = useCallback(async () => {
		if (!backupDir) return;

		setIsLoading(true);
		setError(null);
		try {
			const files = await listLocalBackupFiles(backupDir);
			setBackupFiles(files);
		} catch (err) {
			setError(err instanceof Error ? err.message : "获取备份列表失败");
		} finally {
			setIsLoading(false);
		}
	}, [backupDir]);

	useEffect(() => {
		if (isOpen && backupDir) {
			fetchBackupFiles();
			setSelectedFiles(new Set());
		}
	}, [isOpen, backupDir, fetchBackupFiles]);

	const handleDelete = async (fileName: string) => {
		const confirmed = await confirmDialog.danger(
			`确定要删除备份文件 "${fileName}" 吗？此操作不可恢复。`,
			"删除备份文件",
		);
		if (!confirmed) {
			return;
		}

		setIsDeleting(fileName);
		try {
			await deleteLocalBackupFile(backupDir, fileName);
			setBackupFiles((prev) => prev.filter((f) => f.fileName !== fileName));
			setSelectedFiles((prev) => {
				const next = new Set(prev);
				next.delete(fileName);
				return next;
			});
		} catch (err) {
			toast.error(`删除失败: ${err instanceof Error ? err.message : err}`);
		} finally {
			setIsDeleting(null);
		}
	};

	const handleBatchDelete = async () => {
		if (selectedFiles.size === 0) return;

		const confirmed = await confirmDialog.danger(
			`确定要删除选中的 ${selectedFiles.size} 个备份文件吗？此操作不可恢复。`,
			"批量删除备份",
		);
		if (!confirmed) {
			return;
		}

		setIsDeleting("batch");
		try {
			for (const fileName of selectedFiles) {
				await deleteLocalBackupFile(backupDir, fileName);
			}
			setBackupFiles((prev) =>
				prev.filter((f) => !selectedFiles.has(f.fileName)),
			);
			setSelectedFiles(new Set());
		} catch (err) {
			toast.error(`批量删除失败: ${err instanceof Error ? err.message : err}`);
		} finally {
			setIsDeleting(null);
		}
	};

	const handleRestore = async (fileName: string) => {
		const confirmed = await confirmDialog.warning(
			`确定要从 "${fileName}" 恢复数据吗？当前数据将被覆盖，建议先备份当前数据。`,
			"恢复备份",
		);
		if (!confirmed) {
			return;
		}

		setIsRestoring(fileName);
		try {
			await restoreFromLocalFile(backupDir, fileName);
			toast.success("恢复成功！应用将刷新以加载新数据。", 2200);
			onRestoreSuccess?.();
			onClose();
			setTimeout(() => {
				window.location.reload();
			}, 800);
		} catch (err) {
			toast.error(`恢复失败: ${err instanceof Error ? err.message : err}`);
		} finally {
			setIsRestoring(null);
		}
	};

	const toggleSelect = (fileName: string) => {
		setSelectedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(fileName)) {
				next.delete(fileName);
			} else {
				next.add(fileName);
			}
			return next;
		});
	};

	const toggleSelectAll = () => {
		if (selectedFiles.size === backupFiles.length) {
			setSelectedFiles(new Set());
		} else {
			setSelectedFiles(new Set(backupFiles.map((f) => f.fileName)));
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="本地备份管理">
			<div className="space-y-4">
				{/* 头部操作栏 */}
				<div className="flex items-center justify-between">
					<div className="text-sm text-text-muted">
						备份目录: <span className="font-mono text-xs">{backupDir}</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={fetchBackupFiles}
							disabled={isLoading}
							className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary hover:bg-warm-200 rounded-lg transition-colors disabled:opacity-50"
						>
							<RefreshCw
								className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
							/>
							刷新
						</button>
						{selectedFiles.size > 0 && (
							<button
								type="button"
								onClick={handleBatchDelete}
								disabled={isDeleting !== null}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-error hover:bg-error/8 rounded-full transition-colors disabled:opacity-50"
							>
								<Trash2 className="w-4 h-4" />
								删除选中 ({selectedFiles.size})
							</button>
						)}
					</div>
				</div>

				{/* 错误提示 */}
				{error && (
					<div className="flex items-center gap-2 px-4 py-3 bg-error/8 text-error text-sm rounded-xl border border-error/20">
						<AlertCircle className="w-4 h-4 flex-shrink-0" />
						{error}
					</div>
				)}

				{/* 表头 */}
				<div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-text-light border-b border-border">
					<div className="col-span-1">
						<input
							type="checkbox"
							checked={
								backupFiles.length > 0 &&
								selectedFiles.size === backupFiles.length
							}
							onChange={toggleSelectAll}
							className="rounded-lg"
						/>
					</div>
					<div className="col-span-5">文件名</div>
					<div className="col-span-2">大小</div>
					<div className="col-span-2">修改时间</div>
					<div className="col-span-2 text-right">操作</div>
				</div>

				{/* 备份列表 */}
				<div className="max-h-80 overflow-y-auto space-y-1">
					{isLoading ? (
						<div className="flex items-center justify-center py-8">
							<RefreshCw className="w-5 h-5 animate-spin text-text-light" />
						</div>
					) : backupFiles.length === 0 ? (
						<div className="text-center py-8 text-sm text-text-light">
							暂无备份文件
						</div>
					) : (
						backupFiles.map((backup) => (
							<div
								key={backup.fileName}
								className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 bg-warm-50 hover:bg-warm-200 rounded-lg transition-colors"
							>
								<div className="col-span-1">
									<input
										type="checkbox"
										checked={selectedFiles.has(backup.fileName)}
										onChange={() => toggleSelect(backup.fileName)}
										className="rounded-lg"
									/>
								</div>
								<div
									className="col-span-5 text-xs font-mono text-text-secondary truncate"
									title={backup.fileName}
								>
									{backup.fileName}
								</div>
								<div className="col-span-2 text-xs text-text-muted">
									{formatFileSize(backup.size)}
								</div>
								<div className="col-span-2 text-xs text-text-muted">
									{formatTime(backup.modifiedTime)}
								</div>
								<div className="col-span-2 flex items-center justify-end gap-1">
									<button
										type="button"
										onClick={() => handleRestore(backup.fileName)}
										disabled={isRestoring !== null || isDeleting !== null}
										className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
										title="恢复"
									>
										{isRestoring === backup.fileName ? (
											<RefreshCw className="w-4 h-4 animate-spin" />
										) : (
											<RotateCcw className="w-4 h-4" />
										)}
									</button>
									<button
										type="button"
										onClick={() => handleDelete(backup.fileName)}
										disabled={isRestoring !== null || isDeleting !== null}
										className="p-1.5 text-text-light hover:text-error hover:bg-error/8 rounded-lg transition-colors disabled:opacity-50"
										title="删除"
									>
										{isDeleting === backup.fileName ? (
											<RefreshCw className="w-3.5 h-3.5 animate-spin" />
										) : (
											<Trash2 className="w-3.5 h-3.5" />
										)}
									</button>
								</div>
							</div>
						))
					)}
				</div>

				{/* 底部按钮 */}
				<div className="flex justify-end pt-4 border-t border-border">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-warm-200 rounded-xl transition-colors"
					>
						关闭
					</button>
				</div>
			</div>
		</Modal>
	);
}

/**
 * @deprecated 旧名称 `LocalBackupManagerModal` 保持为别名，方便历史 import；
 * 新调用方请使用 `BackupsManagerModal`。
 */
export { BackupsManagerModal as LocalBackupManagerModal };
