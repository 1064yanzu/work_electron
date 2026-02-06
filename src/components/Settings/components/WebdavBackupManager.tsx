/**
 * WebDAV 备份管理器组件（优化版）
 * 使用 Toast、ConfirmDialog、ProgressBar 等现代化 UI 组件
 */
import { Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { WebDavConfig, WebdavBackupFile } from "../../../lib/api";
import {
	deleteWebdavBackup,
	listWebdavBackups,
	restoreFromWebdav,
} from "../../../lib/api";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { ProgressBar } from "../../ui/ProgressBar";
import { toast } from "../../ui/Toast";

// 格式化文件大小
function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / k ** i).toFixed(2)) + " " + sizes[i];
}

interface WebdavBackupManagerProps {
	visible: boolean;
	onClose: () => void;
	webdavConfig: WebDavConfig;
	onRestoreSuccess?: () => void;
}

export function WebdavBackupManager({
	visible,
	onClose,
	webdavConfig,
	onRestoreSuccess,
}: WebdavBackupManagerProps) {
	const [backupFiles, setBackupFiles] = useState<WebdavBackupFile[]>([]);
	const [loading, setLoading] = useState(false);
	const [deleting, setDeleting] = useState<string | null>(null);
	const [restoring, setRestoring] = useState<string | null>(null);
	const [restoreProgress, setRestoreProgress] = useState(0);
	const [restoreStage, setRestoreStage] = useState<string>();

	// 获取备份文件列表
	const fetchBackupFiles = useCallback(async () => {
		if (!webdavConfig.webdavHost) return;

		setLoading(true);
		try {
			const files = await listWebdavBackups(webdavConfig);
			setBackupFiles(files);
			toast.success(`获取到 ${files.length} 个备份文件`);
		} catch (error) {
			console.error("Failed to fetch backup files:", error);
			toast.error(
				"获取备份列表失败：" +
					(error instanceof Error ? error.message : "未知错误"),
			);
		} finally {
			setLoading(false);
		}
	}, [webdavConfig]);

	// 删除备份
	const handleDelete = async (fileName: string) => {
		const confirmed = await confirmDialog.danger(
			`确定要删除备份文件吗？\n\n文件名：${fileName}\n\n此操作不可恢复。`,
			"删除备份",
		);

		if (!confirmed) return;

		setDeleting(fileName);
		try {
			await deleteWebdavBackup(fileName, webdavConfig);
			toast.success("备份删除成功");
			await fetchBackupFiles();
		} catch (error) {
			console.error("Failed to delete backup:", error);
			toast.error(
				"删除失败：" + (error instanceof Error ? error.message : "未知错误"),
			);
		} finally {
			setDeleting(null);
		}
	};

	// 恢复备份
	const handleRestore = async (fileName: string) => {
		const confirmed = await confirmDialog.warning(
			`确定要从此备份恢复数据吗？\n\n文件名：${fileName}\n\n当前数据将被完全覆盖，请确保已做好备份。`,
			"恢复数据",
		);

		if (!confirmed) return;

		setRestoring(fileName);
		setRestoreProgress(0);
		setRestoreStage("downloading");

		try {
			const config = { ...webdavConfig, fileName };

			// 模拟进度更新（实际应该从后端获取）
			const progressInterval = setInterval(() => {
				setRestoreProgress((prev) => {
					if (prev >= 95) {
						clearInterval(progressInterval);
						return 95;
					}
					return prev + 5;
				});
			}, 200);

			await restoreFromWebdav(config);

			clearInterval(progressInterval);
			setRestoreProgress(100);
			setRestoreStage("completed");

			toast.success("数据恢复成功！应用将在 3 秒后重启", 3000);

			setTimeout(() => {
				onRestoreSuccess?.();
				onClose();
			}, 3000);
		} catch (error) {
			console.error("Failed to restore backup:", error);
			toast.error(
				"恢复失败：" + (error instanceof Error ? error.message : "未知错误"),
			);
			setRestoreProgress(0);
			setRestoreStage(undefined);
		} finally {
			setRestoring(null);
		}
	};

	// 初始化加载
	useEffect(() => {
		if (visible) {
			fetchBackupFiles();
		}
	}, [visible, fetchBackupFiles]);

	if (!visible) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
			<div className="w-full max-w-3xl bg-white dark:bg-gray-800 rounded-lg shadow-xl max-h-[80vh] flex flex-col animate-scale-in">
				{/* Header */}
				<div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
					<h2 className="text-lg font-semibold">WebDAV 备份管理</h2>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={fetchBackupFiles}
							disabled={loading}
							className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
							title="刷新列表"
						>
							<RefreshCw size={16} className={loading ? "animate-spin" : ""} />
						</button>
						<button
							type="button"
							onClick={onClose}
							className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
							title="关闭"
						>
							×
						</button>
					</div>
				</div>

				{/* Progress Bar (恢复时显示) */}
				{restoring && (
					<div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b dark:border-gray-700">
						<ProgressBar
							progress={restoreProgress}
							stage={restoreStage}
							showPercentage={true}
						/>
					</div>
				)}

				{/* Content */}
				<div className="flex-1 overflow-auto p-4">
					{loading && backupFiles.length === 0 ? (
						<div className="flex items-center justify-center h-32">
							<Loader2 className="animate-spin" size={24} />
						</div>
					) : backupFiles.length === 0 ? (
						<div className="text-center text-gray-500 py-12">
							<p className="text-lg mb-2">暂无备份文件</p>
							<p className="text-sm">请先在设置中配置并执行备份</p>
						</div>
					) : (
						<div className="space-y-2">
							{backupFiles.map((file) => (
								<div
									key={file.fileName}
									className="p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors flex items-center justify-between"
								>
									<div className="flex-1 min-w-0">
										<div className="font-medium truncate">{file.fileName}</div>
										<div className="text-sm text-gray-500">
											{new Date(file.modifiedTime).toLocaleString("zh-CN")} ·{" "}
											{formatFileSize(file.size)}
										</div>
									</div>
									<div className="flex items-center gap-2 ml-4">
										<button
											type="button"
											onClick={() => handleRestore(file.fileName)}
											disabled={!!restoring || !!deleting}
											className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
										>
											{restoring === file.fileName ? (
												<Loader2 size={14} className="animate-spin" />
											) : (
												<Download size={14} />
											)}
											恢复
										</button>
										<button
											type="button"
											onClick={() => handleDelete(file.fileName)}
											disabled={!!restoring || !!deleting}
											className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
										>
											{deleting === file.fileName ? (
												<Loader2 size={14} className="animate-spin" />
											) : (
												<Trash2 size={14} />
											)}
											删除
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
