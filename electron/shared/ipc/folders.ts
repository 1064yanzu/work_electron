// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：folders（共 5 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	CreateFolderPayload,
	Folder,
	UpdateFolderPayload,
} from "./common";

export interface FoldersIpcSchema {
	// ==================
	// Folders 命令
	// ==================
	list_folders: {
		input: { project_id?: string };
		output: Folder[];
	};
	create_folder: {
		input: CreateFolderPayload;
		output: Folder;
	};
	update_folder: {
		input: UpdateFolderPayload;
		output: Folder;
	};
	delete_folder: {
		input: { id: string };
		output: { success: boolean };
	};
	move_sources_to_folder: {
		input: { source_ids: string[]; folder_id: string | null };
		output: { success: boolean; count: number };
	};
}
