/**
 * WebDAV 自动同步调度器
 * 实现后台定时备份、启动时同步、变更时同步等功能
 */
import { powerMonitor } from "electron";
import { BackupManager } from "./BackupManager";
import type { WebDavConfig } from "./WebDavService";
import { getDbContext } from "../db/client";
import {
	generateBackupFileName,
	generateDeviceId,
	getDeviceName,
} from "../utils/deviceId";
import { backupHistoryManager } from "./BackupHistoryManager";
import { exportAllDataForBackup } from "../ipc/handlers/localBackup";

interface SyncConfig {
	webdav_enabled: boolean;
	webdav_auto_sync: boolean;
	webdav_sync_interval: number; // 分钟
	webdav_max_backups: number;
	webdav_url: string | null;
	webdav_username: string | null;
	webdav_password: string | null;
	webdav_path: string;
	webdav_skip_backup_file: boolean;
	webdav_disable_stream: boolean;
	sync_on_startup: boolean;
	sync_on_change: boolean;
}

export class AutoSyncScheduler {
	private backupManager: BackupManager;
	private syncTimer: NodeJS.Timeout | null = null;
	private changeDebounceTimer: NodeJS.Timeout | null = null;
	private isRunning = false;
	private isSyncing = false;
	private lastSyncTime = 0;
	private retryCount = 0;
	private readonly MAX_RETRIES = 3;
	private readonly DEBOUNCE_DELAY = 30000; // 30 秒防抖
	private readonly MIN_SYNC_INTERVAL = 60000; // 最小同步间隔 1 分钟

	constructor() {
		this.backupManager = new BackupManager();
		console.log("[AutoSyncScheduler] Initialized");
	}

	/**
	 * 启动自动同步调度器
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			console.log("[AutoSyncScheduler] Already running");
			return;
		}

		this.isRunning = true;
		console.log("[AutoSyncScheduler] Starting...");

		try {
			// 确保设备 ID 已生成
			await this.ensureDeviceId();

			const config = await this.getSyncConfig();

			// 启动时同步
			if (
				config.sync_on_startup &&
				config.webdav_enabled &&
				config.webdav_auto_sync
			) {
				console.log("[AutoSyncScheduler] Sync on startup enabled");
				// 延迟 5 秒执行，避免应用启动时过载
				setTimeout(() => {
					this.performSync("startup").catch(console.error);
				}, 5000);
			}

			// 启动定时同步
			await this.scheduleSync();

			console.log("[AutoSyncScheduler] Started successfully");
		} catch (error) {
			console.error("[AutoSyncScheduler] Failed to start:", error);
			this.isRunning = false;
		}
	}

	/**
	 * 停止自动同步调度器
	 */
	stop(): void {
		if (!this.isRunning) {
			return;
		}

		console.log("[AutoSyncScheduler] Stopping...");

		if (this.syncTimer) {
			clearInterval(this.syncTimer);
			this.syncTimer = null;
		}

		if (this.changeDebounceTimer) {
			clearTimeout(this.changeDebounceTimer);
			this.changeDebounceTimer = null;
		}

		this.isRunning = false;
		console.log("[AutoSyncScheduler] Stopped");
	}

	/**
	 * 重启调度器（配置变更时调用）
	 */
	async restart(): Promise<void> {
		console.log("[AutoSyncScheduler] Restarting...");
		this.stop();
		await this.start();
	}

	/**
	 * 数据变更时触发同步（防抖）
	 */
	async onDataChange(): Promise<void> {
		const config = await this.getSyncConfig();

		if (
			!config.sync_on_change ||
			!config.webdav_enabled ||
			!config.webdav_auto_sync
		) {
			return;
		}

		// 清除现有的防抖定时器
		if (this.changeDebounceTimer) {
			clearTimeout(this.changeDebounceTimer);
		}

		// 设置新的防抖定时器
		this.changeDebounceTimer = setTimeout(() => {
			this.performSync("change").catch(console.error);
		}, this.DEBOUNCE_DELAY);

		console.log(
			"[AutoSyncScheduler] Data change detected, sync scheduled in 30s",
		);
	}

	/**
	 * 立即执行一次同步
	 */
	async syncNow(): Promise<void> {
		await this.performSync("manual");
	}

