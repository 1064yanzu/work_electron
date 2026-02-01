/**
 * 本地备份管理器弹窗组件
 * 显示本地备份文件列表，支持恢复和删除操作
 */
import { useCallback, useEffect, useState } from "react";
import {
    listLocalBackupFiles,
    deleteLocalBackupFile,
    restoreFromLocalFile,
    type LocalBackupFileInfo,
} from "../../../lib/api";
import { Modal } from "../../ui/Modal";
import {
    RefreshCw,
    Trash2,
    Download,
    AlertCircle,
} from "lucide-react";

interface LocalBackupManagerModalProps {
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

export function LocalBackupManagerModal({
    isOpen,
    onClose,
    backupDir,
    onRestoreSuccess,
}: LocalBackupManagerModalProps) {
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
        if (!confirm(`确定要删除备份文件 "${fileName}" 吗？此操作不可恢复。`)) {
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
            alert(`删除失败: ${err instanceof Error ? err.message : err}`);
        } finally {
            setIsDeleting(null);
        }
    };

    const handleBatchDelete = async () => {
        if (selectedFiles.size === 0) return;

        if (
            !confirm(`确定要删除选中的 ${selectedFiles.size} 个备份文件吗？此操作不可恢复。`)
        ) {
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
            alert(`批量删除失败: ${err instanceof Error ? err.message : err}`);
        } finally {
            setIsDeleting(null);
        }
    };

    const handleRestore = async (fileName: string) => {
        if (
            !confirm(
                `确定要从 "${fileName}" 恢复数据吗？当前数据将被覆盖，建议先备份当前数据。`,
            )
        ) {
            return;
        }

        setIsRestoring(fileName);
        try {
            await restoreFromLocalFile(backupDir, fileName);
            alert("恢复成功！应用将刷新以加载新数据。");
            onRestoreSuccess?.();
            onClose();
            window.location.reload();
        } catch (err) {
            alert(`恢复失败: ${err instanceof Error ? err.message : err}`);
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
                    <div className="text-sm text-zinc-500">
                        备份目录: <span className="font-mono text-xs">{backupDir}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={fetchBackupFiles}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-50"
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
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <Trash2 className="w-4 h-4" />
                                删除选中 ({selectedFiles.size})
                            </button>
                        )}
                    </div>
                </div>

                {/* 错误提示 */}
                {error && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-xl">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* 表头 */}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-zinc-400 border-b border-zinc-100">
                    <div className="col-span-1">
                        <input
                            type="checkbox"
                            checked={
                                backupFiles.length > 0 &&
                                selectedFiles.size === backupFiles.length
                            }
                            onChange={toggleSelectAll}
                            className="rounded"
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
                            <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
                        </div>
                    ) : backupFiles.length === 0 ? (
                        <div className="text-center py-8 text-sm text-zinc-400">
                            暂无备份文件
                        </div>
                    ) : (
                        backupFiles.map((backup) => (
                            <div
                                key={backup.fileName}
                                className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-lg transition-colors"
                            >
                                <div className="col-span-1">
                                    <input
                                        type="checkbox"
                                        checked={selectedFiles.has(backup.fileName)}
                                        onChange={() => toggleSelect(backup.fileName)}
                                        className="rounded"
                                    />
                                </div>
                                <div
                                    className="col-span-5 text-xs font-mono text-zinc-600 truncate"
                                    title={backup.fileName}
                                >
                                    {backup.fileName}
                                </div>
                                <div className="col-span-2 text-xs text-zinc-500">
                                    {formatFileSize(backup.size)}
                                </div>
                                <div className="col-span-2 text-xs text-zinc-500">
                                    {formatTime(backup.modifiedTime)}
                                </div>
                                <div className="col-span-2 flex items-center justify-end gap-1">
                                    <button
                                        type="button"
                                        onClick={() => handleRestore(backup.fileName)}
                                        disabled={isRestoring !== null || isDeleting !== null}
                                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
                                        title="恢复"
                                    >
                                        {isRestoring === backup.fileName ? (
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(backup.fileName)}
                                        disabled={isRestoring !== null || isDeleting !== null}
                                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
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
                <div className="flex justify-end pt-4 border-t border-zinc-100">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </Modal>
    );
}
