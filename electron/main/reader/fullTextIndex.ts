import { randomUUID } from "node:crypto";

import type { DbContext } from "../db/client";
import { rebuildNoteChunks } from "../kb/rebuildNoteChunks";

export type FullTextLink = {
	source_id: string;
	note_id: string;
};

/**
 * 把整本电子书的纯文本写入 sources/notes，让 KB 的 FTS5 + 嵌入体系自动接管。
 * - 一本书 ↔ 一条 sources（kind='document', category='document'）
 * - 一条 sources ↔ 一条 notes
 * - rebuildNoteChunks 会把 content 切片并写 note_chunks（trigger 同步 FTS）
 *
 * 复用现有 KB 体系，避免维护单独的 reader 全文索引。
 */
export async function indexBookFullText(
	db: DbContext,
	params: {
		bookId: string;
		title: string;
		fullText: string;
		storagePath: string;
		projectId?: string | null;
		folderId?: string | null;
		tagsExtra?: string[];
	},
): Promise<FullTextLink | null> {
	const text = (params.fullText || "").trim();
	if (text.length === 0) return null;

	const sourceId = randomUUID();
	const noteId = randomUUID();
	const ts = Date.now();
	const tags = ["reader", ...(params.tagsExtra ?? [])];

	await db.client.execute({
		sql: `INSERT INTO sources (id, title, kind, scope, tags, url, project_id, folder_id, source_type, origin_type, category, storage_path, created_at, updated_at)
			VALUES (?, ?, 'document', ?, ?, NULL, ?, ?, 'import', 'import', 'document', ?, ?, ?)`,
		args: [
			sourceId,
			params.title,
			params.projectId ? "project" : "global",
			JSON.stringify(tags),
			params.projectId ?? null,
			params.folderId ?? null,
			params.storagePath,
			ts,
			ts,
		],
	});

	await db.client.execute({
		sql: `INSERT INTO notes (id, source_id, content, content_html, created_at, updated_at)
			VALUES (?, ?, ?, NULL, ?, ?)`,
		args: [noteId, sourceId, text, ts, ts],
	});

	await rebuildNoteChunks({
		db,
		noteId,
		sourceId,
		content: text,
	});

	// 反向写入 reader_books.source_id（让全文检索能从 chunk → source → book）
	await db.client.execute({
		sql: `UPDATE reader_books SET source_id = ? WHERE id = ?`,
		args: [sourceId, params.bookId],
	});

	return { source_id: sourceId, note_id: noteId };
}

/** 删除书时清理对应的 sources / notes（FTS 由 trigger 同步）。 */
export async function dropBookFullText(
	db: DbContext,
	bookId: string,
): Promise<void> {
	const res = await db.client.execute({
		sql: `SELECT source_id FROM reader_books WHERE id = ?`,
		args: [bookId],
	});
	const row = res.rows[0];
	const sourceId = row?.source_id;
	if (typeof sourceId !== "string" || !sourceId) return;
	// notes / note_chunks ON DELETE CASCADE 会级联删除
	await db.client.execute({
		sql: `DELETE FROM sources WHERE id = ?`,
		args: [sourceId],
	});
}
