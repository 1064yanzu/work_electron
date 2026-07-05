import { safeInvoke } from "../tauriBridge";

/** 数据库管理 */
export async function getDatabasePath(): Promise<string> {
	return await safeInvoke("get_database_path");
}

export async function setDatabasePath(newPath: string): Promise<void> {
	return await safeInvoke("set_database_path", { newPath });
}

export async function importDataFromJson(
	jsonData: string,
	options?: { overwrite?: boolean; clear_all_first?: boolean },
): Promise<void> {
	return await safeInvoke("import_data_from_json", {
		jsonData,
		overwrite: options?.overwrite ?? true,
		clear_all_first: options?.clear_all_first ?? true,
	});
}

/** 全量数据管理 */
export async function clearAllData(): Promise<void> {
	return await safeInvoke("clear_all_data");
}

export async function resetCoreProviders(): Promise<void> {
	return await safeInvoke("reset_core_providers");
}

/**
 * 导出全量数据到主进程临时文件（D9 流式化）：只返回 { path, bytes }，
 * 整串 JSON 不过 IPC。需要内容时（WebDAV 备份）用 read_file_safe 按路径读取。
 */
export async function exportAllData(): Promise<{
	path: string;
	bytes: number;
}> {
	return await safeInvoke("export_all_data");
}

/** 导出全量数据到用户选择的文件（主进程保存对话框 + 直接写盘） */
export async function exportAllDataToFile(): Promise<{
	canceled: boolean;
	path: string;
	bytes: number;
}> {
	return await safeInvoke("export_all_data_to_file");
}

export async function getDataDirectory(): Promise<string> {
	return await safeInvoke("get_data_directory");
}

export async function clearCache(): Promise<number> {
	return await safeInvoke("clear_cache");
}

export interface DataStats {
	sources_count: number;
	notes_count: number;
	workflows_count: number;
	outputs_count: number;
	cards_count: number;
	providers_count: number;
	database_size: number;
	media_size: number;
	cache_size: number;
}

export async function getDataStats(): Promise<DataStats> {
	return await safeInvoke("get_data_stats");
}

/** 缓存根目录（可清理缓存的统一存储位置） */
export async function getCacheRoot(): Promise<{
	current: string;
	isDefault: boolean;
	defaultRoot: string;
}> {
	return await safeInvoke("cache_root_get");
}

export async function pickCacheRoot(): Promise<{ path: string | null }> {
	return await safeInvoke("cache_root_pick");
}

export async function updateCacheRoot(payload: {
	newRoot: string;
	migrate: boolean;
}): Promise<{
	current: string;
	isDefault: boolean;
	migration?: {
		copied: number;
		bytes: number;
		skipped: number;
		errors: Array<{ path: string; error: string }>;
	};
}> {
	return await safeInvoke("cache_root_update", payload);
}
