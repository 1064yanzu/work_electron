import type { Row } from "@libsql/client";

import type {
	ReaderBook,
	ReaderBookmark,
	ReaderCardStatus,
	ReaderHighlight,
	ReaderHighlightColor,
	ReaderKnowledgeCard,
	ReaderProgress,
	ReaderSession,
	ReaderTocItem,
	ReaderFormat,
} from "../../shared/ipc-schema";

function asString(v: unknown, fallback = ""): string {
	if (typeof v === "string") return v;
	if (v == null) return fallback;
	return String(v);
}

function asNumber(v: unknown, fallback: number | null = null): number | null {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v !== "") {
		const n = Number(v);
		if (Number.isFinite(n)) return n;
	}
	return fallback;
}

function asNumberStrict(v: unknown, fallback = 0): number {
	const n = asNumber(v, null);
	return n == null ? fallback : n;
}

function parseJsonArray<T>(raw: unknown, fallback: T[] = []): T[] {
	if (typeof raw !== "string") return fallback;
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as T[]) : fallback;
	} catch {
		return fallback;
	}
}

function parseJsonObject(
	raw: unknown,
	fallback: Record<string, unknown> = {},
): Record<string, unknown> {
	if (typeof raw !== "string") return fallback;
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: fallback;
	} catch {
		return fallback;
	}
}

export function rowToBook(row: Row): ReaderBook {
	return {
		id: asString(row.id),
		source_id: row.source_id == null ? null : asString(row.source_id),
		title: asString(row.title),
		authors: parseJsonArray<string>(row.authors, []),
		language: row.language == null ? null : asString(row.language),
		format: asString(row.format) as ReaderFormat,
		storage_path: asString(row.storage_path),
		cover_path: row.cover_path == null ? null : asString(row.cover_path),
		page_count: asNumber(row.page_count),
		word_count: asNumber(row.word_count),
		toc: parseJsonArray<ReaderTocItem>(row.toc_json, []),
		metadata: parseJsonObject(row.metadata_json, {}),
		added_at: asNumberStrict(row.added_at),
		last_opened_at: asNumber(row.last_opened_at),
	};
}

export function rowToProgress(row: Row): ReaderProgress {
	return {
		book_id: asString(row.book_id),
		locator: asString(row.locator),
		percent: asNumberStrict(row.percent, 0),
		chapter_id: row.chapter_id == null ? null : asString(row.chapter_id),
		updated_at: asNumberStrict(row.updated_at),
	};
}

export function rowToHighlight(row: Row): ReaderHighlight {
	const color =
		(asString(row.color, "yellow") as ReaderHighlightColor) || "yellow";
	return {
		id: asString(row.id),
		book_id: asString(row.book_id),
		locator_start: asString(row.locator_start),
		locator_end: asString(row.locator_end),
		text: asString(row.text),
		color,
		note: row.note == null ? null : asString(row.note),
		created_at: asNumberStrict(row.created_at),
		updated_at: asNumberStrict(row.updated_at),
	};
}

export function rowToBookmark(row: Row): ReaderBookmark {
	return {
		id: asString(row.id),
		book_id: asString(row.book_id),
		locator: asString(row.locator),
		label: row.label == null ? null : asString(row.label),
		created_at: asNumberStrict(row.created_at),
	};
}

export function rowToSession(row: Row): ReaderSession {
	return {
		id: asString(row.id),
		book_id: asString(row.book_id),
		started_at: asNumberStrict(row.started_at),
		ended_at: row.ended_at == null ? null : asNumberStrict(row.ended_at),
		duration_ms: asNumberStrict(row.duration_ms, 0),
		pages_read: asNumberStrict(row.pages_read, 0),
	};
}

export function rowToCard(row: Row): ReaderKnowledgeCard {
	const rawStatus = asString(row.status, "active");
	const status: ReaderCardStatus =
		rawStatus === "draft" || rawStatus === "archived" ? rawStatus : "active";
	return {
		id: asString(row.id),
		book_id: asString(row.book_id),
		chapter_id: row.chapter_id == null ? null : asString(row.chapter_id),
		question: asString(row.question),
		answer: asString(row.answer),
		source_text: row.source_text == null ? null : asString(row.source_text),
		locator: row.locator == null ? null : asString(row.locator),
		tags: parseJsonArray<string>(row.tags, []),
		status,
		generation_session_id:
			row.generation_session_id == null
				? null
				: asString(row.generation_session_id),
		next_review_at: asNumber(row.next_review_at),
		interval_days: asNumberStrict(row.interval_days, 0),
		ease: asNumberStrict(row.ease, 2.5),
		review_count: asNumberStrict(row.review_count, 0),
		last_reviewed_at: asNumber(row.last_reviewed_at),
		created_at: asNumberStrict(row.created_at),
		updated_at: asNumberStrict(row.updated_at),
	};
}
