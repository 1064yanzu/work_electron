/**
 * 同步备份 IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";

const now = () => Date.now();

interface SyncConfig {
	id: string;
	data_path?: string;
	webdav_enabled: boolean;
	webdav_url?: string;
	webdav_username?: string;
	webdav_password?: string;
	webdav_path: string;
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
}

interface BackupHistory {
	id: string;
	backup_type: string;
	backup_path?: string;
	file_size?: number;
	data_version?: string;
	is_compact: boolean;
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
				auto_backup_enabled: false,
				auto_backup_interval: 30,
				max_backup_count: 10,
				sync_on_startup: true,
				sync_on_change: true,
				compact_backup: false,
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

		if (updates.length > 0) {
			args.push("default");
			await db.client.execute({
				sql: `UPDATE sync_config SET ${updates.join(", ")} WHERE id = ?`,
				args,
			});
		}

		return getSyncConfig({} as IpcMainInvokeEvent, {});
	};

	const listBackupHistory = async (
		_event: IpcMainInvokeEvent,
		input: { limit?: number },
	): Promise<BackupHistory[]> => {
		const limit = input.limit ?? 20;
		const rows = await db.client.execute({
			sql: `SELECT * FROM backup_history ORDER BY created_at DESC LIMIT ?`,
			args: [limit],
		});
		return rows.rows.map((row) => ({
			id: row.id as string,
			backup_type: row.backup_type as string,
			backup_path: row.backup_path as string | undefined,
			file_size: row.file_size as number | undefined,
			data_version: row.data_version as string | undefined,
			is_compact: Boolean(row.is_compact),
			status: row.status as string,
			error_message: row.error_message as string | undefined,
			created_at: row.created_at as number,
		}));
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
			sql: `INSERT INTO backup_history (id, backup_type, backup_path, file_size, data_version, is_compact, status, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.backup_type,
				input.backup_path ?? null,
				input.file_size ?? null,
				input.data_version ?? null,
				(input.is_compact ?? false) ? 1 : 0,
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
			is_compact: input.is_compact ?? false,
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

	return {
		get_sync_config: getSyncConfig,
		update_sync_config: updateSyncConfig,
		list_backup_history: listBackupHistory,
		create_backup_record: createBackupRecord,
		clean_old_backups: cleanOldBackups,
	};
}
