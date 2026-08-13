// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：logs（共 3 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface LogsIpcSchema {
	// ==================
	// 日志导出
	// ==================
	logs_get_info: {
		input: Record<string, never>;
		output: {
			root: string;
			exists: boolean;
			total_bytes: number;
			subdir_count: number;
			latest_subdirs: string[];
		};
	};
	logs_reveal: {
		input: Record<string, never>;
		output: { success: boolean; path: string; error?: string };
	};
	logs_export: {
		input: { days?: number };
		output: {
			canceled: boolean;
			path: string;
			bytes: number;
			error?: string;
		};
	};
}
