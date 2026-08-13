// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：update（共 5 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface UpdateIpcSchema {
	// ==================
	// 应用更新
	// ==================
	update_check: {
		input: Record<string, never>;
		output: {
			status: string;
			version?: string;
			releaseName?: string;
			releaseNotes?: string;
			progress?: {
				percent: number;
				transferred: number;
				total: number;
				bytesPerSecond: number;
			};
			error?: string;
		};
	};
	update_download: {
		input: Record<string, never>;
		output: {
			status: string;
			version?: string;
			releaseName?: string;
			progress?: {
				percent: number;
				transferred: number;
				total: number;
				bytesPerSecond: number;
			};
			error?: string;
		};
	};
	update_install: {
		input: Record<string, never>;
		output: { success: boolean };
	};
	update_get_state: {
		input: Record<string, never>;
		output: {
			status: string;
			version?: string;
			releaseName?: string;
			releaseNotes?: string;
			progress?: {
				percent: number;
				transferred: number;
				total: number;
				bytesPerSecond: number;
			};
			error?: string;
		};
	};
	update_reveal_pending: {
		input: Record<string, never>;
		output: { success: boolean; path?: string; error?: string };
	};
}
