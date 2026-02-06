/**
 * 备份历史管理器
 * 负责记录备份历史、自动清理旧备份
 */
import { randomUUID } from "node:crypto";
import { getDbContext } from "../db/client";
import type { WebDavConfig } from "./WebDavService";
import { WebDavService } from "./WebDavService";
import { extractDeviceIdFromFileName } from "../utils/deviceId";

export interface BackupHistoryRecord {
	id: string;
	backup_type: "webdav" | "local" | "manual";
	backup_path?: string;
	file_name?: string;
	file_size?: number;
	data_version?: string;
	device_id?: string;
	device_name?: string;
	is_encrypted: boolean;
	is_compact: boolean;
	is_incremental: boolean;
	status: "success" | "failed" | "in_progress";
	error_message?: string;
	created_at: number;
}

export class BackupHistoryManager {
	/**
	 * 记录备份历史
	 */
	async recordBackup(
		record: Omit<BackupHistoryRecord, "id" | "created_at">,
	): Promise<string> {
		const db = getDbContext();
		const id = randomUUID();
		const created_at = Date.now();

		await db.client.execute({
			sql: `
				INSERT INTO backup_history (
					id, backup_type, backup_path, file_name, file_size,
					data_version, device_id, device_name, is_encrypted,
					is_compact, is_incremental, status, error_message, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
			args: [
				id,
				record.backup_type,
				record.backup_path || null,
				record.file_name || null,
				record.file_size || null,
				record.data_version || null,
				record.device_id || null,
				record.device_name || null,
				record.is_encrypted ? 1 : 0,
				record.is_compact ? 1 : 0,
				record.is_incremental ? 1 : 0,
				record.status,
				record.error_message || null,
				created_at,
			],
		});

		console.log(
			`[BackupHistoryManager] Recorded backup: ${id} (${record.backup_type})`,
		);
		return id;
	}

	/**
	 * 更新备份状态
	 */
	async updateBackupStatus(
		id: string,
		status: "success" | "failed",
		errorMessage?: string,
	): Promise<void> {
		const db = getDbContext();
		await db.client.execute({
			sql: `UPDATE backup_history SET status = ?, error_message = ? WHERE id = ?`,
			args: [status, errorMessage || null, id],
		});

		console.log(
			`[BackupHistoryManager] Updated backup ${id} status: ${status}`,
		);
	}

	/**
	 * 获取备份历史（按设备分组）
	 */
	async getBackupHistory(limit = 50): Promise<BackupHistoryRecord[]> {
		const db = getDbContext();
		const result = await db.client.execute({
			sql: `
				SELECT * FROM backup_history
				ORDER BY created_at DESC
				LIMIT ?
			`,
			args: [limit],
		});

		return result.rows.map((row: any) => ({
			id: row.id as string,
			backup_type: row.backup_type as "webdav" | "local" | "manual",
			backup_path: row.backup_path as string | undefined,
			file_name: row.file_name as string | undefined,
			file_size: row.file_size as number | undefined,
			data_version: row.data_version as string | undefined,
			device_id: row.device_id as string | undefined,
			device_name: row.device_name as string | undefined,
			is_encrypted: Boolean(row.is_encrypted),
			is_compact: Boolean(row.is_compact),
			is_incremental: Boolean(row.is_incremental),
			status: row.status as "success" | "failed" | "in_progress",
			error_message: row.error_message as string | undefined,
			created_at: Number(row.created_at),
		}));
	}

	/**
	 * 获取指定设备的备份历史
	 */
	async getDeviceBackupHistory(
		deviceId: string,
		limit = 20,
	): Promise<BackupHistoryRecord[]> {
		const db = getDbContext();
		const result = await db.client.execute({
			sql: `
				SELECT * FROM backup_history
				WHERE device_id = ? AND status = 'success'
				ORDER BY created_at DESC
				LIMIT ?
			`,
			args: [deviceId, limit],
		});

		return result.rows.map((row: any) => ({
			id: row.id as string,
			backup_type: row.backup_type as "webdav" | "local" | "manual",
			backup_path: row.backup_path as string | undefined,
			file_name: row.file_name as string | undefined,
			file_size: row.file_size as number | undefined,
			data_version: row.data_version as string | undefined,
			device_id: row.device_id as string | undefined,
			device_name: row.device_name as string | undefined,
			is_encrypted: Boolean(row.is_encrypted),
			is_compact: Boolean(row.is_compact),
			is_incremental: Boolean(row.is_incremental),
			status: row.status as "success" | "failed" | "in_progress",
			error_message: row.error_message as string | undefined,
			created_at: Number(row.created_at),
		}));
	}

	/**
	 * 自动清理旧备份（WebDAV）
	 * @param webdavConfig WebDAV 配置
	 * @param maxBackups 每个设备保留的最大备份数（0 表示无限制）
	 */
	async cleanupOldWebdavBackups(
		webdavConfig: WebDavConfig,
		maxBackups: number,
	): Promise<number> {
		if (maxBackups <= 0) {
			console.log("[BackupHistoryManager] Cleanup disabled (maxBackups = 0)");
			return 0;
		}

		try {
			const webdavService = new WebDavService(webdavConfig);
			const response = await webdavService.getDirectoryContents();
			const files = Array.isArray(response) ? response : (response as any).data;

			// 按设备分组
			const filesByDevice = new Map<string, any[]>();
			for (const file of files) {
				if (file.type === "file" && file.basename.endsWith(".zip")) {
					const deviceId =
						extractDeviceIdFromFileName(file.basename) || "unknown";
					if (!filesByDevice.has(deviceId)) {
						filesByDevice.set(deviceId, []);
					}
					filesByDevice.get(deviceId)!.push(file);
				}
			}

			let deletedCount = 0;

			// 对每个设备的备份进行清理
			for (const [deviceId, deviceFiles] of filesByDevice.entries()) {
				// 按修改时间排序（最新的在前）
				deviceFiles.sort(
					(a, b) =>
						new Date(b.lastmod).getTime() - new Date(a.lastmod).getTime(),
				);

				// 删除超出限制的备份
				const filesToDelete = deviceFiles.slice(maxBackups);
				for (const file of filesToDelete) {
					try {
						await webdavService.deleteFile(file.basename);
						deletedCount++;
						console.log(
							`[BackupHistoryManager] Deleted old backup: ${file.basename} (device: ${deviceId})`,
						);
					} catch (error) {
						console.error(
							`[BackupHistoryManager] Failed to delete ${file.basename}:`,
							error,
						);
					}
				}
			}

			console.log(
				`[BackupHistoryManager] Cleanup completed: deleted ${deletedCount} old backups`,
			);
			return deletedCount;
		} catch (error) {
			console.error("[BackupHistoryManager] Cleanup failed:", error);
			throw error;
		}
	}

	/**
	 * 自动清理本地旧备份
	 * @param backupDir 本地备份目录
	 * @param maxBackups 保留的最大备份数
	 */
	async cleanupOldLocalBackups(
		backupDir: string,
		maxBackups: number,
	): Promise<number> {
		if (maxBackups <= 0) {
			console.log(
				"[BackupHistoryManager] Local cleanup disabled (maxBackups = 0)",
			);
			return 0;
		}

		try {
			const fs = await import("fs-extra");
			const path = await import("node:path");

			// 检查目录是否存在
			if (!(await fs.pathExists(backupDir))) {
				console.log(
					`[BackupHistoryManager] Backup directory does not exist: ${backupDir}`,
				);
				return 0;
			}

			// 获取所有备份文件
			const files = await fs.readdir(backupDir);
			const backupFiles = files.filter((file) => file.endsWith(".zip"));

			// 获取文件信息并排序
			const fileStats = await Promise.all(
				backupFiles.map(async (file) => {
					const filePath = path.join(backupDir, file);
					const stats = await fs.stat(filePath);
					return { file, mtime: stats.mtime, path: filePath };
				}),
			);

			// 按修改时间排序（最新的在前）
			fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

			// 删除超出限制的备份
			const filesToDelete = fileStats.slice(maxBackups);
			let deletedCount = 0;

			for (const fileInfo of filesToDelete) {
				try {
					await fs.remove(fileInfo.path);
					deletedCount++;
					console.log(
						`[BackupHistoryManager] Deleted old local backup: ${fileInfo.file}`,
					);
				} catch (error) {
					console.error(
						`[BackupHistoryManager] Failed to delete ${fileInfo.file}:`,
						error,
					);
				}
			}

			console.log(
				`[BackupHistoryManager] Local cleanup completed: deleted ${deletedCount} old backups`,
			);
			return deletedCount;
		} catch (error) {
			console.error("[BackupHistoryManager] Local cleanup failed:", error);
			throw error;
		}
	}

	/**
	 * 清理数据库中的备份历史记录
	 * @param keepDays 保留最近 N 天的记录
	 */
	async cleanupBackupHistory(keepDays = 30): Promise<number> {
		const db = getDbContext();
		const cutoffTime = Date.now() - keepDays * 24 * 60 * 60 * 1000;

		const result = await db.client.execute({
			sql: `DELETE FROM backup_history WHERE created_at < ? AND status != 'in_progress'`,
			args: [cutoffTime],
		});

		const deletedCount = result.rowsAffected || 0;
		console.log(
			`[BackupHistoryManager] Cleaned up ${deletedCount} old history records (older than ${keepDays} days)`,
		);
		return deletedCount;
	}
}

// 导出单例
export const backupHistoryManager = new BackupHistoryManager();
