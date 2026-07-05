import type { IPCSchema } from "../../shared/ipc-schema";
import { createFileClipStore } from "../clip/fileClipStore";
import type { DbContext } from "../db/client";
import { getActiveFtsVersion } from "./ftsRebuild";

type SearchInput = IPCSchema["kb_search_chunks"]["input"];
type SearchOutput = IPCSchema["kb_search_chunks"]["output"];

function normalize(text: string) {
	return text.trim().toLowerCase();
}

function buildSnippet(
	content: string,
	matchIndex: number,
	queryLength: number,
) {
	const radius = 80;
	const start = Math.max(0, matchIndex - radius);
	const end = Math.min(content.length, matchIndex + queryLength + radius);
	const prefix = start > 0 ? "…" : "";
	const suffix = end < content.length ? "…" : "";
	return `${prefix}${content.slice(start, end)}${suffix}`;
}

export async function searchChunksFromClipInbox(
	input: SearchInput,
): Promise<SearchOutput> {
	const q = normalize(input.query);
	if (!q) return [];

	const store = createFileClipStore();
	const clips = await store.list();

	const results = clips
		.map((clip) => {
			const content =
				clip.payload.text ??
				clip.payload.selectedText ??
				clip.payload.html ??
				clip.payload.url ??
				"";

			const haystack = normalize(content);
			const idx = haystack.indexOf(q);
			if (idx < 0) return null;

			const score = 1 / (1 + idx);
			const snippet = buildSnippet(content, idx, q.length);

			return {
				chunk_id: clip.id,
				content,
				score,
				snippet,
			};
		})
		.filter((r): r is NonNullable<typeof r> => r !== null)
		.sort((a, b) => b.score - a.score);

	const limit = input.limit ?? 10;
	return results.slice(0, Math.max(1, limit));
}

