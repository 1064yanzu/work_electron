import type { IpcMainInvokeEvent } from "electron";

import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	createBookmark,
	createHighlight,
	deleteBook,
	deleteBookmark,
	deleteHighlight,
	endSession,
	exportHighlightsMarkdown,
	getBookById,
	getChapter,
	getReaderSettings,
	importBookFromPath,
	listBookmarks,
	listBooks,
	listHighlights,
	listSessions,
	openBook,
	saveProgress,
	searchGlobal,
	searchInBook,
	startSession,
	updateHighlight,
	updateReaderSettings,
} from "../../reader";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createReaderHandlers(db: DbContext) {
	return {
		reader_import_files: (async (_event, input) => {
			const paths = Array.isArray(input.paths)
				? input.paths.map((p) => String(p || "").trim()).filter(Boolean)
				: [];
			const out = [];
			for (const p of paths) {
				try {
					const book = await importBookFromPath(db, {
						filePath: p,
						project_id: input.project_id ?? null,
						folder_id: input.folder_id ?? null,
					});
					if (book) out.push(book);
				} catch (e) {
					console.warn(
						"[reader_import_files] Failed:",
						p,
						e instanceof Error ? e.message : String(e),
					);
				}
			}
			return out;
		}) satisfies Handler<"reader_import_files">,

		reader_list_books: (async (_event, input) => {
			return listBooks(db, {
				format: input.format,
				project_id: input.project_id ?? null,
				limit: input.limit,
				sort: input.sort,
			});
		}) satisfies Handler<"reader_list_books">,

		reader_get_book: (async (_event, input) => {
			return getBookById(db, input.id);
		}) satisfies Handler<"reader_get_book">,

		reader_open_book: (async (_event, input) => {
			return openBook(db, input.id);
		}) satisfies Handler<"reader_open_book">,

		reader_delete_book: (async (_event, input) => {
			return deleteBook(db, input.id);
		}) satisfies Handler<"reader_delete_book">,

		reader_get_chapter: (async (_event, input) => {
			return getChapter(db, input.book_id, input.chapter_id);
		}) satisfies Handler<"reader_get_chapter">,

		reader_save_progress: (async (_event, input) => {
			return saveProgress(db, {
				book_id: input.book_id,
				locator: input.locator,
				percent: input.percent,
				chapter_id: input.chapter_id ?? null,
			});
		}) satisfies Handler<"reader_save_progress">,

		reader_search_in_book: (async (_event, input) => {
			return searchInBook(db, input);
		}) satisfies Handler<"reader_search_in_book">,

		reader_search_global: (async (_event, input) => {
			return searchGlobal(db, input);
		}) satisfies Handler<"reader_search_global">,

		reader_list_highlights: (async (_event, input) => {
			return listHighlights(db, input.book_id);
		}) satisfies Handler<"reader_list_highlights">,

		reader_create_highlight: (async (_event, input) => {
			return createHighlight(db, input);
		}) satisfies Handler<"reader_create_highlight">,

		reader_update_highlight: (async (_event, input) => {
			return updateHighlight(db, input);
		}) satisfies Handler<"reader_update_highlight">,

		reader_delete_highlight: (async (_event, input) => {
			return deleteHighlight(db, input.id);
		}) satisfies Handler<"reader_delete_highlight">,

		reader_list_bookmarks: (async (_event, input) => {
			return listBookmarks(db, input.book_id);
		}) satisfies Handler<"reader_list_bookmarks">,

		reader_create_bookmark: (async (_event, input) => {
			return createBookmark(db, input);
		}) satisfies Handler<"reader_create_bookmark">,

		reader_delete_bookmark: (async (_event, input) => {
			return deleteBookmark(db, input.id);
		}) satisfies Handler<"reader_delete_bookmark">,

		reader_session_start: (async (_event, input) => {
			return startSession(db, input.book_id);
		}) satisfies Handler<"reader_session_start">,

		reader_session_end: (async (_event, input) => {
			return endSession(db, input);
		}) satisfies Handler<"reader_session_end">,

		reader_list_sessions: (async (_event, input) => {
			return listSessions(db, input);
		}) satisfies Handler<"reader_list_sessions">,

		reader_export_highlights: (async (_event, input) => {
			return exportHighlightsMarkdown(db, input.book_id);
		}) satisfies Handler<"reader_export_highlights">,

		reader_get_settings: (async () => {
			return getReaderSettings(db);
		}) satisfies Handler<"reader_get_settings">,

		reader_update_settings: (async (_event, input) => {
			await updateReaderSettings(db, input);
			return { success: true };
		}) satisfies Handler<"reader_update_settings">,
	};
}
