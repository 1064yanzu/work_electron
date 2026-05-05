import type { DbContext } from "../db/client";
import type { ReaderSearchHit } from "../../shared/ipc-schema";

function normalize(text: string): string {
	return text.trim();
}

function buildSnippet(content: string, queryLower: string): string {
	const lower = content.toLowerCase();
	const idx = lower.indexOf(queryLower);
	if (idx < 0) {
		return content.slice(0, 200) + (content.length > 200 ? "…" : "");
	}
	const radius = 80;
	const start = Math.max(0, idx - radius);
	const end = Math.min(content.length, idx + queryLower.length + radius);
	const prefix = start > 0 ? "…" : "";
	const suffix = end < content.length ? "…" : "";
	return `${prefix}${content.slice(start, end)}${suffix}`;
}

/** 单本搜索：通过 reader_books.source_id 关联到 note_chunks_fts 做 FTS5。 */
export async function searchInBook(
	db: DbContext,
	params: { book_id: string; query: string; limit?: number },
): Promise<ReaderSearchHit[]> {
	const q = normalize(params.query);
	if (!q) return [];
	const limit = Math.max(1, Math.min(200, params.limit ?? 50));

	const sourceRes = await db.client.execute({
		sql: `SELECT source_id FROM reader_books WHERE id = ?`,
		args: [params.book_id],
	});
	const sourceId = sourceRes.rows[0]?.source_id;
	if (typeof sourceId !== "string" || !sourceId) return [];

	try {
		const result = await db.client.execute({
			sql: `
				SELECT
					nc.content AS content,
					bm25(note_chunks_fts) AS rank,
					snippet(note_chunks_fts, 1, '<<', '>>', '…', 16) AS snip
				FROM note_chunks_fts
				JOIN note_chunks nc ON note_chunks_fts.chunk_id = nc.id
				WHERE note_chunks_fts MATCH ? AND nc.source_id = ?
				ORDER BY rank
				LIMIT ?
			`,
			args: [q, sourceId, limit],
		});
		return result.rows.map((row, idx) => ({
			book_id: params.book_id,
			chapter_id: null,
			locator: `chunk:${idx}`,
			snippet: String(row.snip || ""),
			score: 1 / (1 + Math.max(0, Number(row.rank ?? 0))),
		}));
	} catch {
		// FTS 失败时降级 LIKE 查询
		const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
		const result = await db.client.execute({
			sql: `SELECT content FROM note_chunks WHERE source_id = ? AND content LIKE ? ESCAPE '\\' LIMIT ?`,
			args: [sourceId, like, limit],
		});
		const lower = q.toLowerCase();
		return result.rows.map((row, idx) => {
			const content = String(row.content || "");
			return {
				book_id: params.book_id,
				chapter_id: null,
				locator: `chunk:${idx}`,
				snippet: buildSnippet(content, lower),
				score: 0.5,
			};
		});
	}
}

/** 跨书搜索：FTS5 + book 关联。 */
export async function searchGlobal(
	db: DbContext,
	params: { query: string; limit?: number },
): Promise<ReaderSearchHit[]> {
	const q = normalize(params.query);
	if (!q) return [];
	const limit = Math.max(1, Math.min(200, params.limit ?? 50));

	try {
		const result = await db.client.execute({
			sql: `
				SELECT
					rb.id AS book_id,
					nc.content AS content,
					bm25(note_chunks_fts) AS rank,
					snippet(note_chunks_fts, 1, '<<', '>>', '…', 16) AS snip
				FROM note_chunks_fts
				JOIN note_chunks nc ON note_chunks_fts.chunk_id = nc.id
				JOIN reader_books rb ON rb.source_id = nc.source_id
				WHERE note_chunks_fts MATCH ?
				ORDER BY rank
				LIMIT ?
			`,
			args: [q, limit],
		});
		return result.rows.map((row, idx) => ({
			book_id: String(row.book_id),
			chapter_id: null,
			locator: `chunk:${idx}`,
			snippet: String(row.snip || ""),
			score: 1 / (1 + Math.max(0, Number(row.rank ?? 0))),
		}));
	} catch {
		return [];
	}
}
