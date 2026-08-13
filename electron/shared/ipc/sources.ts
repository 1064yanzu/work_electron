// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：sources（共 7 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	CreateSourcePayload,
	Note,
	Source,
	UpdateSourcePayload,
} from "./common";

export interface SourcesIpcSchema {
	// ==================
	// Sources 命令
	// ==================
	list_sources: {
		input: { project_id?: string; folder_id?: string; limit?: number };
		output: Source[];
	};
	get_source: {
		input: { id: string };
		output: Source | null;
	};
	get_source_detail: {
		input: { id: string };
		output: { source: Source; note: Note | null } | null;
	};
	create_source: {
		input: CreateSourcePayload;
		output: Source;
	};
	update_source: {
		input: UpdateSourcePayload;
		output: Source;
	};
	delete_source: {
		input: { id: string };
		output: { success: boolean };
	};
	search_sources: {
		input: { query: string; project_id?: string; limit?: number };
		output: Source[];
	};
}
