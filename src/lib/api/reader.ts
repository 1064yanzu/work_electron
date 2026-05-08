import { safeInvoke } from "../tauriBridge";
import type {
	ReaderBook,
	ReaderBookmark,
	ReaderChapter,
	ReaderFormat,
	ReaderHighlight,
	ReaderHighlightColor,
	ReaderKnowledgeCard,
	ReaderProgress,
	ReaderSearchHit,
	ReaderSession,
} from "../../../electron/shared/ipc-schema";

export type {
	ReaderBook,
	ReaderBookmark,
	ReaderChapter,
	ReaderFormat,
	ReaderHighlight,
	ReaderHighlightColor,
	ReaderKnowledgeCard,
	ReaderProgress,
	ReaderSearchHit,
	ReaderSession,
	ReaderTocItem,
} from "../../../electron/shared/ipc-schema";

export type ReaderClientSettings = {
	theme: string;
	font_family: string;
	font_size: number;
	line_height: number;
	letter_spacing: number;
	column_count: 1 | 2;
	max_width_ch: number;
	page_transition: "slide" | "fade" | "instant";
	auto_hide_chrome_ms: number;
	default_selection_action: "explain" | "translate" | "highlight" | "ask";
	tts_provider: "system" | "openai" | "azure" | "volcano";
	tts_rate: number;
	ai_context_scope: "chapter" | "book";
	disable_notifications_while_reading: boolean;
	/** 卡片生成模型；空字符串表示使用全局活跃模型 */
	card_gen_model: string;
};

export async function readerImportFiles(payload: {
	paths: string[];
	project_id?: string | null;
	folder_id?: string | null;
	silent?: boolean;
}): Promise<ReaderBook[]> {
	return safeInvoke<ReaderBook[]>("reader_import_files", { payload });
}

export async function readerListBooks(
	payload: {
		format?: ReaderFormat;
		project_id?: string | null;
		limit?: number;
		sort?: "recent" | "added" | "title";
	} = {},
): Promise<ReaderBook[]> {
	return safeInvoke<ReaderBook[]>("reader_list_books", { payload });
}

export async function readerGetBook(id: string): Promise<ReaderBook | null> {
	return safeInvoke<ReaderBook | null>("reader_get_book", { payload: { id } });
}

export async function readerOpenBook(
	id: string,
): Promise<{ book: ReaderBook; progress: ReaderProgress | null }> {
	return safeInvoke("reader_open_book", { payload: { id } });
}

export async function readerOpenFromSource(
	source_id: string,
): Promise<{ book: ReaderBook | null }> {
	return safeInvoke("reader_open_from_source", {
		payload: { source_id },
	});
}

export async function readerDeleteBook(
	id: string,
): Promise<{ success: boolean }> {
	return safeInvoke("reader_delete_book", { payload: { id } });
}

export async function readerGetChapter(
	bookId: string,
	chapterId: string,
): Promise<ReaderChapter> {
	return safeInvoke<ReaderChapter>("reader_get_chapter", {
		payload: { book_id: bookId, chapter_id: chapterId },
	});
}

export async function readerSaveProgress(payload: {
	book_id: string;
	locator: string;
	percent: number;
	chapter_id?: string | null;
}): Promise<ReaderProgress> {
	return safeInvoke("reader_save_progress", { payload });
}

export async function readerSearchInBook(
	bookId: string,
	query: string,
	limit?: number,
): Promise<ReaderSearchHit[]> {
	return safeInvoke("reader_search_in_book", {
		payload: { book_id: bookId, query, limit },
	});
}

export async function readerSearchGlobal(
	query: string,
	limit?: number,
): Promise<ReaderSearchHit[]> {
	return safeInvoke("reader_search_global", { payload: { query, limit } });
}

export async function readerListHighlights(
	bookId: string,
): Promise<ReaderHighlight[]> {
	return safeInvoke("reader_list_highlights", { payload: { book_id: bookId } });
}

export async function readerCreateHighlight(payload: {
	book_id: string;
	locator_start: string;
	locator_end: string;
	text: string;
	color?: ReaderHighlightColor;
	note?: string | null;
}): Promise<ReaderHighlight> {
	return safeInvoke("reader_create_highlight", { payload });
}

export async function readerUpdateHighlight(payload: {
	id: string;
	color?: ReaderHighlightColor;
	note?: string | null;
}): Promise<ReaderHighlight> {
	return safeInvoke("reader_update_highlight", { payload });
}

export async function readerDeleteHighlight(
	id: string,
): Promise<{ success: boolean }> {
	return safeInvoke("reader_delete_highlight", { payload: { id } });
}

export async function readerListBookmarks(
	bookId: string,
): Promise<ReaderBookmark[]> {
	return safeInvoke("reader_list_bookmarks", { payload: { book_id: bookId } });
}

export async function readerCreateBookmark(payload: {
	book_id: string;
	locator: string;
	label?: string | null;
}): Promise<ReaderBookmark> {
	return safeInvoke("reader_create_bookmark", { payload });
}

export async function readerDeleteBookmark(
	id: string,
): Promise<{ success: boolean }> {
	return safeInvoke("reader_delete_bookmark", { payload: { id } });
}

export async function readerSessionStart(
	bookId: string,
): Promise<ReaderSession> {
	return safeInvoke("reader_session_start", { payload: { book_id: bookId } });
}

export async function readerSessionEnd(payload: {
	session_id: string;
	pages_read?: number;
}): Promise<ReaderSession> {
	return safeInvoke("reader_session_end", { payload });
}

export async function readerListSessions(
	payload: { book_id?: string; days?: number; limit?: number } = {},
): Promise<ReaderSession[]> {
	return safeInvoke("reader_list_sessions", { payload });
}

export async function readerExportHighlights(
	bookId: string,
): Promise<{ content: string; suggested_filename: string }> {
	return safeInvoke("reader_export_highlights", {
		payload: { book_id: bookId },
	});
}

export async function readerGetSettings(): Promise<ReaderClientSettings> {
	return safeInvoke("reader_get_settings", { payload: {} });
}

export async function readerUpdateSettings(
	patch: Partial<ReaderClientSettings>,
): Promise<{ success: boolean }> {
	return safeInvoke("reader_update_settings", { payload: patch });
}

export async function readerListCards(
	bookId: string,
	chapterId?: string,
): Promise<ReaderKnowledgeCard[]> {
	return safeInvoke("reader_list_cards", {
		payload: {
			book_id: bookId,
			...(chapterId ? { chapter_id: chapterId } : {}),
		},
	});
}

export async function readerCreateCard(payload: {
	book_id: string;
	chapter_id?: string | null;
	question: string;
	answer: string;
	source_text?: string | null;
	locator?: string | null;
}): Promise<ReaderKnowledgeCard> {
	return safeInvoke("reader_create_card", { payload });
}

export async function readerUpdateCard(payload: {
	id: string;
	question?: string;
	answer?: string;
}): Promise<ReaderKnowledgeCard> {
	return safeInvoke("reader_update_card", { payload });
}

export async function readerDeleteCard(
	id: string,
): Promise<{ success: boolean }> {
	return safeInvoke("reader_delete_card", { payload: { id } });
}

export async function readerDeleteCardsBulk(
	ids: string[],
): Promise<{ success: boolean; deleted: number }> {
	return safeInvoke("reader_delete_cards_bulk", { payload: { ids } });
}

export async function readerGenerateCards(payload: {
	book_id: string;
	chapter_id?: string | null;
	text: string;
	count?: number;
}): Promise<{ started: boolean }> {
	return safeInvoke("reader_generate_cards", { payload });
}