	/**
	 * 获取同步配置
	 */
	private async getSyncConfig(): Promise<SyncConfig> {
		const db = getDbContext();
		const result = await db.client.execute({
			sql: "SELECT * FROM sync_config WHERE id = 'default'",
			args: [],
		});

		if (result.rows.length === 0) {
			throw new Error("Sync config not found");
		}

		const row = result.rows[0];
		return {
			webdav_enabled: Boolean(row.webdav_enabled),
			webdav_auto_sync: Boolean(row.webdav_auto_sync),
			webdav_sync_interval: Number(row.webdav_sync_interval) || 60,
			webdav_max_backups: Number(row.webdav_max_backups) || 0,
			webdav_url: row.webdav_url as string | null,
			webdav_username: row.webdav_username as string | null,
			webdav_password: row.webdav_password as string | null,
			webdav_path: (row.webdav_path as string) || "/",
			webdav_skip_backup_file: Boolean(row.webdav_skip_backup_file),
			webdav_disable_stream: Boolean(row.webdav_disable_stream),
			sync_on_startup: Boolean(row.sync_on_startup),
			sync_on_change: Boolean(row.sync_on_change),
		};
	}

	/**
	 * 调度定时同步
	 */
	private async scheduleSync(): Promise<void> {
		// 清除现有定时器
		if (this.syncTimer) {
			clearInterval(this.syncTimer);
			this.syncTimer = null;
		}

		const config = await this.getSyncConfig();

		// 检查是否启用自动同步
		if (
			!config.webdav_enabled ||
			!config.webdav_auto_sync ||
			config.webdav_sync_interval <= 0
		) {
			console.log("[AutoSyncScheduler] Auto sync is disabled");
			return;
		}

		// 计算同步间隔（分钟转毫秒）
		const intervalMs = Math.max(
			config.webdav_sync_interval * 60 * 1000,
			this.MIN_SYNC_INTERVAL,
		);

		console.log(
			`[AutoSyncScheduler] Scheduling sync every ${config.webdav_sync_interval} minutes`,
		);

		// 设置定时器
		this.syncTimer = setInterval(() => {
			this.performSync("scheduled").catch(console.error);
		}, intervalMs);
	}

