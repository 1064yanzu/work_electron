/**
 * WebdavBackupListModal — WebDAV 备份文件管理弹窗
 *
 * 从原 `DataSettings.tsx` 的 inline JSX 抽出的独立组件，承担：
 *   - 表头 `文件名 / 修改时间 / 操作`
 *   - 加载态 / 空态
 *   - 单文件恢复 / 删除按钮
 *   - 底部刷新 / 关闭
 *
 * 所有 IO 操作通过 props 回调透传给调用方（`backup/index.tsx`）。
 */
import { RefreshCw, Trash2 } from "lucide-react";
import type { WebdavBackupFile } from "../../../../../lib/api";
import { Modal } from "../../../../ui/Modal";
import { SettingsButton } from "../../../ui/SettingsPrimitives";

interface WebdavBackupListModalProps {
	isOpen: boolean;
	onClose: () => void;
	backups: WebdavBackupFile[];
	isLoading: boolean;
	isRestoring: boolean;
	isDeletingFile: string | null;
	onRefresh: () => void;
	onRestore: (fileName: string) => void;
	onDelete: (fileName: string) => void;
}

export function WebdavBackupListModal({
	isOpen,
	onClose,
	backups,
	isLoading,
	isRestoring,
	isDeletingFile,
	onRefresh,
	onRestore,
	onDelete,
}: WebdavBackupListModalProps) {
	return (
		<Modal isOpen={isOpen} onClose={onClose} title="WebDAV 备份数据管理">
			<div className="space-y-4">
				<div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-text-light border-b border-border">
					<div className="col-span-5">文件名</div>
					<div className="col-span-4">修改时间</div>
					<div className="col-span-3 text-right">操作</div>
				</div>

				<div className="max-h-80 overflow-y-auto space-y-1">
					{isLoading ? (
						<div className="flex items-center justify-center py-8">
							<RefreshCw className="w-5 h-5 animate-spin text-text-light" />
						</div>
					) : backups.length === 0 ? (
						<div className="text-center py-8 text-sm text-text-light">
							暂无备份文件
						</div>
					) : (
						backups.map((backup) => (
							<div
								key={backup.fileName}
								className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 bg-warm-50 hover:bg-warm-200 rounded-lg transition-colors duration-150"
							>
								<div
									className="col-span-5 text-xs font-mono text-text-secondary truncate"
									title={backup.fileName}
								>
									{backup.fileName}
								</div>
								<div className="col-span-4 text-xs text-text-muted">
									{new Date(backup.modifiedTime).toLocaleString("zh-CN")}
								</div>
								<div className="col-span-3 flex items-center justify-end gap-2">
									<button
										type="button"
										onClick={() => onRestore(backup.fileName)}
										disabled={isRestoring}
										className="px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors duration-150 disabled:opacity-50"
									>
										{isRestoring ? "恢复中…" : "恢复"}
									</button>
									<button
										type="button"
										onClick={() => onDelete(backup.fileName)}
										disabled={isDeletingFile === backup.fileName}
										className="p-1 text-text-light hover:text-error hover:bg-[rgba(181,51,51,0.08)] rounded-lg transition-colors duration-150 disabled:opacity-50"
										title="删除备份"
									>
										{isDeletingFile === backup.fileName ? (
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
			</div>

			<div className="flex justify-between items-center mt-6 pt-4 border-t border-border">
				<SettingsButton icon={RefreshCw} variant="ghost" onClick={onRefresh}>
					刷新
				</SettingsButton>
				<SettingsButton variant="ghost" onClick={onClose}>
					关闭
				</SettingsButton>
			</div>
		</Modal>
	);
}
