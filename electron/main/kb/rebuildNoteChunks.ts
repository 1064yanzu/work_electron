import { randomUUID } from "node:crypto";
import type { DbContext } from "../db/client";
import { buildChunks } from "./chunking";

/**
 * 重建笔记分块（note_chunks + FTS 触发器）
 * - 删除旧 chunks
 * - 重新切分并写入
 *
 * 注意：此函数只负责 chunking，不负责 embedding（embedding 由其它流程处理）。
 */
export async function rebuildNoteChunks(options: {
	db: DbContext;
	noteId: string;
	sourceId: string | null;
	content: string;
}): Promise<number> {
	const { db, noteId, sourceId, content } = options;
	const now = Date.now();

	// 删除旧 chunks
	await db.client.execute({
		sql: `DELETE FROM note_chunks WHERE note_id = ?`,
		args: [noteId],
	});

	const normalized = String(content || "").trim();
	if (!normalized) return 0;

	// 切分内容
	const chunks = buildChunks(normalized);

	// 写入新 chunks
	for (let i = 0; i < chunks.length; i++) {
		const chunkId = randomUUID();
		await db.client.execute({
			sql: `INSERT INTO note_chunks (id, note_id, source_id, chunk_index, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
			args: [chunkId, noteId, sourceId, i, chunks[i], now, now],
		});
	}

	return chunks.length;
}
