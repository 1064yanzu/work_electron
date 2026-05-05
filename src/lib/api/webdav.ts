import { safeInvoke } from "../tauriBridge";

export interface WebDavConfig {
	webdavHost: string;
	webdavUser?: string;
	webdavPass?: string;
	webdavPath?: string;
	fileName?: string;
	skipBackupFile?: boolean;
	disableStream?: boolean;
	encryptionPassword?: string;
}

export interface WebdavBackupFile {
	fileName: string;
	modifiedTime: string;
	size: number;
}

export interface WebDAVTestResult {
	success: boolean;
	message: string;
	server_info: string | null;
}

export async function testWebdavConnection(
	config: WebDavConfig,
): Promise<boolean> {
	return await safeInvoke("test_webdav_connection", { config });
}

export async function backupToWebdav(
	data: string,
	config: WebDavConfig,
): Promise<any> {
	return await safeInvoke("backup_to_webdav", { data, config });
}

export async function restoreFromWebdav(config: WebDavConfig): Promise<string> {
	return await safeInvoke("restore_from_webdav", { config });
}

export async function listWebdavBackups(
	config: WebDavConfig,
): Promise<WebdavBackupFile[]> {
	return await safeInvoke("list_webdav_backups", { config });
}

export async function deleteWebdavBackup(
	fileName: string,
	config: WebDavConfig,
): Promise<any> {
	return await safeInvoke("delete_webdav_backup", { fileName, config });
}
