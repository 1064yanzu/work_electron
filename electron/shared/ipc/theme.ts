// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：theme（共 4 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type { Theme } from "./common";

export interface ThemeIpcSchema {
	theme_list: {
		input: Record<string, never>;
		output: Theme[];
	};
	theme_create: {
		input: { name: string };
		output: Theme;
	};
	theme_rename: {
		input: { id: string; name: string };
		output: Theme;
	};
	theme_delete: {
		input: { id: string };
		output: { success: boolean };
	};
}
