// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：outputs（共 4 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	CreateOutputPayload,
	OutputAsset,
	UpdateOutputPayload,
} from "./common";

export interface OutputsIpcSchema {
	// ==================
	// Output Assets 命令
	// ==================
	list_output_assets: {
		input: {
			project_id?: string;
			/** 只取指定 id 的产物（详情场景，返回全文） */
			id?: string;
			/** 元数据模式：content 只返回前 200 字符摘要，并附带 content_length（列表场景瘦身） */
			meta_only?: boolean;
		};
		output: OutputAsset[];
	};
	create_output_asset: {
		input: CreateOutputPayload;
		output: OutputAsset;
	};
	update_output_asset: {
		input: UpdateOutputPayload;
		output: OutputAsset;
	};
	delete_output_asset: {
		input: { id: string };
		output: { success: boolean };
	};
}
