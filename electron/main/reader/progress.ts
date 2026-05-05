import { randomUUID } from "node:crypto";

import type { DbContext } from "../db/client";
import type { ReaderProgress, ReaderSession } from "../../shared/ipc-schema";

import { rowToProgress, rowToSession } from "./dbRow";

export async function saveProgress(
	db: DbContext,
	params: {
		book_id: string;
		locator: string;
		percent: number;
		chapter_id?: string | null;
	},
): Promise<ReaderProgress> {
	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO reader_progress (book_id, locator, percent, chapter_id, updated_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(book_id) DO UPDATE SET
			  locator = excluded.locator,
			  percent = excluded.percent,
			  chapter_id = excluded.chapter_id,
			  updated_at = excluded.updated_at`,
		args: [
			params.book_id,
			params.locator,
			Math.max(0, Math.min(1, params.percent)),
			params.chapter_id ?? null,
			ts,
		],
	});
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_progress WHERE book_id = ? LIMIT 1`,
		args: [params.book_id],
	});
	return rowToProgress(res.rows[0]);
}

export async function startSession(
	db: DbContext,
	bookId: string,
): Promise<ReaderSession> {
	const id = randomUUID();
	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO reader_sessions (id, book_id, started_at, ended_at, duration_ms, pages_read)
			VALUES (?, ?, ?, NULL, 0, 0)`,
		args: [id, bookId, ts],
	});
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_sessions WHERE id = ? LIMIT 1`,
		args: [id],
	});
	return rowToSession(res.rows[0]);
}

export async function endSession(
	db: DbContext,
	params: { session_id: string; pages_read?: number },
): Promise<ReaderSession> {
	const ts = Date.now();
	const res = await db.client.execute({
		sql: `SELECT started_at FROM reader_sessions WHERE id = ?`,
		args: [params.session_id],
	});
	const startedAt = Number(res.rows[0]?.started_at) || ts;
	const duration = Math.max(0, ts - startedAt);
	await db.client.execute({
		sql: `UPDATE reader_sessions SET ended_at = ?, duration_ms = ?, pages_read = ? WHERE id = ?`,
		args: [ts, duration, params.pages_read ?? 0, params.session_id],
	});
	const res2 = await db.client.execute({
		sql: `SELECT * FROM reader_sessions WHERE id = ?`,
		args: [params.session_id],
	});
	if (!res2.rows[0]) throw new Error("SESSION_NOT_FOUND");
	return rowToSession(res2.rows[0]);
}

export async function listSessions(
	db: DbContext,
	params: { book_id?: string; days?: number; limit?: number },
): Promise<ReaderSession[]> {
	const wheres: string[] = [];
	const args: Array<string | number> = [];
	if (params.book_id) {
		wheres.push("book_id = ?");
		args.push(params.book_id);
	}
	if (typeof params.days === "number" && params.days > 0) {
		const cutoff = Date.now() - params.days * 86_400_000;
		wheres.push("started_at >= ?");
		args.push(cutoff);
	}
	const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
	const limit = Math.max(1, Math.min(2000, params.limit ?? 365));
	args.push(limit);

	const res = await db.client.execute({
		sql: `SELECT * FROM reader_sessions ${whereSql} ORDER BY started_at DESC LIMIT ?`,
		args,
	});
	return res.rows.map(rowToSession);
}
