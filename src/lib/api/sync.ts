import { safeInvoke } from "../tauriBridge";

export interface SyncConfig {
	id: string;
	data_path: string | null;
	webdav_enabled: boolean;
	webdav_url: string | null;
	webdav_username: string | null;
	webdav_password: string | null;
	webdav_path: string;
	webdav_auto_sync: boolean;
	webdav_sync_interval: number;
	webdav_max_backups: number;
	webdav_skip_backup_file: boolean;
	webdav_disable_stream: boolean;
	webdav_last_sync_at: number | null;
	webdav_last_sync_error: string | null;
	auto_backup_enabled: boolean;
	auto_backup_interval: number;
	max_backup_count: number;
	sync_on_startup: boolean;
	sync_on_change: boolean;
	compact_backup: boolean;
	last_backup_at: string | null;
	last_sync_at: string | null;
	last_sync_status: string | null;
	last_sync_error: string | null;
	local_backup_dir: string | null;
	local_backup_auto_sync: boolean;
	local_backup_interval: number;
	local_backup_max_count: number;
	local_backup_last_sync_at: string | null;
	created_at: string;
	updated_at: string;
}

export async function getSyncConfig(): Promise<SyncConfig> {
	return await safeInvoke("get_sync_config");
}

export async function updateSyncConfig(config: SyncConfig): Promise<void> {
	return await safeInvoke("update_sync_config", { payload: config });
}
