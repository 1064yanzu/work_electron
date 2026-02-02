/**
 * 同步备份 IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";
import { backupManager } from "../../services/BackupManager";
import { autoSyncScheduler } from "../../services/AutoSyncScheduler";
import { backupHistoryManager } from "../../services/BackupHistoryManager";
import type { WebDavConfig } from "../../services/WebDavService";

const now = () => Date.now();

interface SyncConfig {
	id: string;
	data_path?: string;
	webdav_enabled: boolean;
	webdav_url?: string;
	webdav_username?: string;
	webdav_password?: string;
	webdav_path: string;
	// WebDAV 高级配置
	webdav_auto_sync: boolean;
	webdav_sync_interval: number;
	webdav_max_backups: number;
	webdav_skip_backup_file: boolean;
	webdav_disable_stream: boolean;
	webdav_last_sync_at?: number;
	webdav_last_sync_error?: string;
	// 通用备份配置
	auto_backup_enabled: boolean;
	auto_backup_interval: number;
	max_backup_count: number;
	sync_on_startup: boolean;
	sync_on_change: boolean;
	compact_backup: boolean;
	last_backup_at?: number;
	last_sync_at?: number;
	last_sync_status?: string;
	last_sync_error?: string;
	// 本地备份目录配置
	local_backup_dir?: string;
	local_backup_auto_sync: boolean;
	local_backup_interval: number;
	local_backup_max_count: number;
	local_backup_last_sync_at?: number;
}

interface BackupHistory {
	id: string;
	backup_type: string;
	backup_path?: string;
	file_name?: string;
	file_size?: number;
	data_version?: string;
	device_id?: string;
	device_name?: string;
	is_encrypted: boolean;
	is_compact: boolean;
	is_incremental: boolean;
	status: string;
	error_message?: string;
	created_at: number;
}

export function createSyncHandlers(db: DbContext) {
	const getSyncConfig = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<SyncConfig> => {
		const rows = await db.client.execute(
			`SELECT * FROM sync_config WHERE id = 'default'`,
		);
		if (rows.rows.length === 0) {
			// 返回默认配置
			return {
				id: "default",
				webdav_enabled: false,
				webdav_path: "/workbench-sync",
				// WebDAV 高级配置默认值
				webdav_auto_sync: false,
				webdav_sync_interval: 0,
				webdav_max_backups: 0,
				webdav_skip_backup_file: false,
				webdav_disable_stream: false,
				// 通用备份默认配置
				auto_backup_enabled: false,
				auto_backup_interval: 30,
				max_backup_count: 10,
				sync_on_startup: true,
				sync_on_change: true,
				compact_backup: false,
				// 本地备份默认配置
				local_backup_auto_sync: false,
				local_backup_interval: 60,
				local_backup_max_count: 10,
			};
		}
		const row = rows.rows[0];
		return {
			id: row.id as string,
			data_path: row.data_path as string | undefined,
			webdav_enabled: Boolean(row.webdav_enabled),
			webdav_url: row.webdav_url as string | undefined,
			webdav_username: row.webdav_username as string | undefined,
			webdav_password: row.webdav_password as string | undefined,
			webdav_path: (row.webdav_path as string) || "/workbench-sync",
			// WebDAV 高级配置
			webdav_auto_sync: Boolean(row.webdav_auto_sync),
			webdav_sync_interval: (row.webdav_sync_interval as number) || 0,
			webdav_max_backups: (row.webdav_max_backups as number) || 0,
			webdav_skip_backup_file: Boolean(row.webdav_skip_backup_file),
			webdav_disable_stream: Boolean(row.webdav_disable_stream),
			webdav_last_sync_at: row.webdav_last_sync_at as number | undefined,
			webdav_last_sync_error: row.webdav_last_sync_error as string | undefined,
			// 通用备份配置
			auto_backup_enabled: Boolean(row.auto_backup_enabled),
			auto_backup_interval: (row.auto_backup_interval as number) || 30,
			max_backup_count: (row.max_backup_count as number) || 10,
			sync_on_startup: row.sync_on_startup !== 0,
			sync_on_change: row.sync_on_change !== 0,
			compact_backup: Boolean(row.compact_backup),
			last_backup_at: row.last_backup_at as number | undefined,
			last_sync_at: row.last_sync_at as number | undefined,
			last_sync_status: row.last_sync_status as string | undefined,
			last_sync_error: row.last_sync_error as string | undefined,
			// 本地备份字段
			local_backup_dir: row.local_backup_dir as string | undefined,
			local_backup_auto_sync: Boolean(row.local_backup_auto_sync),
			local_backup_interval: (row.local_backup_interval as number) || 60,
			local_backup_max_count: (row.local_backup_max_count as number) || 10,
			local_backup_last_sync_at: row.local_backup_last_sync_at as number | undefined,
		};
	};

	const updateSyncConfig = async (
		_event: IpcMainInvokeEvent,
		input: Partial<Omit<SyncConfig, "id">>,
	): Promise<SyncConfig> => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.data_path !== undefined) {
			updates.push("data_path = ?");
			args.push(input.data_path ?? null);
		}
		if (input.webdav_enabled !== undefined) {
			updates.push("webdav_enabled = ?");
			args.push(input.webdav_enabled ? 1 : 0);
		}
		if (input.webdav_url !== undefined) {
			updates.push("webdav_url = ?");
			args.push(input.webdav_url ?? null);
		}
		if (input.webdav_username !== undefined) {
			updates.push("webdav_username = ?");
			args.push(input.webdav_username ?? null);
		}
		if (input.webdav_password !== undefined) {
			updates.push("webdav_password = ?");
			args.push(input.webdav_password ?? null);
		}
		if (input.webdav_path !== undefined) {
			updates.push("webdav_path = ?");
			args.push(input.webdav_path);
		}
		// WebDAV 高级配置
		if (input.webdav_auto_sync !== undefined) {
			updates.push("webdav_auto_sync = ?");
			args.push(input.webdav_auto_sync ? 1 : 0);
		}
		if (input.webdav_sync_interval !== undefined) {
			updates.push("webdav_sync_interval = ?");
			args.push(input.webdav_sync_interval);
		}
		if (input.webdav_max_backups !== undefined) {
			updates.push("webdav_max_backups = ?");
			args.push(input.webdav_max_backups);
		}
		if (input.webdav_skip_backup_file !== undefined) {
			updates.push("webdav_skip_backup_file = ?");
			args.push(input.webdav_skip_backup_file ? 1 : 0);
		}
		if (input.webdav_disable_stream !== undefined) {
			updates.push("webdav_disable_stream = ?");
			args.push(input.webdav_disable_stream ? 1 : 0);
		}
		if (input.webdav_last_sync_at !== undefined) {
			updates.push("webdav_last_sync_at = ?");
			args.push(input.webdav_last_sync_at);
		}
		if (input.webdav_last_sync_error !== undefined) {
			updates.push("webdav_last_sync_error = ?");
			args.push(input.webdav_last_sync_error ?? null);
		}
		// 通用备份配置
		if (input.auto_backup_enabled !== undefined) {
			updates.push("auto_backup_enabled = ?");
			args.push(input.auto_backup_enabled ? 1 : 0);
		}
		if (input.auto_backup_interval !== undefined) {
			updates.push("auto_backup_interval = ?");
			args.push(input.auto_backup_interval);
		}
		if (input.max_backup_count !== undefined) {
			updates.push("max_backup_count = ?");
			args.push(input.max_backup_count);
		}
		if (input.sync_on_startup !== undefined) {
			updates.push("sync_on_startup = ?");
			args.push(input.sync_on_startup ? 1 : 0);
		}
		if (input.sync_on_change !== undefined) {
			updates.push("sync_on_change = ?");
			args.push(input.sync_on_change ? 1 : 0);
		}
		if (input.compact_backup !== undefined) {
			updates.push("compact_backup = ?");
			args.push(input.compact_backup ? 1 : 0);
		}
		if (input.last_backup_at !== undefined) {
			updates.push("last_backup_at = ?");
			args.push(input.last_backup_at);
		}
		if (input.last_sync_at !== undefined) {
			updates.push("last_sync_at = ?");
			args.push(input.last_sync_at);
		}
		if (input.last_sync_status !== undefined) {
			updates.push("last_sync_status = ?");
			args.push(input.last_sync_status);
		}
		if (input.last_sync_error !== undefined) {
			updates.push("last_sync_error = ?");
			args.push(input.last_sync_error ?? null);
		}
		// 本地备份配置字段
		if (input.local_backup_dir !== undefined) {
			updates.push("local_backup_dir = ?");
			args.push(input.local_backup_dir ?? null);
		}
		if (input.local_backup_auto_sync !== undefined) {
			updates.push("local_backup_auto_sync = ?");
			args.push(input.local_backup_auto_sync ? 1 : 0);
		}
		if (input.local_backup_interval !== undefined) {
			updates.push("local_backup_interval = ?");
			args.push(input.local_backup_interval);
		}
		if (input.local_backup_max_count !== undefined) {
			updates.push("local_backup_max_count = ?");
			args.push(input.local_backup_max_count);
		}
		if (input.local_backup_last_sync_at !== undefined) {
			updates.push("local_backup_last_sync_at = ?");
			args.push(input.local_backup_last_sync_at);
		}

		if (updates.length > 0) {
			args.push("default");
			await db.client.execute({
				sql: `UPDATE sync_config SET ${updates.join(", ")} WHERE id = ?`,
				args,
			});

			// 重启自动同步调度器以应用新配置
			try {
				await autoSyncScheduler.restart();
				console.log("[SyncHandler] AutoSyncScheduler restarted after config update");
			} catch (error) {
				console.error("[SyncHandler] Failed to restart AutoSyncScheduler:", error);
			}
		}

		return getSyncConfig({} as IpcMainInvokeEvent, {});
	};

	const listBackupHistory = async (
		_event: IpcMainInvokeEvent,
		input: { limit?: number },
	): Promise<BackupHistory[]> => {
		const limit = input.limit ?? 50;
		return await backupHistoryManager.getBackupHistory(limit);
	};

	const createBackupRecord = async (
		_event: IpcMainInvokeEvent,
		input: {
			backup_type: string;
			backup_path?: string;
			file_size?: number;
			data_version?: string;
			is_compact?: boolean;
			status: string;
			error_message?: string;
		},
	): Promise<BackupHistory> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO backup_history (id, backup_type, backup_path, file_name, file_size, data_version,
				device_id, device_name, is_encrypted, is_compact, is_incremental, status, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.backup_type,
				input.backup_path ?? null,
				null, // file_name
				input.file_size ?? null,
				input.data_version ?? null,
				null, // device_id
				null, // device_name
				0, // is_encrypted
				(input.is_compact ?? false) ? 1 : 0,
				0, // is_incremental
				input.status,
				input.error_message ?? null,
				timestamp,
			],
		});

		// 更新最后备份时间
		await db.client.execute({
			sql: `UPDATE sync_config SET last_backup_at = ? WHERE id = 'default'`,
			args: [timestamp],
		});

		return {
			id,
			backup_type: input.backup_type,
			backup_path: input.backup_path,
			file_size: input.file_size,
			data_version: input.data_version,
			is_encrypted: false,
			is_compact: input.is_compact ?? false,
			is_incremental: false,
			status: input.status,
			error_message: input.error_message,
			created_at: timestamp,
		};
	};

	const cleanOldBackups = async (
		_event: IpcMainInvokeEvent,
		input: { max_count?: number },
	): Promise<{ deleted_count: number }> => {
		const maxCount = input.max_count ?? 10;

		// 获取应该删除的记录数
		const countRows = await db.client.execute(
			`SELECT COUNT(*) as count FROM backup_history`,
		);
		const totalCount = (countRows.rows[0]?.count as number) || 0;

		if (totalCount <= maxCount) {
			return { deleted_count: 0 };
		}

		const deleteCount = totalCount - maxCount;

		// 删除最旧的记录
		await db.client.execute({
			sql: `DELETE FROM backup_history WHERE id IN (
            SELECT id FROM backup_history ORDER BY created_at ASC LIMIT ?
          )`,
			args: [deleteCount],
		});

		return { deleted_count: deleteCount };
	};

	// WebDAV 备份操作
	const backupToWebdav = async (
		event: IpcMainInvokeEvent,
		input: { data: string; config: WebDavConfig },
	): Promise<any> => {
		return await backupManager.backupToWebdav(event, input.data, input.config);
	};

	const restoreFromWebdav = async (
		event: IpcMainInvokeEvent,
		input: { config: WebDavConfig },
	): Promise<string> => {
		return await backupManager.restoreFromWebdav(event, input.config);
	};

	const listWebdavBackups = async (
		event: IpcMainInvokeEvent,
		input: { config: WebDavConfig },
	): Promise<Array<{ fileName: string; modifiedTime: string; size: number }>> => {
		return await backupManager.listWebdavFiles(event, input.config);
	};

	const deleteWebdavBackup = async (
		event: IpcMainInvokeEvent,
		input: { fileName: string; config: WebDavConfig },
	): Promise<any> => {
		return await backupManager.deleteWebdavFile(
			event,
			input.fileName,
			input.config,
		);
	};

	const testWebdavConnection = async (
		event: IpcMainInvokeEvent,
		input: { config: WebDavConfig },
	): Promise<boolean> => {
		return await backupManager.checkConnection(event, input.config);
	};

	// 获取指定设备的备份历史
	const getDeviceBackupHistory = async (
		_event: IpcMainInvokeEvent,
		input: { deviceId: string; limit?: number },
	): Promise<BackupHistory[]> => {
		const limit = input.limit ?? 20;
		return await backupHistoryManager.getDeviceBackupHistory(input.deviceId, limit);
	};

	// 清理 WebDAV 旧备份
	const cleanupWebdavBackups = async (
		_event: IpcMainInvokeEvent,
		input: { config: WebDavConfig; maxBackups: number },
	): Promise<{ deleted_count: number }> => {
		const deletedCount = await backupHistoryManager.cleanupOldWebdavBackups(
			input.config,
			input.maxBackups,
		);
		return { deleted_count: deletedCount };
	};

	return {
		get_sync_config: getSyncConfig,
		update_sync_config: updateSyncConfig,
		list_backup_history: listBackupHistory,
		get_device_backup_history: getDeviceBackupHistory,
		create_backup_record: createBackupRecord,
		clean_old_backups: cleanOldBackups,
		cleanup_webdav_backups: cleanupWebdavBackups,
		// WebDAV 操作
		backup_to_webdav: backupToWebdav,
		restore_from_webdav: restoreFromWebdav,
		list_webdav_backups: listWebdavBackups,
		delete_webdav_backup: deleteWebdavBackup,
		test_webdav_connection: testWebdavConnection,
	};
}