/** LIKE 通配符转义（配合 ESCAPE '\'） */
function escapeLikePattern(q: string) {
	return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** FTS5 MATCH 短语转义：整体包成一个 phrase，内部双引号翻倍 */
function toFtsPhraseQuery(q: string) {
	return `"${q.replaceAll('"', '""')}"`;
}

/**
 * D1：trigram 新表（note_chunks_fts_v2）读路径。
 *
 * - 查询 >= 3 个码点：MATCH + bm25 + snippet（trigram 对中文子串匹配语义正确）；
 * - 查询 < 3 个码点：trigram 索引无法命中（最小索引单元是 3 码点），
 *   降级为 note_chunks 全表 LIKE 兜底，保正确性（结果结构不变）。
 */
async function searchChunksV2(
	db: DbContext,
	q: string,
	input: SearchInput,
	limit: number,
	hasSourceFilter: boolean,
): Promise<SearchOutput> {
	const codePoints = Array.from(q).length;

	if (codePoints < 3) {
		const sql = hasSourceFilter
			? `
        SELECT nc.id AS chunk_id, nc.content AS content
        FROM note_chunks nc
        WHERE nc.content LIKE ? ESCAPE '\\' AND nc.source_id = ?
        ORDER BY nc.updated_at DESC
        LIMIT ?
      `
			: `
        SELECT nc.id AS chunk_id, nc.content AS content
        FROM note_chunks nc
        WHERE nc.content LIKE ? ESCAPE '\\'
        ORDER BY nc.updated_at DESC
        LIMIT ?
      `;
		const pattern = `%${escapeLikePattern(q)}%`;
		const args: Array<string | number> = hasSourceFilter
			? [pattern, input.source_id as string, limit]
			: [pattern, limit];
		const result = await db.client.execute({ sql, args });

		const rows = result.rows as Array<Record<string, unknown>>;
		return rows.map((r) => {
			const content = String(r.content ?? "");
			const idx = Math.max(0, normalize(content).indexOf(q));
			return {
				chunk_id: String(r.chunk_id),
				content,
				score: 1 / (1 + idx),
				snippet: buildSnippet(content, idx, q.length),
			};
		});
	}

	const sql = hasSourceFilter
		? `
      SELECT
        nc.id AS chunk_id,
        nc.content AS content,
        bm25(note_chunks_fts_v2) AS rank,
        snippet(note_chunks_fts_v2, 0, '…', '…', '', 12) AS snippet
      FROM note_chunks_fts_v2
      JOIN note_chunks nc ON nc.rowid = note_chunks_fts_v2.rowid
      WHERE note_chunks_fts_v2 MATCH ? AND nc.source_id = ?
      ORDER BY rank
      LIMIT ?
    `
		: `
      SELECT
        nc.id AS chunk_id,
        nc.content AS content,
        bm25(note_chunks_fts_v2) AS rank,
        snippet(note_chunks_fts_v2, 0, '…', '…', '', 12) AS snippet
      FROM note_chunks_fts_v2
      JOIN note_chunks nc ON nc.rowid = note_chunks_fts_v2.rowid
      WHERE note_chunks_fts_v2 MATCH ?
      ORDER BY rank
      LIMIT ?
    `;

	const match = toFtsPhraseQuery(q);
	const args: Array<string | number> = hasSourceFilter
		? [match, input.source_id as string, limit]
		: [match, limit];
	const result = await db.client.execute({ sql, args });

	const rows = result.rows as Array<Record<string, unknown>>;
	return rows.map((r) => {
		const rank = Number(r.rank ?? 0);
		return {
			chunk_id: String(r.chunk_id),
			content: String(r.content ?? ""),
			score: 1 / (1 + Math.max(0, rank)),
			snippet: String(r.snippet ?? ""),
		};
	});
}

export async function searchChunksFromDb(
	db: DbContext,
	input: SearchInput,
): Promise<SearchOutput> {
	const q = normalize(input.query);
	if (!q) return [];

	const limit = Math.max(1, input.limit ?? 10);
	const hasSourceFilter =
		typeof input.source_id === "string" && input.source_id.length > 0;

	// D1：fts_version=2 表示 trigram 新表（note_chunks_fts_v2）已回填完成，
	// 中文查询走新表；否则继续走旧 unicode61 表（回填期间旧表仍是完整索引）。
	const ftsVersion = await getActiveFtsVersion(db);
	if (ftsVersion >= 2) {
		return searchChunksV2(db, q, input, limit, hasSourceFilter);
	}

	const sql = hasSourceFilter
		? `
      SELECT
        nc.id AS chunk_id,
        nc.content AS content,
        bm25(note_chunks_fts) AS rank,
        snippet(note_chunks_fts, 1, '…', '…', '', 12) AS snippet
      FROM note_chunks_fts
      JOIN note_chunks nc ON note_chunks_fts.chunk_id = nc.id
      WHERE note_chunks_fts MATCH ? AND nc.source_id = ?
      ORDER BY rank
      LIMIT ?
    `
		: `
      SELECT
        nc.id AS chunk_id,
        nc.content AS content,
        bm25(note_chunks_fts) AS rank,
        snippet(note_chunks_fts, 1, '…', '…', '', 12) AS snippet
      FROM note_chunks_fts
      JOIN note_chunks nc ON note_chunks_fts.chunk_id = nc.id
      WHERE note_chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;

	const args: Array<string | number> = hasSourceFilter
		? [q, input.source_id as string, limit]
		: [q, limit];
	const result = await db.client.execute({ sql, args });

	const rows = result.rows as Array<Record<string, unknown>>;
	return rows.map((r) => {
		const rank = Number(r.rank ?? 0);
		const score = 1 / (1 + Math.max(0, rank));
		return {
			chunk_id: String(r.chunk_id),
			content: String(r.content ?? ""),
			score,
			snippet: String(r.snippet ?? ""),
		};
	});
}

export async function searchChunks(
	db: DbContext,
	input: SearchInput,
): Promise<SearchOutput> {
	try {
		const fromDb = await searchChunksFromDb(db, input);
		if (fromDb.length > 0) return fromDb;
	} catch {}

	return searchChunksFromClipInbox(input);
}
