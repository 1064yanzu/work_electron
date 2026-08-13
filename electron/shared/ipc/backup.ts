// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：backup（共 24 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type { IpcExportResult, IpcImportResult } from "./common";

export interface BackupIpcSchema {
	// ==================
	// 同步与备份
	// ==================
	get_sync_config: {
		input: Record<string, never>;
		output: Record<string, unknown>;
	};
	update_sync_config: {
		input: Record<string, unknown>;
		output: Record<string, unknown>;
	};
	list_backup_history: {
		input: { limit?: number };
		output: Array<Record<string, unknown>>;
	};
	create_backup_record: {
		input: Record<string, unknown>;
		output: { success: boolean };
	};
	clean_old_backups: {
		input: { keep_days?: number };
		output: { deleted_count: number };
	};
	backup_to_webdav: {
		input: { data: string; config: Record<string, unknown> };
		output: Record<string, unknown>;
	};
	restore_from_webdav: {
		input: { config: Record<string, unknown> };
		output: string;
	};
	list_webdav_backups: {
		input: { config: Record<string, unknown> };
		output: Array<Record<string, unknown>>;
	};
	delete_webdav_backup: {
		input: { fileName: string; config: Record<string, unknown> };
		output: Record<string, unknown>;
	};
	test_webdav_connection: {
		input: { config: Record<string, unknown> };
		output: boolean;
	};
	get_data_stats: {
		input: Record<string, never>;
		output: Record<string, number>;
	};
	get_data_directory: {
		input: Record<string, never>;
		output: string;
	};
	get_database_path: {
		input: Record<string, never>;
		output: string;
	};
	clear_all_data: {
		input: Record<string, never>;
		output: void;
	};

	// ==================
	// 导入导出命令
	// ==================
	/**
	 * 导出全量数据（D9 流式化）：主进程分块序列化写入临时文件，
	 * IPC 只返回 { path, bytes }，不再传整串 JSON。
	 * 需要内容的调用方（WebDAV 备份）拿到 path 后用 read_file_safe 读取。
	 */
	export_all_data: {
		input: Record<string, never>;
		output: { path: string; bytes: number };
	};
	/** 导出全量数据到用户选择的文件（主进程 showSaveDialog + 直接写盘，同 logs_export 模式） */
	export_all_data_to_file: {
		input: Record<string, never>;
		output: { canceled: boolean; path: string; bytes: number };
	};
	/** 导出单个项目及其关联数据到指定路径 */
	export_project: {
		input: { project_id: string; export_path: string };
		output: IpcExportResult;
	};
	/** 从磁盘上的备份 JSON 文件导入 */
	import_data: {
		input: { import_path: string; overwrite?: boolean };
		output: IpcImportResult;
	};
	/** 从内存中的 JSON 字符串导入（渲染端已读入文件内容的场景） */
	import_data_from_json: {
		input: {
			jsonData: string;
			overwrite?: boolean;
			clear_all_first?: boolean;
		};
		output: IpcImportResult;
	};

	// ==================
	// 本地备份命令
	// ==================
	/** 列出指定目录下的备份文件 */
	list_local_backup_files: {
		input: { dir: string };
		output: Array<{
			fileName: string;
			modifiedTime: string;
			size: number;
		}>;
	};
	/** 删除指定备份文件 */
	delete_local_backup_file: {
		input: { dir: string; fileName: string };
		output: { success: boolean };
	};
	/** 备份到指定本地目录 */
	backup_to_local_dir: {
		input: { dir: string; fileName?: string };
		output: { path: string; size: number };
	};
	/** 从本地备份文件恢复 */
	restore_from_local_file: {
		input: { dir: string; fileName: string };
		output: { success: boolean };
	};
	/** 选择本地备份目录 */
	select_backup_directory: {
		input: Record<string, never>;
		output: { path: string | null };
	};
}
