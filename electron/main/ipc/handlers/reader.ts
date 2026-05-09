import type { IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";

import type { IPCSchema, ReaderBook } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	createBookmark,
	createCard,
	createDraftCards,
	createHighlight,
	deleteBook,
	deleteBookmark,
	deleteCard,
	deleteCardsBulk,
	deleteHighlight,
	endSession,
	exportHighlightsMarkdown,
	getBookById,
	getChapter,
	getReaderSettings,
	importBookFromPath,
	listAllCards,
	listBookmarks,
	listBooks,
	listCardTags,
	listCards,
	listDueCards,
	listHighlights,
	listSessions,
	openBook,
	saveProgress,
	searchGlobal,
	searchInBook,
	startSession,
	acceptDraftCards,
	rejectDraftCards,
	reviewCard,
	updateCard,
	updateCardTags,
	updateHighlight,
	updateReaderSettings,
} from "../../reader";
import { rowToBook } from "../../reader/dbRow";
import { detectFormatByExt } from "../../reader/formats/detect";

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
						skipFullTextIndex: Boolean(input.silent),
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

		reader_open_from_source: (async (_event, input) => {
			const sourceId = String(input.source_id || "").trim();
			if (!sourceId) return { book: null };

			// 1. 直接命中：reader_books.source_id = source.id
			const linked = await db.client.execute({
				sql: "SELECT * FROM reader_books WHERE source_id = ? LIMIT 1",
				args: [sourceId],
			});
			if (linked.rows.length > 0) {
				const book = rowToBook(linked.rows[0]) as ReaderBook;
				if (existsSync(book.storage_path)) {
					return { book };
				}
				// 文件丢失，尝试从 source_path 重新导入
				const sourcePath = linked.rows[0].source_path
					? String(linked.rows[0].source_path)
					: "";
				if (
					sourcePath &&
					existsSync(sourcePath) &&
					detectFormatByExt(sourcePath)
				) {
					try {
						await db.client.execute({
							sql: "DELETE FROM reader_books WHERE id = ?",
							args: [book.id],
						});
						const reimported = await importBookFromPath(db, {
							filePath: sourcePath,
							project_id: null,
							folder_id: null,
							skipFullTextIndex: true,
						});
						if (reimported) {
							await db.client.execute({
								sql: "UPDATE reader_books SET source_id = ? WHERE id = ?",
								args: [sourceId, reimported.id],
							});
							return { book: reimported };
						}
					} catch (e) {
						console.warn(
							"[reader_open_from_source] re-import from source_path failed:",
							e,
						);
					}
				}
				// 无法恢复，继续走兜底路径
			}

			// 2. 兜底：旧数据没建 reader_book —— 通过 sources.storage_path 或 note.content_html 中的 file:// 反推
			const srcRows = await db.client.execute({
				sql: "SELECT id, storage_path FROM sources WHERE id = ? LIMIT 1",
				args: [sourceId],
			});
			if (srcRows.rows.length === 0) return { book: null };

			let originalPath = srcRows.rows[0].storage_path
				? String(srcRows.rows[0].storage_path)
				: "";

			if (!originalPath || !existsSync(originalPath)) {
				originalPath = "";
				const noteRows = await db.client.execute({
					sql: "SELECT content_html FROM notes WHERE source_id = ? ORDER BY updated_at DESC LIMIT 1",
					args: [sourceId],
				});
				const html = String(noteRows.rows[0]?.content_html || "");
				const m = html.match(/data-src="(file:\/\/[^"]+)"/);
				if (m) {
					try {
						const { fileURLToPath } = await import("node:url");
						originalPath = fileURLToPath(m[1]);
					} catch {}
				}
			}

			if (!originalPath || !detectFormatByExt(originalPath)) {
				return { book: null };
			}

			try {
				const book = await importBookFromPath(db, {
					filePath: originalPath,
					project_id: null,
					folder_id: null,
					skipFullTextIndex: true,
				});
				if (!book) return { book: null };
				await db.client.execute({
					sql: "UPDATE reader_books SET source_id = ? WHERE id = ?",
					args: [sourceId, book.id],
				});
				return { book };
			} catch (e) {
				console.warn(
					"[reader_open_from_source] hydrate failed:",
					originalPath,
					e instanceof Error ? e.message : String(e),
				);
				return { book: null };
			}
		}) satisfies Handler<"reader_open_from_source">,

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

		reader_list_cards: (async (_event, input) => {
			return listCards(db, input.book_id, input.chapter_id);
		}) satisfies Handler<"reader_list_cards">,

		reader_list_all_cards: (async (_event, input) => {
			return listAllCards(db, input);
		}) satisfies Handler<"reader_list_all_cards">,

		reader_list_due_cards: (async (_event, input) => {
			return listDueCards(db, input);
		}) satisfies Handler<"reader_list_due_cards">,

		reader_list_card_tags: (async (_event, input) => {
			return listCardTags(db, input.book_id ?? null);
		}) satisfies Handler<"reader_list_card_tags">,

		reader_create_card: (async (_event, input) => {
			return createCard(db, input);
		}) satisfies Handler<"reader_create_card">,

		reader_create_draft_cards: (async (_event, input) => {
			return createDraftCards(db, input);
		}) satisfies Handler<"reader_create_draft_cards">,

		reader_accept_draft_cards: (async (_event, input) => {
			return acceptDraftCards(db, input.ids);
		}) satisfies Handler<"reader_accept_draft_cards">,

		reader_reject_draft_cards: (async (_event, input) => {
			return rejectDraftCards(db, input.ids);
		}) satisfies Handler<"reader_reject_draft_cards">,

		reader_update_card: (async (_event, input) => {
			return updateCard(db, input);
		}) satisfies Handler<"reader_update_card">,

		reader_update_card_tags: (async (_event, input) => {
			return updateCardTags(db, input);
		}) satisfies Handler<"reader_update_card_tags">,

		reader_review_card: (async (_event, input) => {
			return reviewCard(db, input);
		}) satisfies Handler<"reader_review_card">,

		reader_delete_card: (async (_event, input) => {
			return deleteCard(db, input.id);
		}) satisfies Handler<"reader_delete_card">,

		reader_delete_cards_bulk: (async (_event, input) => {
			return deleteCardsBulk(db, input.ids);
		}) satisfies Handler<"reader_delete_cards_bulk">,

		reader_generate_cards: (async (_event, input) => {
			// 实际的 LLM 流式调用由渲染进程通过 invoke_llm_stream 直接发起，
			// 此 handler 仅做入口验证，返回 started 标志。
			void input;
			return { started: true };
		}) satisfies Handler<"reader_generate_cards">,
	};
}