	/**
	 * 执行同步
	 */
	private async performSync(
		trigger: "startup" | "scheduled" | "change" | "manual",
	): Promise<void> {
		// 防止重复同步
		if (this.isSyncing) {
			console.log("[AutoSyncScheduler] Sync already in progress, skipping");
			return;
		}

		// 电池模式下跳过定时同步（startup / change / manual 仍然执行，
		// 这些都是用户显式触发或会话内的关键操作，不能跳）。
		if (trigger === "scheduled" && powerMonitor.onBatteryPower) {
			console.log("[AutoSyncScheduler] On battery, skipping scheduled sync");
			return;
		}

		// 检查最小同步间隔
		const now = Date.now();
		if (
			trigger !== "manual" &&
			now - this.lastSyncTime < this.MIN_SYNC_INTERVAL
		) {
			console.log("[AutoSyncScheduler] Sync too frequent, skipping");
			return;
		}

		this.isSyncing = true;
		const startTime = Date.now();

		console.log(`[AutoSyncScheduler] Starting sync (trigger: ${trigger})`);

		// 获取设备信息
		const db = getDbContext();
		const deviceResult = await db.client.execute({
			sql: "SELECT device_id, device_name FROM sync_config WHERE id = 'default'",
			args: [],
		});
		const deviceId = (deviceResult.rows[0]?.device_id as string) || "unknown";
		const deviceName =
			(deviceResult.rows[0]?.device_name as string) || "Unknown Device";
		const fileName = await this.generateBackupFileNameWithDevice();

		// 记录备份开始
		const backupRecordId = await backupHistoryManager.recordBackup({
			backup_type: "webdav",
			file_name: fileName,
			device_id: deviceId,
			device_name: deviceName,
			is_encrypted: false,
			is_compact: false,
			is_incremental: false,
			status: "in_progress",
		});

		try {
			const config = await this.getSyncConfig();

			// 验证配置
			if (
				!config.webdav_url ||
				!config.webdav_username ||
				!config.webdav_password
			) {
				throw new Error("WebDAV configuration incomplete");
			}

			// 构建 WebDav 配置
			const webdavConfig: WebDavConfig = {
				webdavHost: config.webdav_url,
				webdavUser: config.webdav_username,
				webdavPass: config.webdav_password,
				webdavPath: config.webdav_path,
				fileName: fileName,
				skipBackupFile: config.webdav_skip_backup_file,
				disableStream: config.webdav_disable_stream,
			};

			// 导出数据
			const exportData = await exportAllDataForBackup(db);
			const dataJson = JSON.stringify(exportData, null, 2);

			// 执行备份
			await this.backupManager.backupToWebdav(
				{} as any,
				dataJson,
				webdavConfig,
			);

			// 更新备份历史为成功
			await backupHistoryManager.updateBackupStatus(backupRecordId, "success");

			// 更新同步状态
			await this.updateSyncStatus(true, null);

			this.lastSyncTime = now;
			this.retryCount = 0; // 重置重试计数

			const duration = Date.now() - startTime;
			console.log(
				`[AutoSyncScheduler] Sync completed successfully in ${duration}ms (trigger: ${trigger})`,
			);

			// 执行自动清理
			try {
				if (config.webdav_max_backups > 0) {
					const deletedCount =
						await backupHistoryManager.cleanupOldWebdavBackups(
							webdavConfig,
							config.webdav_max_backups,
						);
					console.log(
						`[AutoSyncScheduler] Cleaned up ${deletedCount} old backups`,
					);
				}
			} catch (cleanupError) {
				console.error("[AutoSyncScheduler] Cleanup failed:", cleanupError);
				// 清理失败不影响备份成功
			}
		} catch (error) {
			console.error(
				`[AutoSyncScheduler] Sync failed (trigger: ${trigger}):`,
				error,
			);

			// 更新备份历史为失败
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			await backupHistoryManager.updateBackupStatus(
				backupRecordId,
				"failed",
				errorMessage,
			);

			// 更新同步状态（记录错误）
			await this.updateSyncStatus(false, errorMessage);

			// 自动重试（仅对网络错误）
			if (this.shouldRetry(error) && this.retryCount < this.MAX_RETRIES) {
				this.retryCount++;
				const delay = Math.min(1000 * Math.pow(2, this.retryCount), 60000); // 指数退避，最多 60 秒
				console.log(
					`[AutoSyncScheduler] Retrying in ${delay}ms (attempt ${this.retryCount}/${this.MAX_RETRIES})`,
				);

				setTimeout(() => {
					this.performSync(trigger).catch(console.error);
				}, delay);
			} else {
				this.retryCount = 0; // 重置重试计数
			}
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * 判断错误是否应该重试
	 */
	private shouldRetry(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}

		const errorMessage = error.message.toLowerCase();

		// 网络相关错误应该重试
		const networkErrors = [
			"network",
			"timeout",
			"econnrefused",
			"enotfound",
			"etimedout",
			"econnreset",
		];

		return networkErrors.some((keyword) => errorMessage.includes(keyword));
	}

	/**
	 * 更新同步状态到数据库
	 */
	private async updateSyncStatus(
		success: boolean,
		error: string | null,
	): Promise<void> {
		const db = getDbContext();
		const now = Date.now();

		await db.client.execute({
			sql: `
				UPDATE sync_config
				SET
					webdav_last_sync_at = ?,
					webdav_last_sync_error = ?
				WHERE id = 'default'
			`,
			args: [now, error],
		});

		console.log(
			`[AutoSyncScheduler] Updated sync status: ${success ? "success" : "failed"}`,
		);
	}

	/**
	 * 生成备份文件名
	 */
	private async generateBackupFileNameWithDevice(): Promise<string> {
		const db = getDbContext();
		const result = await db.client.execute({
			sql: "SELECT device_id FROM sync_config WHERE id = 'default'",
			args: [],
		});

		let deviceId = "unknown";
		if (result.rows.length > 0 && result.rows[0].device_id) {
			deviceId = result.rows[0].device_id as string;
		}

		return generateBackupFileName(deviceId);
	}

	/**
	 * 确保设备 ID 已生成并存储
	 */
	private async ensureDeviceId(): Promise<void> {
		const db = getDbContext();
		const result = await db.client.execute({
			sql: "SELECT device_id, device_name FROM sync_config WHERE id = 'default'",
			args: [],
		});

		if (result.rows.length === 0) {
			// 配置不存在，创建默认配置
			const deviceId = generateDeviceId();
			const deviceName = getDeviceName();

			await db.client.execute({
				sql: `INSERT INTO sync_config (id, device_id, device_name) VALUES ('default', ?, ?)`,
				args: [deviceId, deviceName],
			});

			console.log(
				`[AutoSyncScheduler] Generated device ID: ${deviceId} (${deviceName})`,
			);
		} else if (!result.rows[0].device_id) {
			// 配置存在但没有设备 ID，更新
			const deviceId = generateDeviceId();
			const deviceName = getDeviceName();

			await db.client.execute({
				sql: `UPDATE sync_config SET device_id = ?, device_name = ? WHERE id = 'default'`,
				args: [deviceId, deviceName],
			});

			console.log(
				`[AutoSyncScheduler] Updated device ID: ${deviceId} (${deviceName})`,
			);
		} else {
			console.log(
				`[AutoSyncScheduler] Using existing device ID: ${result.rows[0].device_id}`,
			);
		}
	}

	/**
	 * 获取当前状态（用于调试）
	 */
	getStatus(): {
		isRunning: boolean;
		isSyncing: boolean;
		lastSyncTime: number;
		retryCount: number;
	} {
		return {
			isRunning: this.isRunning,
			isSyncing: this.isSyncing,
			lastSyncTime: this.lastSyncTime,
			retryCount: this.retryCount,
		};
	}
}

// 导出单例实例
export const autoSyncScheduler = new AutoSyncScheduler();
