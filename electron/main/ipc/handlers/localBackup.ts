/**
 * 本地备份 IPC Handlers
 * 提供本地备份目录的文件管理功能
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { dialog, type IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";
import {
	collectFullBackupPayload,
	importBackupPayload,
	type CollectBackupOptions,
} from "../../services/backupPayload";

interface BackupFileInfo {
	fileName: string;
	modifiedTime: string;
	size: number;
}

/**
 * 生成备份文件名
 */
function generateBackupFileName(): string {
	const now = new Date();
	const timestamp = now
		.toISOString()
		.replace(/[-:T.Z]/g, "")
		.slice(0, 14);
	return `backup_${timestamp}.json`;
}

export function createLocalBackupHandlers(db: DbContext) {
	/**
	 * 列出指定目录下的备份文件
	 */
	const listLocalBackupFiles = async (
		_event: IpcMainInvokeEvent,
		input: { dir: string },
	): Promise<BackupFileInfo[]> => {
		const { dir } = input;

		try {
			// 检查目录是否存在
			await fs.access(dir);

			const files = await fs.readdir(dir);
			const backupFiles: BackupFileInfo[] = [];

			for (const file of files) {
				// 只列出 .json 备份文件
				if (!file.endsWith(".json") || !file.startsWith("backup_")) {
					continue;
				}

				const filePath = path.join(dir, file);
				const stat = await fs.stat(filePath);

				if (stat.isFile()) {
					backupFiles.push({
						fileName: file,
						modifiedTime: stat.mtime.toISOString(),
						size: stat.size,
					});
				}
			}

			// 按修改时间降序排序（最新的在前）
			backupFiles.sort(
				(a, b) =>
					new Date(b.modifiedTime).getTime() -
					new Date(a.modifiedTime).getTime(),
			);

			return backupFiles;
		} catch (error) {
			// 目录不存在或无法访问，返回空列表
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return [];
			}
			throw error;
		}
	};

	/**
	 * 删除指定备份文件
	 */
	const deleteLocalBackupFile = async (
		_event: IpcMainInvokeEvent,
		input: { dir: string; fileName: string },
	): Promise<{ success: boolean }> => {
		const { dir, fileName } = input;

		// 安全检查：确保文件名不包含路径分隔符
		if (fileName.includes("/") || fileName.includes("\\")) {
			throw new Error("非法文件名");
		}

		const filePath = path.join(dir, fileName);
		await fs.unlink(filePath);

		return { success: true };
	};

	/**
	 * 备份数据到指定本地目录
	 */
	const backupToLocalDir = async (
		_event: IpcMainInvokeEvent,
		input: { dir: string; fileName?: string },
	): Promise<{ path: string; size: number }> => {
		const { dir, fileName } = input;
		const backupFileName = fileName || generateBackupFileName();
		const backupPath = path.join(dir, backupFileName);

		// 确保目录存在
		await fs.mkdir(dir, { recursive: true });

		// 导出所有数据
		const exportData = await exportAllDataForBackup(db);
		const jsonData = JSON.stringify(exportData, null, 2);

		// 写入文件
		await fs.writeFile(backupPath, jsonData, "utf-8");

		const stat = await fs.stat(backupPath);

		return { path: backupPath, size: stat.size };
	};

	/**
	 * 从本地备份文件恢复
	 */
	const restoreFromLocalFile = async (
		_event: IpcMainInvokeEvent,
		input: { dir: string; fileName: string },
	): Promise<{ success: boolean }> => {
		const { dir, fileName } = input;

		// 安全检查
		if (fileName.includes("/") || fileName.includes("\\")) {
			throw new Error("非法文件名");
		}

		const filePath = path.join(dir, fileName);
		const jsonData = await fs.readFile(filePath, "utf-8");
		const data = JSON.parse(jsonData);
		await importBackupPayload(
			db,
			data,
			{ overwrite: true, clearAllFirst: true },
			console,
		);

		return { success: true };
	};

	/**
	 * 选择本地备份目录
	 */
	const selectBackupDirectory = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<{ path: string | null }> => {
		const result = await dialog.showOpenDialog({
			title: "选择备份目录",
			properties: ["openDirectory", "createDirectory"],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return { path: null };
		}

		return { path: result.filePaths[0] };
	};

	return {
		list_local_backup_files: listLocalBackupFiles,
		delete_local_backup_file: deleteLocalBackupFile,
		backup_to_local_dir: backupToLocalDir,
		restore_from_local_file: restoreFromLocalFile,
		select_backup_directory: selectBackupDirectory,
	};
}

/**
 * 导出所有数据用于备份
 */
export async function exportAllDataForBackup(
	db: DbContext,
	options?: CollectBackupOptions,
): Promise<object> {
	return await collectFullBackupPayload(db, options);
}
