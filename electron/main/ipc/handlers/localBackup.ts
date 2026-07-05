/**
 * 本地备份 IPC Handlers
 * 提供本地备份目录的文件管理功能
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { dialog, type IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import {
	collectFullBackupPayload,
	importBackupPayload,
	type CollectBackupOptions,
} from "../../services/backupPayload";
import { stringifyBackupPayloadChunked } from "../../services/incrementalBackup";

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

/**
 * 列出目录下的备份文件（backup_*.json），按修改时间降序（最新在前）。
 * 目录不存在时返回空列表。IPC handler 与 pruneLocalBackups 共用。
 */
async function listBackupFilesInDir(dir: string): Promise<BackupFileInfo[]> {
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
				new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime(),
		);

		return backupFiles;
	} catch (error) {
		// 目录不存在或无法访问，返回空列表
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

/**
 * D6：按 sync_config.local_backup_max_count 修剪本地备份目录，删除最旧的超额备份。
 * 备份完成后调用 + dbMaintenance 24h tick 兜底。内部自吞异常，绝不抛出。
 */
export async function pruneLocalBackups(
	db: DbContext,
	logger?: Logger,
): Promise<{ deleted: number }> {
	try {
		const rows = await db.client.execute(
			`SELECT local_backup_dir, local_backup_max_count FROM sync_config WHERE id = 'default'`,
		);
		const dir = rows.rows[0]?.local_backup_dir as string | null | undefined;
		if (!dir) return { deleted: 0 };

		const rawMax = Number(rows.rows[0]?.local_backup_max_count ?? 10);
		const maxCount =
			Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 10;

		const files = await listBackupFilesInDir(dir);
		if (files.length <= maxCount) return { deleted: 0 };

		let deleted = 0;
		for (const file of files.slice(maxCount)) {
			try {
				await fs.unlink(path.join(dir, file.fileName));
				deleted++;
			} catch (err) {
				logger?.warn({
					msg: "Local backup prune: delete file failed",
					file: file.fileName,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		if (deleted > 0) {
			logger?.info({
				msg: "Local backup pruned",
				deleted,
				max_count: maxCount,
			});
		}
		return { deleted };
	} catch (err) {
		logger?.warn({
			msg: "Local backup prune failed",
			error: err instanceof Error ? err.message : String(err),
		});
		return { deleted: 0 };
	}
}

export function createLocalBackupHandlers(db: DbContext) {
	/**
	 * 列出指定目录下的备份文件
	 */
	const listLocalBackupFiles = async (
		_event: IpcMainInvokeEvent,
		input: { dir: string },
	): Promise<BackupFileInfo[]> => {
		return listBackupFilesInDir(input.dir);
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

		// 导出所有数据（D9：紧凑 JSON + 分块序列化，避免 pretty-print 体积翻倍与长时间同步阻塞）
		const exportData = await exportAllDataForBackup(db);
		const jsonData = await stringifyBackupPayloadChunked(exportData);

		// 写入文件
		await fs.writeFile(backupPath, jsonData, "utf-8");

		const stat = await fs.stat(backupPath);

		// D6：备份完成后按 local_backup_max_count 修剪旧备份（内部自吞异常）
		await pruneLocalBackups(db);

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
): Promise<Record<string, unknown>> {
	return await collectFullBackupPayload(db, options);
}
