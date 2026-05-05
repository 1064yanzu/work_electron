import { randomUUID } from "node:crypto";

import type { DbContext } from "../db/client";
import type {
	ReaderBookmark,
	ReaderHighlight,
	ReaderHighlightColor,
} from "../../shared/ipc-schema";

import { rowToBookmark, rowToHighlight } from "./dbRow";

const VALID_COLORS: ReaderHighlightColor[] = [
	"yellow",
	"peach",
	"sky",
	"sage",
	"lilac",
	"rose",
];

function normalizeColor(c?: ReaderHighlightColor | null): ReaderHighlightColor {
	if (c && VALID_COLORS.includes(c)) return c;
	return "yellow";
}

export async function listHighlights(
	db: DbContext,
	bookId: string,
): Promise<ReaderHighlight[]> {
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_highlights WHERE book_id = ? ORDER BY created_at DESC`,
		args: [bookId],
	});
	return res.rows.map(rowToHighlight);
}

export async function createHighlight(
	db: DbContext,
	params: {
		book_id: string;
		locator_start: string;
		locator_end: string;
		text: string;
		color?: ReaderHighlightColor;
		note?: string | null;
	},
): Promise<ReaderHighlight> {
	const id = randomUUID();
	const ts = Date.now();
	const color = normalizeColor(params.color ?? null);
	await db.client.execute({
		sql: `INSERT INTO reader_highlights (id, book_id, locator_start, locator_end, text, color, note, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			id,
			params.book_id,
			params.locator_start,
			params.locator_end,
			params.text,
			color,
			params.note ?? null,
			ts,
			ts,
		],
	});
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_highlights WHERE id = ? LIMIT 1`,
		args: [id],
	});
	return rowToHighlight(res.rows[0]);
}

export async function updateHighlight(
	db: DbContext,
	params: {
		id: string;
		color?: ReaderHighlightColor;
		note?: string | null;
	},
): Promise<ReaderHighlight> {
	const sets: string[] = [];
	const args: Array<string | number | null> = [];
	if (params.color != null) {
		sets.push("color = ?");
		args.push(normalizeColor(params.color));
	}
	if (params.note !== undefined) {
		sets.push("note = ?");
		args.push(params.note ?? null);
	}
	if (sets.length === 0) {
		const res = await db.client.execute({
			sql: `SELECT * FROM reader_highlights WHERE id = ? LIMIT 1`,
			args: [params.id],
		});
		if (!res.rows[0]) throw new Error("HIGHLIGHT_NOT_FOUND");
		return rowToHighlight(res.rows[0]);
	}
	sets.push("updated_at = ?");
	args.push(Date.now());
	args.push(params.id);
	await db.client.execute({
		sql: `UPDATE reader_highlights SET ${sets.join(", ")} WHERE id = ?`,
		args,
	});
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_highlights WHERE id = ? LIMIT 1`,
		args: [params.id],
	});
	if (!res.rows[0]) throw new Error("HIGHLIGHT_NOT_FOUND");
	return rowToHighlight(res.rows[0]);
}

export async function deleteHighlight(
	db: DbContext,
	id: string,
): Promise<{ success: boolean }> {
	await db.client.execute({
		sql: `DELETE FROM reader_highlights WHERE id = ?`,
		args: [id],
	});
	return { success: true };
}

export async function listBookmarks(
	db: DbContext,
	bookId: string,
): Promise<ReaderBookmark[]> {
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_bookmarks WHERE book_id = ? ORDER BY created_at DESC`,
		args: [bookId],
	});
	return res.rows.map(rowToBookmark);
}

export async function createBookmark(
	db: DbContext,
	params: { book_id: string; locator: string; label?: string | null },
): Promise<ReaderBookmark> {
	const id = randomUUID();
	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO reader_bookmarks (id, book_id, locator, label, created_at)
			VALUES (?, ?, ?, ?, ?)`,
		args: [id, params.book_id, params.locator, params.label ?? null, ts],
	});
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_bookmarks WHERE id = ? LIMIT 1`,
		args: [id],
	});
	return rowToBookmark(res.rows[0]);
}

export async function deleteBookmark(
	db: DbContext,
	id: string,
): Promise<{ success: boolean }> {
	await db.client.execute({
		sql: `DELETE FROM reader_bookmarks WHERE id = ?`,
		args: [id],
	});
	return { success: true };
}

export async function exportHighlightsMarkdown(
	db: DbContext,
	bookId: string,
): Promise<{ content: string; suggested_filename: string }> {
	const bookRes = await db.client.execute({
		sql: `SELECT id, title FROM reader_books WHERE id = ?`,
		args: [bookId],
	});
	const bookRow = bookRes.rows[0];
	if (!bookRow) throw new Error("BOOK_NOT_FOUND");
	const title = String(bookRow.title || "Untitled");

	const highlights = await listHighlights(db, bookId);
	const bookmarks = await listBookmarks(db, bookId);

	const lines: string[] = [];
	lines.push(`# ${title}`);
	lines.push("");
	lines.push(
		`> 由 IPO Workbench Reader 导出 · ${new Date().toLocaleString("zh-CN")}`,
	);
	lines.push("");
	if (highlights.length > 0) {
		lines.push(`## 高亮（${highlights.length}）`);
		lines.push("");
		for (const h of highlights) {
			lines.push(`### · ${h.color}`);
			lines.push("");
			lines.push("> " + h.text.replace(/\n/g, "\n> "));
			if (h.note) {
				lines.push("");
				lines.push(`**笔记**：${h.note}`);
			}
			lines.push("");
			lines.push(
				`<sub>位置：${h.locator_start}${h.locator_end !== h.locator_start ? ` → ${h.locator_end}` : ""} · ${new Date(h.created_at).toLocaleString("zh-CN")}</sub>`,
			);
			lines.push("");
		}
	}
	if (bookmarks.length > 0) {
		lines.push(`## 书签（${bookmarks.length}）`);
		lines.push("");
		for (const b of bookmarks) {
			lines.push(`- ${b.label || "未命名书签"} — \`${b.locator}\``);
		}
		lines.push("");
	}
	if (highlights.length === 0 && bookmarks.length === 0) {
		lines.push("（暂无高亮与书签）");
	}

	const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_");
	return {
		content: lines.join("\n"),
		suggested_filename: `${safeTitle}-高亮.md`,
	};
}
