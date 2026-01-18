import type { IPCSchema } from "../../shared/ipc-schema";
import { createFileClipStore } from "../clip/fileClipStore";
import type { DbContext } from "../db/client";

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

export async function searchChunksFromDb(
	db: DbContext,
	input: SearchInput,
): Promise<SearchOutput> {
	const q = normalize(input.query);
	if (!q) return [];

	const limit = Math.max(1, input.limit ?? 10);
	const hasSourceFilter =
		typeof input.source_id === "string" && input.source_id.length > 0;

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
