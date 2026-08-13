// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：notes（共 4 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type { CreateNotePayload, Note, UpdateNotePayload } from "./common";

export interface NotesIpcSchema {
	// ==================
	// Notes 命令
	// ==================
	list_notes: {
		input: {
			source_id?: string;
			/** 是否返回 content_html（默认 false，列表瘦身；详情/编辑需要时显式传 true） */
			include_html?: boolean;
		};
		output: Note[];
	};
	create_note: {
		input: CreateNotePayload;
		output: Note;
	};
	update_note: {
		input: UpdateNotePayload;
		output: Note;
	};
	delete_note: {
		input: { id: string };
		output: { success: boolean };
	};
}
