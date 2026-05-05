import { randomUUID } from "node:crypto";
import path from "node:path";

import type { DbContext } from "../db/client";
import type {
	ReaderBook,
	ReaderFormat,
	ReaderProgress,
	ReaderTocItem,
} from "../../shared/ipc-schema";
import { requireAbsoluteLocalPath } from "../utils/localPaths";

import { saveCoverBytes } from "./coverCache";
import { rowToBook, rowToProgress } from "./dbRow";
import { detectFormatByExt, getFormatHandler } from "./formats";
import { indexBookFullText, dropBookFullText } from "./fullTextIndex";
import { copyToBookDir, ensureReaderDirs, removeBookDir } from "./storage";

export type ImportBookResult = ReaderBook;

/**
 * 导入一本书：
 *   1. 解析格式（拿到 title / toc / full_text / cover）
 *   2. 复制原文件到 reader-library/books/<id>/
 *   3. 写封面
 *   4. 写 reader_books（包含 source_path 用于幂等）
 *   5. 全文索引（走 KB 体系：sources + notes + note_chunks）
 *
 * 幂等：如果同一 absPath 已经导入过，直接返回原 book，不重复复制 / 解析。
 */
export async function importBookFromPath(
	db: DbContext,
	params: {
		filePath: string;
		project_id?: string | null;
		folder_id?: string | null;
	},
): Promise<ImportBookResult | null> {
	const absPath = requireAbsoluteLocalPath(params.filePath);
	const format = detectFormatByExt(absPath) as ReaderFormat | null;
	if (!format) return null;

	// 幂等：source_path 命中已存在的书时，直接返回，避免重复入库与文件复制
	const existing = await db.client.execute({
		sql: `SELECT id FROM reader_books WHERE source_path = ? LIMIT 1`,
		args: [absPath],
	});
	if (existing.rows.length > 0) {
		const existingId = String(existing.rows[0].id);
		return await getBookById(db, existingId);
	}

	await ensureReaderDirs();

	const handler = getFormatHandler(format);
	const parsed = await handler.parse(absPath);

	const id = randomUUID();
	const storage_path = await copyToBookDir(id, absPath);

	let cover_path: string | null = null;
	if (parsed.cover) {
		const ext =
			parsed.cover.mime.includes("jpeg") || parsed.cover.mime.includes("jpg")
				? ".jpg"
				: parsed.cover.mime.includes("webp")
					? ".webp"
					: ".png";
		cover_path = await saveCoverBytes(id, parsed.cover.bytes, ext);
	}

	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO reader_books (id, source_id, title, authors, language, format, storage_path, source_path, cover_path, page_count, word_count, toc_json, metadata_json, added_at, last_opened_at)
			VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
		args: [
			id,
			parsed.title || path.basename(absPath, path.extname(absPath)),
			JSON.stringify(parsed.authors || []),
			parsed.language ?? null,
			format,
			storage_path,
			absPath,
			cover_path,
			parsed.page_count ?? null,
			parsed.word_count ?? null,
			JSON.stringify(parsed.toc || []),
			JSON.stringify(parsed.metadata || {}),
			ts,
		],
	});

	await indexBookFullText(db, {
		bookId: id,
		title: parsed.title,
		fullText: parsed.full_text,
		storagePath: storage_path,
		projectId: params.project_id ?? null,
		folderId: params.folder_id ?? null,
		tagsExtra: [`format:${format}`],
	});

	const created = await getBookById(db, id);
	if (!created) throw new Error("BOOK_INSERT_FAILED");
	return created;
}

export async function listBooks(
	db: DbContext,
	params: {
		format?: ReaderFormat;
		project_id?: string | null;
		limit?: number;
		sort?: "recent" | "added" | "title";
	},
): Promise<ReaderBook[]> {
	const sort = params.sort ?? "recent";
	const orderBy =
		sort === "title"
			? "title COLLATE NOCASE ASC"
			: sort === "added"
				? "added_at DESC"
				: "COALESCE(last_opened_at, added_at) DESC";

	const wheres: string[] = [];
	const args: Array<string | number> = [];
	if (params.format) {
		wheres.push("format = ?");
		args.push(params.format);
	}
	if (typeof params.project_id === "string" && params.project_id.length > 0) {
		// reader_books 不直接挂 project_id，关联 sources.project_id
		wheres.push("source_id IN (SELECT id FROM sources WHERE project_id = ?)");
		args.push(params.project_id);
	}
	const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
	const limit = Math.max(1, Math.min(500, params.limit ?? 200));
	args.push(limit);

	const result = await db.client.execute({
		sql: `SELECT * FROM reader_books ${whereSql} ORDER BY ${orderBy} LIMIT ?`,
		args,
	});
	return result.rows.map(rowToBook);
}

export async function getBookById(
	db: DbContext,
	id: string,
): Promise<ReaderBook | null> {
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_books WHERE id = ? LIMIT 1`,
		args: [id],
	});
	const row = res.rows[0];
	return row ? rowToBook(row) : null;
}

export async function openBook(
	db: DbContext,
	id: string,
): Promise<{ book: ReaderBook; progress: ReaderProgress | null }> {
	const ts = Date.now();
	await db.client.execute({
		sql: `UPDATE reader_books SET last_opened_at = ? WHERE id = ?`,
		args: [ts, id],
	});
	const book = await getBookById(db, id);
	if (!book) throw new Error("BOOK_NOT_FOUND");

	const progRes = await db.client.execute({
		sql: `SELECT * FROM reader_progress WHERE book_id = ? LIMIT 1`,
		args: [id],
	});
	const progress = progRes.rows[0] ? rowToProgress(progRes.rows[0]) : null;
	return { book, progress };
}

export async function deleteBook(
	db: DbContext,
	id: string,
): Promise<{ success: boolean }> {
	await dropBookFullText(db, id);
	await db.client.execute({
		sql: `DELETE FROM reader_books WHERE id = ?`,
		args: [id],
	});
	try {
		await removeBookDir(id);
	} catch {}
	return { success: true };
}

export async function getChapter(
	db: DbContext,
	bookId: string,
	chapterId: string,
) {
	const book = await getBookById(db, bookId);
	if (!book) throw new Error("BOOK_NOT_FOUND");
	const handler = getFormatHandler(book.format);
	const toc: ReaderTocItem[] = book.toc;
	return handler.getChapter(book.storage_path, chapterId, toc);
}
