import { randomUUID } from "node:crypto";

import type { DbContext } from "../db/client";
import type {
	ReaderCardStatus,
	ReaderKnowledgeCard,
} from "../../shared/ipc-schema";

import { rowToCard } from "./dbRow";

const DAY_MS = 86_400_000;

/**
 * 列出某本书的卡片（默认仅 active 与 archived，不含 draft）。
 */
export async function listCards(
	db: DbContext,
	bookId: string,
	chapterId?: string | null,
): Promise<ReaderKnowledgeCard[]> {
	if (chapterId) {
		const res = await db.client.execute({
			sql: `SELECT * FROM reader_cards
				WHERE book_id = ? AND chapter_id = ? AND status != 'draft'
				ORDER BY created_at DESC`,
			args: [bookId, chapterId],
		});
		return res.rows.map(rowToCard);
	}
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_cards
			WHERE book_id = ? AND status != 'draft'
			ORDER BY created_at DESC`,
		args: [bookId],
	});
	return res.rows.map(rowToCard);
}

export type ListAllCardsParams = {
	book_id?: string | null;
	status?: ReaderCardStatus | null;
	due_only?: boolean | null;
	tag?: string | null;
	search?: string | null;
	limit?: number | null;
};

/**
 * 跨书查询，支持按 book / status / tag / 关键字 / due 过滤。
 */
export async function listAllCards(
	db: DbContext,
	params: ListAllCardsParams,
): Promise<ReaderKnowledgeCard[]> {
	const where: string[] = [];
	const args: (string | number)[] = [];
	const status = params.status ?? "active";
	where.push("status = ?");
	args.push(status);
	if (params.book_id) {
		where.push("book_id = ?");
		args.push(params.book_id);
	}
	if (params.due_only) {
		where.push("(next_review_at IS NULL OR next_review_at <= ?)");
		args.push(Date.now());
	}
	if (params.tag) {
		// JSON 数组按子串匹配 "tag" 形式
		where.push("tags LIKE ?");
		args.push(`%"${params.tag.replace(/"/g, '\\"')}"%`);
	}
	if (params.search?.trim()) {
		where.push("(question LIKE ? OR answer LIKE ?)");
		const kw = `%${params.search.trim()}%`;
		args.push(kw, kw);
	}
	const limit = Math.max(1, Math.min(2000, params.limit ?? 500));
	const sql = `SELECT * FROM reader_cards
		WHERE ${where.join(" AND ")}
		ORDER BY ${params.due_only ? "COALESCE(next_review_at, 0) ASC, " : ""}created_at DESC
		LIMIT ${limit}`;
	const res = await db.client.execute({ sql, args });
	return res.rows.map(rowToCard);
}

/**
 * 列出到期需要复习的卡片。
 */
export async function listDueCards(
	db: DbContext,
	params: { book_id?: string | null; limit?: number | null },
): Promise<ReaderKnowledgeCard[]> {
	return listAllCards(db, {
		book_id: params.book_id ?? null,
		status: "active",
		due_only: true,
		limit: params.limit ?? 100,
	});
}

/**
 * 列出当前所有 tag（去重，按使用频率降序，仅 active）。
 */
export async function listCardTags(
	db: DbContext,
	bookId?: string | null,
): Promise<string[]> {
	const sql = bookId
		? `SELECT tags FROM reader_cards WHERE status = 'active' AND book_id = ?`
		: `SELECT tags FROM reader_cards WHERE status = 'active'`;
	const res = await db.client.execute({
		sql,
		args: bookId ? [bookId] : [],
	});
	const counter = new Map<string, number>();
	for (const row of res.rows) {
		const raw = row.tags;
		if (typeof raw !== "string") continue;
		try {
			const arr = JSON.parse(raw);
			if (Array.isArray(arr)) {
				for (const tag of arr) {
					if (typeof tag === "string" && tag.trim()) {
						counter.set(tag, (counter.get(tag) ?? 0) + 1);
					}
				}
			}
		} catch {}
	}
	return [...counter.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([tag]) => tag);
}

export type CreateCardParams = {
	book_id: string;
	chapter_id?: string | null;
	question: string;
	answer: string;
	source_text?: string | null;
	locator?: string | null;
	tags?: string[] | null;
	status?: ReaderCardStatus | null;
	generation_session_id?: string | null;
};

async function fetchCard(
	db: DbContext,
	id: string,
): Promise<ReaderKnowledgeCard> {
	const res = await db.client.execute({
		sql: `SELECT * FROM reader_cards WHERE id = ? LIMIT 1`,
		args: [id],
	});
	return rowToCard(res.rows[0]);
}

