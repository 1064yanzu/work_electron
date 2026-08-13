// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：files（共 34 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type { FileRecord, Note, Source, StorageSettings } from "./common";

export interface FilesIpcSchema {
	/**
	 * 启动 / 停止目录文件监听（chokidar）。
	 * 变更事件通过 `coding-file-changed` 推送：{ projectPath, changes: FileChangeEvent[] }。
	 * 用于沙盒工作区文件树的事件驱动刷新，替代渲染端高频全量重扫。
	 */
	file_watch_start: {
		input: { path: string };
		output: { success: boolean; error?: string };
	};
	file_watch_stop: {
		input: { path: string };
		output: { success: boolean; error?: string };
	};
	/**
	 * userData 缓存清理：扫描 + 报告 + 执行。
	 * 默认 dry-run 仅返回可清理项；execute=true 时真正删除。
	 */
	userdata_janitor_scan: {
		input: Record<string, never>;
		output: {
			scopes: Array<{
				key: string;
				label: string;
				root: string;
				files: number;
				bytes: number;
			}>;
			total_bytes: number;
		};
	};
	userdata_janitor_execute: {
		input: { scopes?: string[] };
		output: {
			removed: number;
			bytes: number;
			errors: Array<{ path: string; error: string }>;
		};
	};
	upload_file_content: {
		input: {
			title: string;
			content: string;
			file_type: string;
			tags?: string[];
			project_id?: string;
			folder_id?: string;
			source_type?: Source["source_type"];
			category?: Source["category"];
		};
		output: Source;
	};
	import_local_files: {
		input: {
			paths: string[];
			tags?: string[];
			project_id?: string;
			folder_id?: string;
			source_type?: Source["source_type"];
		};
		output: Array<{ source: Source; note: Note }>;
	};

	// ==================
	// FS Safe / Temp File
	// ==================
	read_file_safe: {
		input: { path: string; encoding?: "utf-8" | "base64" };
		output: {
			content: string;
			encoding: string;
			size: number;
			mtime_ms: number;
			path: string;
		};
	};
	/**
	 * F4：二进制文件读取（结构化克隆直传 Uint8Array，无 base64 编解码开销）。
	 * 用于 PDF 等二进制大文件，消灭 read_file_safe(base64) + 渲染端 atob 逐字节循环解码。
	 */
	read_file_bytes_safe: {
		input: { path: string };
		output: {
			data: Uint8Array;
			size: number;
			mtime_ms: number;
			path: string;
		};
	};
	write_file_safe: {
		input: {
			path: string;
			content: string;
			encoding?: "utf-8" | "base64";
			create_dirs?: boolean;
			allow_empty?: boolean;
			expected_mtime_ms?: number;
			expected_size?: number;
		};
		output: {
			success: boolean;
			bytes_written: number;
			size: number;
			mtime_ms: number;
			path: string;
		};
	};
	list_files_safe: {
		input: { path: string; recursive?: boolean };
		output: Array<{
			path: string;
			name: string;
			is_file: boolean;
			is_dir: boolean;
			size?: number;
			mtime_ms?: number;
		}>;
	};
	mkdir_safe: {
		input: { path: string; recursive?: boolean };
		output: { success: boolean };
	};
	copy_file_safe: {
		input: { src: string; dest: string; create_dirs?: boolean };
		output: { success: boolean };
	};
	move_file_safe: {
		input: { src: string; dest: string; create_dirs?: boolean };
		output: { success: boolean };
	};
	delete_file_safe: {
		input: { path: string };
		output: { success: boolean };
	};
	reveal_file_safe: {
		input: { path: string };
		output: { success: boolean };
	};
	/**
	 * 直接读取 UTF-8 文本（`read_file_safe` 的轻量版：只回内容字符串，
	 * 不带 size/mtime 元信息）。同样走 pathGuard 敏感路径黑名单。
	 */
	read_file_utf8: {
		input: { path: string };
		output: string;
	};
	/** 保存 base64 图片到应用图片目录，返回绝对路径；失败返回 null（不抛错）。 */
	save_base64_image: {
		input: { base64Data: string; fileName?: string };
		output: string | null;
	};
	save_temp_file: {
		input: {
			content: string;
			extension?: string;
			prefix?: string;
			encoding?: "utf-8" | "base64";
		};
		output: { path: string; size: number };
	};

	// ==================
	// Documents
	// ==================
	convert_docx_to_html: {
		input: { path: string };
		output: { html: string };
	};

	// ==================
	// Storage / Vault
	// ==================
	storage_get_settings: {
		input: Record<string, never>;
		output: StorageSettings;
	};
	storage_update_settings: {
		input: {
			settings: Partial<StorageSettings>;
			migrate_existing?: boolean;
		};
		output: {
			settings: StorageSettings;
			migration?: { backup_path: string; sources: number; outputs: number };
		};
	};
	storage_pick_directory: {
		input: undefined;
		output: { path: string | null };
	};
	storage_reveal_vault_root: {
		input: Record<string, never>;
		output: { success: boolean; error?: string };
	};
	// ==================
	// 缓存根目录（可清理缓存的统一存储位置，独立于 Vault）
	// ==================
	cache_root_get: {
		input: Record<string, never>;
		output: { current: string; isDefault: boolean; defaultRoot: string };
	};
	cache_root_pick: {
		input: undefined;
		output: { path: string | null };
	};
	cache_root_update: {
		input: { newRoot: string; migrate: boolean };
		output: {
			current: string;
			isDefault: boolean;
			migration?: {
				copied: number;
				bytes: number;
				skipped: number;
				errors: Array<{ path: string; error: string }>;
			};
		};
	};
	file_list: {
		input: {
			project_id?: string;
			scope?: "global" | "project";
			themes?: string[];
			tags?: string[];
			include_deleted?: boolean;
			entity_type?: "source" | "output" | "all";
		};
		output: FileRecord[];
	};
	file_move: {
		input: {
			id: string;
			entity_type?: "source" | "output";
			destination:
				| "project_docs"
				| "global_shared"
				| "global_webclips"
				| "theme";
			project_id?: string;
			theme_id?: string;
		};
		output: FileRecord;
	};
	file_delete: {
		input: { id: string; entity_type?: "source" | "output" };
		output: { success: boolean };
	};
	file_restore: {
		input: { id: string; entity_type?: "source" | "output" };
		output: { success: boolean };
	};
	file_reveal_in_finder: {
		input: { id: string; entity_type?: "source" | "output" };
		output: { success: boolean; path: string };
	};
	file_set_scope: {
		input: {
			id: string;
			entity_type?: "source" | "output";
			scope: "global" | "project";
			project_id?: string;
		};
		output: FileRecord;
	};
	file_set_tags: {
		input: { id: string; entity_type?: "source" | "output"; tags: string[] };
		output: FileRecord;
	};
	/** 保存沙盒文件（Monaco 编辑器用） */
	sandbox_save_file: {
		input: { taskId: string; relPath: string; content: string };
		output: { success: boolean };
	};
}
