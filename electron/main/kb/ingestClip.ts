import { randomUUID } from "node:crypto";
import type { ClipPayload, StoredClip } from "../clip/types";
import type { DbContext } from "../db/client";
import { chunkTextByLength } from "./chunking";
import { htmlToText } from "./htmlToText";
import { extractArticle } from "./extractArticle";
import { sanitizeHtml } from "./sanitizeHtml";

async function resolveClipContent(payload: ClipPayload): Promise<{
	text: string;
	html: string | null;
}> {
	if (payload.selectedText && payload.selectedText.trim().length > 0) {
		return { text: payload.selectedText.trim(), html: null };
	}

	if (payload.html && payload.html.trim().length > 0 && payload.url) {
		const extracted = await extractArticle({
			html: payload.html,
			url: payload.url,
			titleHint: payload.title,
		});
		const text =
			extracted.text.trim().length > 0
				? extracted.text.trim()
				: htmlToText(extracted.html ?? payload.html);
		const html = extracted.html ?? sanitizeHtml(payload.html);
		return { text, html };
	}

	if (payload.text && payload.text.trim().length > 0) {
		return { text: payload.text.trim(), html: null };
	}

	if (payload.html && payload.html.trim().length > 0) {
		const safeHtml = sanitizeHtml(payload.html);
		return { text: htmlToText(safeHtml), html: safeHtml };
	}

	return { text: "", html: null };
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
	const resolved = await resolveClipContent(clip.payload);
	const text = resolved.text;

	const sourceId = clip.id;
	const noteId = randomUUID();
	const title = resolveTitle(clip.payload, text);
	const kind = clip.payload.url ? "web" : "text";
	const url = clip.payload.url ?? null;
	const createdAt =
		typeof clip.payload.createdAt === "number"
			? clip.payload.createdAt
			: clip.receivedAt;
	const tagsJson = JSON.stringify(clip.payload.tags ?? []);
	const projectId = clip.payload.projectId ?? null;
	const folderId = clip.payload.folderId ?? null;
	const sourceType =
		clip.payload.source === "manual" ? "manual" : "browser_clip";
	const contentHtml = resolved.html;

	await db.client.execute({
		sql: `
      INSERT INTO sources (id, title, kind, tags, url, project_id, folder_id, source_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        kind=excluded.kind,
        tags=excluded.tags,
        url=excluded.url,
        project_id=excluded.project_id,
        folder_id=excluded.folder_id,
        source_type=excluded.source_type,
        updated_at=excluded.updated_at
    `,
		args: [
			sourceId,
			title,
			kind,
			tagsJson,
			url,
			projectId,
			folderId,
			sourceType,
			createdAt,
			now,
		],
	});

	await db.client.execute({
		sql: `
      INSERT INTO notes (id, source_id, content, content_html, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
		args: [noteId, sourceId, text, contentHtml, createdAt, now],
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