export async function createCard(
	db: DbContext,
	params: CreateCardParams,
): Promise<ReaderKnowledgeCard> {
	const id = randomUUID();
	const ts = Date.now();
	const status: ReaderCardStatus = params.status ?? "active";
	await db.client.execute({
		sql: `INSERT INTO reader_cards
			(id, book_id, chapter_id, question, answer, source_text, locator,
			 tags, status, generation_session_id,
			 next_review_at, interval_days, ease, review_count, last_reviewed_at,
			 created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 2.5, 0, NULL, ?, ?)`,
		args: [
			id,
			params.book_id,
			params.chapter_id ?? null,
			params.question,
			params.answer,
			params.source_text ?? null,
			params.locator ?? null,
			JSON.stringify(params.tags ?? []),
			status,
			params.generation_session_id ?? null,
			ts,
			ts,
		],
	});
	return fetchCard(db, id);
}

export async function createDraftCards(
	db: DbContext,
	params: {
		book_id: string;
		chapter_id?: string | null;
		locator?: string | null;
		source_text?: string | null;
		generation_session_id: string;
		items: { question: string; answer: string }[];
	},
): Promise<ReaderKnowledgeCard[]> {
	const created: ReaderKnowledgeCard[] = [];
	for (const item of params.items) {
		const card = await createCard(db, {
			book_id: params.book_id,
			chapter_id: params.chapter_id ?? null,
			question: item.question,
			answer: item.answer,
			source_text: params.source_text ?? null,
			locator: params.locator ?? null,
			status: "draft",
			generation_session_id: params.generation_session_id,
		});
		created.push(card);
	}
	return created;
}

export async function updateCard(
	db: DbContext,
	params: {
		id: string;
		question?: string;
		answer?: string;
		tags?: string[];
		status?: ReaderCardStatus;
	},
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
	if (params.tags !== undefined) {
		sets.push("tags = ?");
		args.push(JSON.stringify(params.tags));
	}
	if (params.status !== undefined) {
		sets.push("status = ?");
		args.push(params.status);
	}
	args.push(params.id);
	await db.client.execute({
		sql: `UPDATE reader_cards SET ${sets.join(", ")} WHERE id = ?`,
		args,
	});
	return fetchCard(db, params.id);
}

export async function updateCardTags(
	db: DbContext,
	params: { id: string; tags: string[] },
): Promise<ReaderKnowledgeCard> {
	return updateCard(db, { id: params.id, tags: params.tags });
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

export async function acceptDraftCards(
	db: DbContext,
	ids: string[],
): Promise<{ accepted: number }> {
	if (ids.length === 0) return { accepted: 0 };
	const placeholders = ids.map(() => "?").join(",");
	const res = await db.client.execute({
		sql: `UPDATE reader_cards
			SET status = 'active', updated_at = ?
			WHERE id IN (${placeholders}) AND status = 'draft'`,
		args: [Date.now(), ...ids],
	});
	return { accepted: res.rowsAffected };
}

export async function rejectDraftCards(
	db: DbContext,
	ids: string[],
): Promise<{ rejected: number }> {
	if (ids.length === 0) return { rejected: 0 };
	const placeholders = ids.map(() => "?").join(",");
	const res = await db.client.execute({
		sql: `DELETE FROM reader_cards
			WHERE id IN (${placeholders}) AND status = 'draft'`,
		args: ids,
	});
	return { rejected: res.rowsAffected };
}

/**
 * SM-2 简化版：quality 0=不认识 / 1=一般 / 2=认识
 * - 不认识：interval=0（今日内重排），ease 衰减
 * - 一般：保持当前间隔
 * - 认识：按 review_count 推进或 interval × ease
 */
export async function reviewCard(
	db: DbContext,
	params: { id: string; quality: 0 | 1 | 2 },
): Promise<ReaderKnowledgeCard> {
	const current = await fetchCard(db, params.id);
	const now = Date.now();
	const reviewCount = current.review_count;
	let ease = current.ease || 2.5;
	let interval = current.interval_days || 0;

	if (params.quality === 0) {
		interval = 0;
		ease = Math.max(1.3, ease - 0.2);
	} else if (params.quality === 1) {
		// 一般：温和推进
		if (reviewCount === 0) interval = 1;
		else if (interval < 1) interval = 1;
		else interval = Math.max(1, Math.round(interval * 1.2));
	} else {
		if (reviewCount === 0) interval = 1;
		else if (reviewCount === 1) interval = 3;
		else interval = Math.max(1, Math.round(interval * ease));
		ease = Math.min(3.0, ease + 0.1);
	}

	const nextReviewAt =
		interval === 0 ? now + 10 * 60_000 : now + interval * DAY_MS;

	await db.client.execute({
		sql: `UPDATE reader_cards
			SET interval_days = ?, ease = ?, review_count = ?,
			    last_reviewed_at = ?, next_review_at = ?, updated_at = ?
			WHERE id = ?`,
		args: [
			interval,
			ease,
			reviewCount + 1,
			now,
			nextReviewAt,
			now,
			params.id,
		],
	});
	return fetchCard(db, params.id);
}
