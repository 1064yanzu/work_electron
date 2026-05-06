import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";
import type {
	ReaderBook,
	ReaderBookmark,
	ReaderChapter,
	ReaderClientSettings,
	ReaderHighlight,
	ReaderProgress,
} from "../api/reader";

export type ReaderUiPanel = "toc" | "highlights" | "bookmarks" | "copilot";
export type ReaderLeftPanel = "toc" | "highlights" | "bookmarks";

export type ReaderState = {
	/** 当前阅读的书。null 表示阅读器关闭。 */
	openedBookId: string | null;
	book: ReaderBook | null;
	chapter: ReaderChapter | null;
	progress: ReaderProgress | null;
	highlights: ReaderHighlight[];
	bookmarks: ReaderBookmark[];
	loadingBook: boolean;
	loadingChapter: boolean;
	error: string | null;
	/** UI：左/右侧栏哪个面板展开 */
	leftPanel: Exclude<ReaderUiPanel, "copilot">;
	/** 左侧面板是否展开 */
	leftPanelOpen: boolean;
	rightPanelOpen: boolean;
	/** 沉浸模式（隐藏 chrome） */
	immersive: boolean;
	/** 设置（全局缓存） */
	settings: ReaderClientSettings | null;
	/** 当前阅读会话 id（用于结束时上报）*/
	sessionId: string | null;
	/** 字号实时调整（覆盖 settings.font_size，0 表示用默认） */
	fontSizeOverride: number | null;
};

const initialState: ReaderState = {
	openedBookId: null,
	book: null,
	chapter: null,
	progress: null,
	highlights: [],
	bookmarks: [],
	loadingBook: false,
	loadingChapter: false,
	error: null,
	leftPanel: "toc",
	leftPanelOpen: true,
	rightPanelOpen: false,
	immersive: false,
	settings: null,
	sessionId: null,
	fontSizeOverride: null,
};

const _store = createStore<ReaderState>(initialState);

export const readerStoreApi = {
	getState: _store.getState,
	subscribe: _store.subscribe,
	setOpenedBook(bookId: string | null) {
		_store.setState((s) => ({ ...s, openedBookId: bookId, error: null }));
	},
	setBook(book: ReaderBook | null) {
		_store.setState((s) => ({ ...s, book }));
	},
	setChapter(chapter: ReaderChapter | null) {
		_store.setState((s) => ({ ...s, chapter, loadingChapter: false }));
	},
	setProgress(progress: ReaderProgress | null) {
		_store.setState((s) => ({ ...s, progress }));
	},
	setHighlights(highlights: ReaderHighlight[]) {
		_store.setState((s) => ({ ...s, highlights }));
	},
	addHighlight(h: ReaderHighlight) {
		_store.setState((s) => ({ ...s, highlights: [h, ...s.highlights] }));
	},
	updateHighlight(h: ReaderHighlight) {
		_store.setState((s) => ({
			...s,
			highlights: s.highlights.map((x) => (x.id === h.id ? h : x)),
		}));
	},
	removeHighlight(id: string) {
		_store.setState((s) => ({
			...s,
			highlights: s.highlights.filter((x) => x.id !== id),
		}));
	},
	setBookmarks(bookmarks: ReaderBookmark[]) {
		_store.setState((s) => ({ ...s, bookmarks }));
	},
	addBookmark(b: ReaderBookmark) {
		_store.setState((s) => ({ ...s, bookmarks: [b, ...s.bookmarks] }));
	},
	removeBookmark(id: string) {
		_store.setState((s) => ({
			...s,
			bookmarks: s.bookmarks.filter((x) => x.id !== id),
		}));
	},
	setLoadingBook(loadingBook: boolean) {
		_store.setState((s) => ({ ...s, loadingBook }));
	},
	setLoadingChapter(loadingChapter: boolean) {
		_store.setState((s) => ({ ...s, loadingChapter }));
	},
	setError(error: string | null) {
		_store.setState((s) => ({ ...s, error, loadingBook: false }));
	},
	setLeftPanel(panel: ReaderState["leftPanel"]) {
		_store.setState((s) => ({ ...s, leftPanel: panel, leftPanelOpen: true }));
	},
	toggleLeftPanel(open?: boolean) {
		_store.setState((s) => ({
			...s,
			leftPanelOpen: typeof open === "boolean" ? open : !s.leftPanelOpen,
		}));
	},
	toggleRightPanel(open?: boolean) {
		_store.setState((s) => ({
			...s,
			rightPanelOpen: typeof open === "boolean" ? open : !s.rightPanelOpen,
		}));
	},
	toggleImmersive(value?: boolean) {
		_store.setState((s) => ({
			...s,
			immersive: typeof value === "boolean" ? value : !s.immersive,
		}));
	},
	setSettings(settings: ReaderClientSettings | null) {
		_store.setState((s) => ({ ...s, settings }));
	},
	patchSettings(patch: Partial<ReaderClientSettings>) {
		_store.setState((s) => ({
			...s,
			settings: s.settings ? { ...s.settings, ...patch } : s.settings,
		}));
	},
	setSessionId(id: string | null) {
		_store.setState((s) => ({ ...s, sessionId: id }));
	},
	setFontSizeOverride(size: number | null) {
		_store.setState((s) => ({ ...s, fontSizeOverride: size }));
	},
	reset() {
		_store.setState(() => ({ ...initialState }));
	},
};

export const useReaderStore = createUseStore(_store);
export const useReaderStoreSelector = createUseStoreSelector(_store);
