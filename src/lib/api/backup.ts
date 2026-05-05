import { safeInvoke } from "../tauriBridge";

export interface BackupHistory {
	id: string;
	backup_type: string;
	backup_path: string | null;
	file_size: number | null;
	data_version: string | null;
	is_compact: boolean;
	status: string;
	error_message: string | null;
	created_at: string;
}

export interface LocalBackupFileInfo {
	fileName: string;
	modifiedTime: string;
	size: number;
}

/** 列出本地备份文件 */
export async function listLocalBackupFiles(
	dir: string,
): Promise<LocalBackupFileInfo[]> {
	return await safeInvoke("list_local_backup_files", { dir });
}

/** 删除本地备份文件 */
export async function deleteLocalBackupFile(
	dir: string,
	fileName: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("delete_local_backup_file", { dir, fileName });
}

/** 备份到本地目录 */
export async function backupToLocalDir(
	dir: string,
	fileName?: string,
): Promise<{ path: string; size: number }> {
	return await safeInvoke("backup_to_local_dir", { dir, fileName });
}

/** 从本地备份恢复 */
export async function restoreFromLocalFile(
	dir: string,
	fileName: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("restore_from_local_file", { dir, fileName });
}

/** 选择本地备份目录 */
export async function selectBackupDirectory(): Promise<{
	path: string | null;
}> {
	return await safeInvoke("select_backup_directory");
}

export async function listBackupHistory(
	limit?: number,
): Promise<BackupHistory[]> {
	return await safeInvoke("list_backup_history", { limit });
}

export async function backupToLocal(targetPath?: string): Promise<string> {
	return await safeInvoke("backup_to_local", { targetPath });
}

export async function restoreFromLocal(filePath: string): Promise<void> {
	return await safeInvoke("restore_from_local", { filePath });
}
