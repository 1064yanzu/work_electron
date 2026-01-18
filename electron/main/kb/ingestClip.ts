import { randomUUID } from "node:crypto";
import type { ClipPayload, StoredClip } from "../clip/types";
import type { DbContext } from "../db/client";
import { chunkTextByLength } from "./chunking";
import { htmlToText } from "./htmlToText";

function resolveClipText(payload: ClipPayload) {
	if (payload.text && payload.text.trim().length > 0) return payload.text;
	if (payload.selectedText && payload.selectedText.trim().length > 0)
		return payload.selectedText;
	if (payload.html && payload.html.trim().length > 0)
		return htmlToText(payload.html);
	return "";
}

function resolveTitle(payload: ClipPayload, text: string) {
	if (payload.title && payload.title.trim().length > 0)
		return payload.title.trim();
	if (payload.url && payload.url.trim().length > 0) return payload.url.trim();
	if (text.length > 0) return text.slice(0, 80);
	return "Untitled";
}

export async function ingestClipToDb(db: DbContext, clip: StoredClip) {
	const now = Date.now();
	const text = resolveClipText(clip.payload);
	if (!text) return { ok: false as const, reason: "empty_text" as const };

	const sourceId = clip.id;
	const noteId = randomUUID();
	const title = resolveTitle(clip.payload, text);
	const kind = clip.payload.url ? "web" : "text";
	const url = clip.payload.url ?? null;

	await db.client.execute({
		sql: `
      INSERT INTO sources (id, title, kind, url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        kind=excluded.kind,
        url=excluded.url,
        updated_at=excluded.updated_at
    `,
		args: [sourceId, title, kind, url, now, now],
	});

	await db.client.execute({
		sql: `
      INSERT INTO notes (id, source_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
		args: [noteId, sourceId, text, now, now],
	});

	const chunks = chunkTextByLength(text, 800);
	for (const ch of chunks) {
		const chunkId = randomUUID();
		await db.client.execute({
			sql: `
        INSERT INTO note_chunks (id, note_id, source_id, chunk_index, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
			args: [chunkId, noteId, sourceId, ch.index, ch.content, now, now],
		});
	}

	return { ok: true as const, sourceId, noteId, chunkCount: chunks.length };
}
