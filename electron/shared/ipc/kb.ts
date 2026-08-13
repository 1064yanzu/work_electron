// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：kb（共 4 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface KbIpcSchema {
	// ==================
	// Knowledge Base 命令
	// ==================
	kb_search_chunks: {
		input: { query: string; limit?: number; source_id?: string };
		output: Array<{
			chunk_id: string;
			content: string;
			score: number;
			snippet: string;
			/**
			 * 该结果来自**降级路径**（数据库 FTS 查询抛错，回落到剪藏收件箱的
			 * 内存扫描）。命中降级时结果不完整，UI 可以据此提示"检索能力受限"。
			 * 正常路径不带这个字段。
			 */
			degraded?: boolean;
		}>;
	};
	kb_chunk_rebuild: {
		input: { note_id: string };
		output: { success: boolean; chunk_count: number };
	};
	kb_get_embedding_stats: {
		input: Record<string, never>;
		output: {
			embedding_model: string | null;
			total_chunks: number;
			embedded_chunks: number;
			missing_chunks: number;
		};
	};
	kb_embeddings_rebuild: {
		input: {
			embedding_model: string;
			note_id?: string;
			force?: boolean;
			batch_size?: number;
		};
		output: number;
	};
}
