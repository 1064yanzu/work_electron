// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：cards（共 4 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface CardsIpcSchema {
	// ==================
	// Cards（分享卡片）
	// ==================
	list_cards: {
		input: Record<string, never>;
		output: Array<{
			id: string;
			title: string;
			text: string;
			image_path: string;
			source_url?: string;
			theme_id?: string;
			font_id?: string;
			aspect_ratio?: string;
			created_at: number;
			updated_at: number;
		}>;
	};
	get_card: {
		input: { id: string };
		output: {
			id: string;
			title: string;
			text: string;
			image_path: string;
			source_url?: string;
			theme_id?: string;
			font_id?: string;
			aspect_ratio?: string;
			created_at: number;
			updated_at: number;
		};
	};
	delete_card: {
		input: { id: string };
		output: { success: boolean };
	};
	get_card_image_path: {
		input: { image_path: string };
		output: { path: string };
	};
}
