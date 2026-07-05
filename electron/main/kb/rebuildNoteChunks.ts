import { randomUUID } from "node:crypto";
import type { InStatement } from "@libsql/client";
import type { DbContext } from "../db/client";
import { withBatch } from "../db/batch";
import { buildChunks } from "./chunking";

/**
 * 重建笔记分块（note_chunks + FTS 触发器）
 * - 删除旧 chunks
 * - 重新切分并写入
 *
 * 注意：此函数只负责 chunking，不负责 embedding（embedding 由其它流程处理）。
 *
 * B6：删除 + 全部写入合并为一次 `client.batch()` 事务，避免一本书数千个
 * chunk 逐条 execute() 各自隐式提交（各自触发 FTS 触发器 + fsync）。
 */
export async function rebuildNoteChunks(options: {
	db: DbContext;
	noteId: string;
	sourceId: string | null;
	content: string;
}): Promise<number> {
	const { db, noteId, sourceId, content } = options;
	const now = Date.now();

	const normalized = String(content || "").trim();
	const chunks = normalized ? buildChunks(normalized) : [];

	const statements: InStatement[] = [
		{ sql: `DELETE FROM note_chunks WHERE note_id = ?`, args: [noteId] },
	];
	for (let i = 0; i < chunks.length; i++) {
		statements.push({
			sql: `INSERT INTO note_chunks (id, note_id, source_id, chunk_index, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
			args: [randomUUID(), noteId, sourceId, i, chunks[i], now, now],
		});
	}

	await withBatch(db, statements);

	return chunks.length;
}
