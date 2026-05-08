import { randomUUID } from "node:crypto";

import type { DbContext } from "../db/client";
import type { ReaderKnowledgeCard } from "../../shared/ipc-schema";

import { rowToCard } from "./dbRow";

export async function listCards(
	db: DbContext,
	bookId: string,
	chapterId?: string,
): Promise<ReaderKnowledgeCard[]> {
	if (chapterId) {
		const res = await db.client.execute({
			sql: `SELECT * FROM reader_cards WHERE book_id = ? AND chapter_id = ? ORDER BY created_at DESC`,
			args: [bookId, chapterId],
		});
		return res.rows.map(rowToCard);
	}
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_cards WHERE book_id = ? ORDER BY created_at DESC`,
		args: [bookId],
	});
	return res.rows.map(rowToCard);
}

export async function createCard(
	db: DbContext,
	params: {
		book_id: string;
		chapter_id?: string | null;
		question: string;
		answer: string;
		source_text?: string | null;
		locator?: string | null;
	},
): Promise<ReaderKnowledgeCard> {
	const id = randomUUID();
	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO reader_cards (id, book_id, chapter_id, question, answer, source_text, locator, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			id,
			params.book_id,
			params.chapter_id ?? null,
			params.question,
			params.answer,
			params.source_text ?? null,
			params.locator ?? null,
			ts,
			ts,
		],
	});
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_cards WHERE id = ? LIMIT 1`,
		args: [id],
	});
	return rowToCard(res.rows[0]);
}

export async function updateCard(
	db: DbContext,
	params: { id: string; question?: string; answer?: string },
): Promise<ReaderKnowledgeCard> {
	const ts = Date.now();
	const sets: string[] = ["updated_at = ?"];
	const args: (string | number | null)[] = [ts];
	if (params.question !== undefined) {
		sets.push("question = ?");
		args.push(params.question);
	}
	if (params.answer !== undefined) {
		sets.push("answer = ?");
		args.push(params.answer);
	}
	args.push(params.id);
	await db.client.execute({
		sql: `UPDATE reader_cards SET ${sets.join(", ")} WHERE id = ?`,
		args,
	});
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_cards WHERE id = ? LIMIT 1`,
		args: [params.id],
	});
	return rowToCard(res.rows[0]);
}

export async function deleteCard(
	db: DbContext,
	id: string,
): Promise<{ success: boolean }> {
	await db.client.execute({
		sql: `DELETE FROM reader_cards WHERE id = ?`,
		args: [id],
	});
	return { success: true };
}

export async function deleteCardsBulk(
	db: DbContext,
	ids: string[],
): Promise<{ success: boolean; deleted: number }> {
	if (ids.length === 0) return { success: true, deleted: 0 };
	const placeholders = ids.map(() => "?").join(",");
	const res = await db.client.execute({
		sql: `DELETE FROM reader_cards WHERE id IN (${placeholders})`,
		args: ids,
	});
	return { success: true, deleted: res.rowsAffected };
}
