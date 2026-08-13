import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	readerAcceptDraftCards,
	readerCreateBookmark,
	readerCreateHighlight,
	readerDeleteBookmark,
	readerDeleteCard,
	readerDeleteHighlight,
	readerGetChapter,
	readerGetSettings,
	readerListBookmarks,
	readerListCards,
	readerListHighlights,
	readerOpenBook,
	readerRejectDraftCards,
	readerReviewCard,
	readerSaveProgress,
	readerSearchInBook,
	readerSessionEnd,
	readerSessionStart,
	readerUpdateCard,
	readerUpdateSettings,
} from "../../lib/api/reader";
import type {
	ReaderBookmark,
	ReaderClientSettings,
	ReaderHighlight,
	ReaderHighlightColor,
	ReaderKnowledgeCard,
	ReaderTocItem,
} from "../../lib/api/reader";
import { readerStoreApi, useReaderStore } from "../../lib/stores/readerStore";
import { useTTS } from "../../lib/tts";
import { TTSPlaybackBar } from "../tts/TTSPlaybackBar";
import { toast } from "../ui/Toast";

import EngineSelector from "./engines/EngineSelector";
import type { ReaderEngineSelection } from "./engines/types";
import { useCardGenerator } from "./hooks/useCardGenerator";
import { useReaderCopilot } from "./hooks/useReaderCopilot";
import { useReaderShortcuts } from "./hooks/useReaderShortcuts";
import { useReaderSpeech } from "./hooks/useReaderSpeech";
import { ReaderCardDraftReview } from "./ReaderCardDraftReview";
import { ReaderCardEdit } from "./ReaderCardEdit";
import { ReaderCardGenIndicator } from "./ReaderCardGenIndicator";
import { ReaderCardReview } from "./ReaderCardReview";
import { ReaderCopilot } from "./ReaderCopilot";
import { ReaderPageNav } from "./ReaderPageNav";
import { ReaderProgressBar } from "./ReaderProgressBar";
import { ReaderSearchPanel } from "./ReaderSearchPanel";
import { ReaderSelectionMenu } from "./ReaderSelectionMenu";
import { ReaderTOC } from "./ReaderTOC";
import { ReaderTopBar } from "./ReaderTopBar";
import {
	getReaderFontStack,
	getReaderTheme,
	READER_THEMES,
} from "./themes/readerThemes";

type Props = {
	bookId: string;
	onRequestClose: () => void;
	onOpenSettings: () => void;
};

const PROGRESS_FLUSH_MS = 600;

function flatToc(toc: ReaderTocItem[]): ReaderTocItem[] {
	const out: ReaderTocItem[] = [];
	const walk = (arr: ReaderTocItem[]) => {
		for (const t of arr) {
			out.push(t);
			if (t.children) walk(t.children);
		}
	};
	walk(toc);
	return out;
}

export function ReaderShell({ bookId, onRequestClose, onOpenSettings }: Props) {
	const state = useReaderStore();
	const {
		book,
		chapter,
		highlights,
		bookmarks,
		cards,
		draftCards,
		draftReviewOpen,
		cardReviewOpen,
		cardReviewIndex,
		cardReviewMode,
		settings,
		leftPanel,
		leftPanelOpen,
		rightPanelOpen,
		immersive,
		fontSizeOverride,
		loadingBook,
		loadingChapter,
		error,
	} = state;

	const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
	const [percent, setPercent] = useState(0);
	const [selection, setSelection] = useState<ReaderEngineSelection | null>(
		null,
	);
	const [searchOpen, setSearchOpen] = useState(false);
	const [seekPercentRequest, setSeekPercentRequest] = useState<{
		percent: number;
		nonce: number;
	} | null>(null);
	const [seekRequest, setSeekRequest] = useState<
		| { kind: "percent"; percent: number; nonce: number }
		| { kind: "offset"; offset: number; nonce: number }
		| { kind: "pdfPage"; page: number; nonce: number }
		| null
	>(null);
	// 待 seek：解析 locator 后若发现需要切章（且当前章节还没就绪），先把请求挂在这里，
	// 等 chapter.id 变成期望值再下发；避免「切章 → 章节渲染 → 旧 seekRequest 已经触发了空跳」的竞态
	const pendingSeekRef = useRef<{
		chapterId: string;
		seek:
			| { kind: "offset"; offset: number; nonce: number }
			| { kind: "pdfPage"; page: number; nonce: number }
			| { kind: "percent"; percent: number; nonce: number };
	} | null>(null);

	const [editingCard, setEditingCard] = useState<ReaderKnowledgeCard | null>(
		null,
	);
	const cardGenerator = useCardGenerator({
		book,
		cardGenModel: settings?.card_gen_model,
	});

	const tts = useTTS({ scope: "reader" });
	// 阅读器分段朗读：从用户当前可见段落开始，按段切分送 TTS，避免一次性合成整章
	const readerSpeech = useReaderSpeech({
		chapterKey: chapter?.id ?? null,
		isPaged: (settings?.column_count ?? 1) === 2,
		hasContent: Boolean(chapter?.text || chapter?.html),
	});
	const copilot = useReaderCopilot({
		book,
		chapter,
		contextScope: settings?.ai_context_scope ?? "chapter",
	});

	const progressFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastReportedRef = useRef<{ locator: string; pct: number } | null>(null);
	const sessionPagesRef = useRef(0);
	const chromeHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 1. 初始化：加载书 + 设置 + 高亮 / 书签 / 进度 + 启动会话
	useEffect(() => {
		let cancelled = false;
		(async () => {
			readerStoreApi.setLoadingBook(true);
			try {
				const settingsData = await readerGetSettings();
				if (!cancelled) readerStoreApi.setSettings(settingsData);

				const { book, progress } = await readerOpenBook(bookId);
				if (cancelled) return;
				readerStoreApi.setBook(book);
				readerStoreApi.setProgress(progress);

				const session = await readerSessionStart(bookId);
				if (cancelled) return;
				readerStoreApi.setSessionId(session.id);
				sessionPagesRef.current = 0;

				const [hs, bms, crds] = await Promise.all([
					readerListHighlights(bookId),
					readerListBookmarks(bookId),
					readerListCards(bookId),
				]);
				if (cancelled) return;
				readerStoreApi.setHighlights(hs);
				readerStoreApi.setBookmarks(bms);
				readerStoreApi.setCards(crds);

				const initialChapterId =
					progress?.chapter_id ||
					book.toc[0]?.href ||
					book.toc[0]?.id ||
					"chunk-0";
				setActiveChapterId(initialChapterId);
				setPercent(progress?.percent || 0);
			} catch (e) {
				if (!cancelled) {
					readerStoreApi.setError(e instanceof Error ? e.message : String(e));
				}
			} finally {
				if (!cancelled) readerStoreApi.setLoadingBook(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [bookId]);

	// 2. 卸载时上报会话结束
	useEffect(() => {
		return () => {
			const id = readerStoreApi.getState().sessionId;
			if (id) {
				readerSessionEnd({
					session_id: id,
					pages_read: sessionPagesRef.current,
				}).catch(() => {});
			}
			if (progressFlushRef.current) clearTimeout(progressFlushRef.current);
			if (chromeHideRef.current) clearTimeout(chromeHideRef.current);
			tts.stop();
			readerStoreApi.setBook(null);
			readerStoreApi.setChapter(null);
			readerStoreApi.setProgress(null);
			readerStoreApi.setHighlights([]);
			readerStoreApi.setBookmarks([]);
			readerStoreApi.setCards([]);
			readerStoreApi.setSessionId(null);
			readerStoreApi.setError(null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// 3. 章节内容加载
	useEffect(() => {
		if (!book || !activeChapterId) return;
		let cancelled = false;
		readerStoreApi.setLoadingChapter(true);
		(async () => {
			try {
				const c = await readerGetChapter(book.id, activeChapterId);
				if (!cancelled) readerStoreApi.setChapter(c);
				sessionPagesRef.current += 1;
			} catch (e) {
				console.warn("[reader] load chapter failed", e);
				if (!cancelled) {
					readerStoreApi.setLoadingChapter(false);
					const msg = e instanceof Error ? e.message : String(e);
					readerStoreApi.setError(msg);
					toast.error(`章节加载失败：${msg}`);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [book?.id, activeChapterId]);

	// 4. 应用主题 / 字体 / 字号 → CSS 变量
	const theme = useMemo(
		() => getReaderTheme(settings?.theme ?? "paperwhite"),
		[settings?.theme],
	);
	const cssVars = useMemo(() => {
		const fontFamilyStack = getReaderFontStack(
			settings?.font_family ?? "serif-cn",
		);
		const fontSize = fontSizeOverride ?? settings?.font_size ?? 17;
		const columnCount = settings?.column_count ?? 1;
		const maxWidthCh = settings?.max_width_ch ?? 70;
		return {
			...theme.tokens,
			"--reader-font-family": fontFamilyStack,
			"--reader-font-size": `${fontSize}px`,
			"--reader-line-height": String(settings?.line_height ?? 1.75),
			"--reader-letter-spacing": `${settings?.letter_spacing ?? 0.01}em`,
			"--reader-max-width": `${maxWidthCh}ch`,
			"--reader-layout-width":
				columnCount === 2
					? `calc(${maxWidthCh * 2}ch + clamp(2.5rem, 5vw, 5rem))`
					: `${maxWidthCh}ch`,
		} as React.CSSProperties;
	}, [theme, settings, fontSizeOverride]);

	// 5. 进度上报（节流）
	const handlePositionChange = useCallback(
		(locator: string, pct: number) => {
			setPercent(pct);
			lastReportedRef.current = { locator, pct };
			if (progressFlushRef.current) clearTimeout(progressFlushRef.current);
			progressFlushRef.current = setTimeout(async () => {
				const last = lastReportedRef.current;
				if (!book || !last) return;
				try {
					await readerSaveProgress({
						book_id: book.id,
						locator: last.locator,
						percent: last.pct,
						chapter_id: activeChapterId,
					});
				} catch {}
			}, PROGRESS_FLUSH_MS);
		},
		[book, activeChapterId],
	);
	const handleProgressSeek = useCallback((nextPercent: number) => {
		const pct = Math.max(0, Math.min(1, nextPercent));
		setPercent(pct);
		setSeekPercentRequest({ percent: pct, nonce: Date.now() });
	}, []);

	// 6. chrome 自动隐藏（沉浸模式 OR 用户静止）
	const [chromeHidden, setChromeHidden] = useState(false);
	const onUserActivity = useCallback(() => {
		setChromeHidden(false);
		if (chromeHideRef.current) clearTimeout(chromeHideRef.current);
		const delay = settings?.auto_hide_chrome_ms ?? 1200;
		if (immersive && delay > 0) {
			chromeHideRef.current = setTimeout(() => setChromeHidden(true), delay);
		}
	}, [immersive, settings?.auto_hide_chrome_ms]);
	useEffect(() => {
		if (!immersive) {
			setChromeHidden(false);
			if (chromeHideRef.current) clearTimeout(chromeHideRef.current);
			return;
		}
		// 进入沉浸：先显示，1.2s 后隐藏（除非用户继续动）
		onUserActivity();
	}, [immersive, onUserActivity]);

	// 7. 划词 / 高亮 操作
	const onSelectionChange = useCallback((sel: ReaderEngineSelection | null) => {
		setSelection(sel);
	}, []);

	const handleHighlight = useCallback(
		async (color: ReaderHighlightColor) => {
			if (!book || !selection) return;
			try {
				const created = await readerCreateHighlight({
					book_id: book.id,
					locator_start: selection.locator_start,
					locator_end: selection.locator_end,
					text: selection.text,
					color,
				});
				readerStoreApi.addHighlight(created);
				toast.success("已加高亮");
				setSelection(null);
				window.getSelection()?.removeAllRanges();
			} catch (e) {
				toast.error(
					`加高亮失败：${e instanceof Error ? e.message : String(e)}`,
				);
			}
		},
		[book, selection],
	);

	const handleRemoveHighlight = useCallback(async (id: string) => {
		try {
			await readerDeleteHighlight(id);
			readerStoreApi.removeHighlight(id);
		} catch {}
	}, []);

	const handleAddBookmark = useCallback(async () => {
		if (!book) return;
		try {
			const last = lastReportedRef.current;
			const locator =
				last?.locator ||
				`chapter:${activeChapterId}:scroll:${(percent || 0).toFixed(3)}`;
			const created = await readerCreateBookmark({
				book_id: book.id,
				locator,
				label: chapter?.title || "未命名书签",
			});
			readerStoreApi.addBookmark(created);
			toast.success("已加书签");
		} catch (e) {
			toast.error(`加书签失败：${e instanceof Error ? e.message : String(e)}`);
		}
	}, [book, activeChapterId, percent, chapter?.title]);

	const handleRemoveBookmark = useCallback(async (id: string) => {
		try {
			await readerDeleteBookmark(id);
			readerStoreApi.removeBookmark(id);
		} catch {}
	}, []);

	// 知识卡片 CRUD
	const handleRemoveCard = useCallback(async (id: string) => {
		try {
			await readerDeleteCard(id);
			readerStoreApi.removeCard(id);
			// 如果正在复习且删的是当前卡片，调整 index
			const state = readerStoreApi.getState();
			if (state.cardReviewOpen && state.cards.length > 0) {
				const newIdx = Math.min(state.cardReviewIndex, state.cards.length - 1);
				readerStoreApi.setCardReviewIndex(newIdx);
			} else if (state.cards.length === 0) {
				readerStoreApi.closeCardReview();
			}
		} catch {}
	}, []);

	const handleEditCardSave = useCallback(
		async (id: string, question: string, answer: string) => {
			try {
				const updated = await readerUpdateCard({ id, question, answer });
				readerStoreApi.updateCard(updated);
				setEditingCard(null);
				toast.success("卡片已更新");
			} catch (e) {
				toast.error(`更新失败：${e instanceof Error ? e.message : String(e)}`);
			}
		},
		[],
	);

	const handleGenerateFromSelection = useCallback(() => {
		if (!selection || !book) return;
		const text = selection.text;
		const locator = selection.locator_start ?? selection.locator_end ?? null;
		setSelection(null);
		window.getSelection()?.removeAllRanges();
		const count = settings?.card_default_count_selection ?? 5;
		// 生成时不再强制切换左侧栏，避免打断阅读节奏；
		// 进度通过右下角浮窗显示，结果通过草稿审核抽屉弹出。
		cardGenerator.generate(text, count, {
			chapterId: chapter?.id ?? null,
			locator,
			sourceText: text,
		});
	}, [selection, book, chapter, cardGenerator, settings]);

	const handleGenerateFromChapter = useCallback(() => {
		if (!chapter || !book) return;
		const text = (chapter.text || "").slice(0, 4000);
		if (!text) {
			toast.error("当前章节没有可提取的文本");
			return;
		}
		const count = settings?.card_default_count_chapter ?? 8;
		cardGenerator.generate(text, count, {
			chapterId: chapter.id ?? null,
			locator: null,
			sourceText: null,
		});
	}, [chapter, book, cardGenerator, settings]);

	// 草稿审核：接受 / 丢弃
	const handleAcceptDrafts = useCallback(async (ids: string[]) => {
		if (ids.length === 0) return;
		try {
			await readerAcceptDraftCards(ids);
			const accepted = readerStoreApi
				.getState()
				.draftCards.filter((c) => ids.includes(c.id))
				.map((c) => ({ ...c, status: "active" as const }));
			readerStoreApi.removeDraftCards(ids);
			readerStoreApi.addCards(accepted);
			readerStoreApi.closeDraftReview();
			toast.success(`已接受 ${ids.length} 张卡片`);
		} catch (e) {
			toast.error(`接受失败：${e instanceof Error ? e.message : String(e)}`);
		}
	}, []);

	const handleRejectDrafts = useCallback(async (ids: string[]) => {
		if (ids.length === 0) return;
		try {
			await readerRejectDraftCards(ids);
			readerStoreApi.removeDraftCards(ids);
			const remaining = readerStoreApi.getState().draftCards.length;
			if (remaining === 0) readerStoreApi.closeDraftReview();
		} catch (e) {
			toast.error(`丢弃失败：${e instanceof Error ? e.message : String(e)}`);
		}
	}, []);

	// 复习反馈（SM-2）
	const handleReviewCard = useCallback(
		async (id: string, quality: 0 | 1 | 2) => {
			try {
				const updated = await readerReviewCard(id, quality);
				readerStoreApi.updateCard(updated);
			} catch (e) {
				toast.error(
					`复习记录失败：${e instanceof Error ? e.message : String(e)}`,
				);
			}
		},
		[],
	);

	// 进入"今日复习"模式：仅复习到期 + 未复习的卡片
	const dueCards = useMemo(() => {
		const now = Date.now();
		return cards.filter(
			(c) => c.next_review_at == null || c.next_review_at <= now,
		);
	}, [cards]);

	const handleStartDueReview = useCallback(() => {
		if (dueCards.length === 0) {
			toast.info("当前没有需要复习的卡片");
			return;
		}
		readerStoreApi.openCardReview(0, "due");
	}, [dueCards.length]);

	// 跳转到原文（用 highlight locator 或 reader engine 的 seek）
	const handleJumpToCardSource = useCallback(
		(card: ReaderKnowledgeCard) => {
			if (card.chapter_id && card.chapter_id !== activeChapterId) {
				setActiveChapterId(card.chapter_id);
			}
			readerStoreApi.closeCardReview();
			toast.info("已跳转到原文章节");
		},
		[activeChapterId],
	);

	// 8. 章节导航
	const flatTocList = useMemo(() => (book ? flatToc(book.toc) : []), [book]);
	const currentTocIndex = useMemo(
		() =>
			activeChapterId
				? flatTocList.findIndex(
						(t) => t.href === activeChapterId || t.id === activeChapterId,
					)
				: -1,
		[flatTocList, activeChapterId],
	);
	// 双栏模式下章内可能有多页，所以翻页按钮保持可用，由点击时的逻辑判定边界
	const isPaged = settings?.column_count === 2;
	const canPrev = currentTocIndex > 0 || isPaged;
	const canNext =
		(currentTocIndex >= 0 && currentTocIndex < flatTocList.length - 1) ||
		isPaged;

	/** 在 paged 模式下，翻页：返回 true 表示章内翻页成功（不切章） */
	const flipPagedEngine = useCallback(
		(direction: "prev" | "next"): boolean => {
			if ((settings?.column_count ?? 1) !== 2) return false;
			const engine = document.querySelector(
				".reader-engine--paged",
			) as HTMLElement | null;
			if (!engine) return false;
			const pageWidth = engine.clientWidth;
			if (pageWidth <= 0) return false;
			const currentLeft = engine.scrollLeft;
			const maxLeft = Math.max(0, engine.scrollWidth - pageWidth);

			if (direction === "next") {
				if (currentLeft >= maxLeft - 2) return false;
				const targetPage = Math.floor((currentLeft + 5) / pageWidth) + 1;
				engine.scrollTo({
					left: Math.min(targetPage * pageWidth, maxLeft),
					top: 0,
					behavior: "smooth",
				});
				return true;
			} else {
				if (currentLeft <= 2) return false;
				const targetPage = Math.ceil((currentLeft - 5) / pageWidth) - 1;
				engine.scrollTo({
					left: Math.max(targetPage * pageWidth, 0),
					top: 0,
					behavior: "smooth",
				});
				return true;
			}
		},
		[settings?.column_count],
	);

	const onPrevChapter = useCallback(() => {
		// paged 模式：先章内翻页，失败才切章
		if (flipPagedEngine("prev")) return;
		if (chapter?.prev_id) {
			setActiveChapterId(chapter.prev_id);
			return;
		}
		if (currentTocIndex <= 0) return;
		const target = flatTocList[currentTocIndex - 1];
		setActiveChapterId(target.href || target.id);
	}, [flipPagedEngine, chapter?.prev_id, flatTocList, currentTocIndex]);

	const onNextChapter = useCallback(() => {
		// paged 模式：先章内翻页，失败才切章
		if (flipPagedEngine("next")) return;
		if (chapter?.next_id) {
			setActiveChapterId(chapter.next_id);
			return;
		}
		if (currentTocIndex < 0 || currentTocIndex >= flatTocList.length - 1)
			return;
		const target = flatTocList[currentTocIndex + 1];
		setActiveChapterId(target.href || target.id);
	}, [flipPagedEngine, chapter?.next_id, flatTocList, currentTocIndex]);

	// 9. 设置同步（patch 后写远端）
	const onPatchSettings = useCallback(
		async (patch: Partial<ReaderClientSettings>) => {
			readerStoreApi.patchSettings(patch);
			try {
				await readerUpdateSettings(patch);
			} catch (e) {
				console.warn("[reader] persist settings failed:", e);
			}
		},
		[],
	);

	// 10. 朗读 — 走分段队列：从用户当前可见段落开始，逐段合成播放
	const onToggleTts = useCallback(() => {
		if (readerSpeech.status === "playing") {
			readerSpeech.pause();
		} else if (readerSpeech.status === "paused") {
			readerSpeech.resume();
		} else if (chapter?.text || chapter?.html) {
			readerSpeech.start();
		}
	}, [readerSpeech, chapter?.text, chapter?.html]);

	// 11. 主题循环（Y 键）
	const cycleTheme = useCallback(() => {
		const idx = READER_THEMES.findIndex((t) => t.id === settings?.theme);
		const next =
			READER_THEMES[(idx + 1 + READER_THEMES.length) % READER_THEMES.length];
		void onPatchSettings({ theme: next.id });
	}, [settings?.theme, onPatchSettings]);

	// 12. 快捷键
	// 子浮层（复习卡 / 搜索 / 卡片编辑）打开时整体禁用，避免 ←/→ 翻章、Esc 越级关闭
	useReaderShortcuts(
		{
			// Esc：沉浸模式先退沉浸，再退阅读器
			onClose: () => {
				if (readerStoreApi.getState().immersive) {
					readerStoreApi.toggleImmersive(false);
					return;
				}
				onRequestClose();
			},
			onPrevChapter,
			onNextChapter,
			onToggleImmersive: () => readerStoreApi.toggleImmersive(),
			onAddBookmark: handleAddBookmark,
			onQuickHighlight: () => handleHighlight("yellow"),
			onOpenSearch: () => setSearchOpen(true),
			onToggleCopilot: () => readerStoreApi.toggleRightPanel(),
			onToggleTts,
			onOpenToc: () => {
				if (leftPanel === "toc" && leftPanelOpen) {
					readerStoreApi.toggleLeftPanel(false);
				} else {
					readerStoreApi.setLeftPanel("toc");
				}
			},
			onOpenHighlights: () => {
				if (leftPanel === "highlights" && leftPanelOpen) {
					readerStoreApi.toggleLeftPanel(false);
				} else {
					readerStoreApi.setLeftPanel("highlights");
				}
			},
			onOpenCards: () => {
				if (leftPanel === "cards" && leftPanelOpen) {
					readerStoreApi.toggleLeftPanel(false);
				} else {
					readerStoreApi.setLeftPanel("cards");
				}
			},
			onCycleTheme: cycleTheme,
		},
		Boolean(book) && !cardReviewOpen && !searchOpen && !editingCard,
	);

	// 13. 划词 AI 路由
	const onSelectionAi = useCallback(
		(intent: "translate" | "explain" | "ask") => {
			if (!selection) return;
			readerStoreApi.toggleRightPanel(true);
			if (intent === "translate")
				copilot.send({ kind: "translate", text: selection.text });
			else if (intent === "explain")
				copilot.send({ kind: "explain", text: selection.text });
			else copilot.send({ kind: "ask", text: selection.text });
			setSelection(null);
			window.getSelection()?.removeAllRanges();
		},
		[selection, copilot],
	);

	const onSelectionCopy = useCallback(() => {
		if (!selection) return;
		void navigator.clipboard.writeText(selection.text);
		toast.success("已复制");
		setSelection(null);
		window.getSelection()?.removeAllRanges();
	}, [selection]);

	const onSelectionSpeak = useCallback(() => {
		if (!selection) return;
		void tts.speak(selection.text, { force: true });
		setSelection(null);
		window.getSelection()?.removeAllRanges();
	}, [selection, tts]);

	const onJumpToHighlight = useCallback(
		(h: ReaderHighlight) => {
			jumpToLocator(h.locator_start);
		},
		// jumpToLocator 在下方定义，eslint deps 检查能识别
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[activeChapterId],
	);

	const onJumpToBookmark = useCallback(
		(b: ReaderBookmark) => {
			jumpToLocator(b.locator);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[activeChapterId],
	);

	/**
	 * 解析 locator 并下发跳转请求。
	 *
	 * 支持的 locator 形式（与 TextEngine / PdfEngine 写入端对齐）：
	 *  - chapter:<id>:offset:<n>      → 文本章节内字符 offset 定位（高亮）
	 *  - chapter:<id>:scroll:<pct>    → 文本章节内滚动百分比定位（书签）
	 *  - pdf:page:<N>:offset-...      → PDF 第 N 页（高亮 / 书签共用）
	 *
	 * 切章 vs 章内：如果 locator 指向当前章节，立即下发 seekRequest；
	 * 否则先 setActiveChapterId，把 seek 挂到 pendingSeekRef，等章节加载完再触发。
	 */
	function jumpToLocator(locator: string): void {
		if (!locator) return;
		// PDF: pdf:page:N:offset-...
		const pdfMatch = locator.match(/^pdf:page:(\d+)/);
		if (pdfMatch) {
			const page = Number(pdfMatch[1]);
			if (!Number.isFinite(page) || page < 1) return;
			const targetChapterId = `page-${page}`;
			const nonce = Date.now();
			if (activeChapterId === targetChapterId) {
				setSeekRequest({ kind: "pdfPage", page, nonce });
			} else {
				pendingSeekRef.current = {
					chapterId: targetChapterId,
					seek: { kind: "pdfPage", page, nonce },
				};
				setActiveChapterId(targetChapterId);
			}
			return;
		}

		// chapter:<id>:offset:<n> | chapter:<id>:scroll:<pct>
		const chapterMatch = locator.match(/^chapter:(.+?):(offset|scroll):(.+)$/);
		if (!chapterMatch) return;
		const [, chapterId, kind, raw] = chapterMatch;
		const nonce = Date.now();

		if (kind === "offset") {
			const offset = Number(raw);
			if (!Number.isFinite(offset) || offset < 0) return;
			if (activeChapterId === chapterId) {
				setSeekRequest({ kind: "offset", offset, nonce });
			} else {
				pendingSeekRef.current = {
					chapterId,
					seek: { kind: "offset", offset, nonce },
				};
				setActiveChapterId(chapterId);
			}
			return;
		}

		// scroll 模式：locator 末段是 0~1 的百分比
		const pct = Math.max(0, Math.min(1, Number(raw)));
		if (!Number.isFinite(pct)) return;
		const seek = { kind: "percent" as const, percent: pct, nonce };
		if (activeChapterId === chapterId) {
			setSeekRequest(seek);
		} else {
			// 切章后由下方的 useEffect (rAF 兜底) 统一下发，避免 setInterval 轮询。
			pendingSeekRef.current = { chapterId, seek };
			setActiveChapterId(chapterId);
		}
	}

	// 书内搜索：用 useCallback 固定引用，避免搜索面板因父组件重渲染被动重查
	const handleSearchInBook = useCallback(
		async (q: string) => {
			const current = readerStoreApi.getState().book;
			return current ? readerSearchInBook(current.id, q, 50) : [];
		},
		// book 加载完成后刷新一次引用即可
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[book?.id],
	);

	// 切章后兜底：等 chapter 真正变成期望值，再把挂着的 pendingSeek 下发
	useEffect(() => {
		const pending = pendingSeekRef.current;
		if (!pending || !chapter) return;
		if (chapter.id !== pending.chapterId) return;
		// chapter 已切到目标 → 下一帧触发，等渲染稳定
		const frame = requestAnimationFrame(() => {
			setSeekRequest(pending.seek);
			pendingSeekRef.current = null;
		});
		return () => cancelAnimationFrame(frame);
	}, [chapter]);

	if (!settings) {
		return (
			<div className="reader-shell reader-shell--loading">
				<div className="reader-shell__loading-pulse" />
			</div>
		);
	}

	return (
		<div
			className={`reader-shell theme-${theme.tone} ${immersive ? "is-immersive" : ""} ${chromeHidden ? "is-chrome-hidden" : ""} ${leftPanelOpen ? "is-left-open" : ""}`}
			style={cssVars}
			onMouseMove={onUserActivity}
		>
			<ReaderTopBar
				title={book?.title || "加载中..."}
				authors={book?.authors || []}
				chapterTitle={chapter?.title || null}
				leftPanel={leftPanel}
				leftPanelOpen={leftPanelOpen}
				onSetLeftPanel={(p) => {
					if (p === leftPanel && leftPanelOpen) {
						readerStoreApi.toggleLeftPanel(false);
					} else {
						readerStoreApi.setLeftPanel(p);
					}
				}}
				immersive={immersive}
				onToggleImmersive={() => readerStoreApi.toggleImmersive()}
				rightPanelOpen={rightPanelOpen}
				onToggleRightPanel={() => readerStoreApi.toggleRightPanel()}
				onAddBookmark={handleAddBookmark}
				onClose={onRequestClose}
				settings={settings}
				onPatchSettings={onPatchSettings}
				onOpenSearch={() => setSearchOpen(true)}
				onOpenSettings={onOpenSettings}
				onToggleTts={onToggleTts}
				ttsActive={
					readerSpeech.scope === "reader" && readerSpeech.status !== "idle"
				}
			/>

			<div className="reader-body">
				<ReaderTOC
					tab={leftPanel}
					toc={book?.toc || []}
					currentChapterId={activeChapterId}
					onJumpToChapter={(id) => setActiveChapterId(id)}
					highlights={highlights}
					bookmarks={bookmarks}
					onJumpToHighlight={onJumpToHighlight}
					onRemoveHighlight={handleRemoveHighlight}
					onJumpToBookmark={onJumpToBookmark}
					onRemoveBookmark={handleRemoveBookmark}
					cards={cards}
					onRemoveCard={handleRemoveCard}
					onEditCard={(c) => setEditingCard(c)}
					onReviewCards={(idx) =>
						readerStoreApi.openCardReview(idx ?? 0, "all")
					}
					onReviewDueCards={handleStartDueReview}
					onGenerateFromChapter={handleGenerateFromChapter}
					generating={cardGenerator.generating}
					extractedCount={cardGenerator.extractedCount}
					dueCount={dueCards.length}
				/>

				<main className="reader-main">
					{loadingBook || !book ? (
						<div className="reader-engine--loading">
							<div className="reader-shell__loading-pulse" />
						</div>
					) : error ? (
						<div className="reader-error">
							<div className="reader-error__icon">
								<AlertTriangle size={28} strokeWidth={1.5} aria-hidden />
							</div>
							<p className="reader-error__title">无法加载内容</p>
							<p className="reader-error__detail">
								{error.includes("FILE_MISSING")
									? "原始文件已被移动或删除，请重新导入。"
									: error}
							</p>
							<button className="reader-error__btn" onClick={onRequestClose}>
								关闭阅读器
							</button>
						</div>
					) : (
						<>
							<EngineSelector
								book={book}
								chapter={chapter}
								requestedChapterId={activeChapterId}
								typography={{
									fontFamilyStack: getReaderFontStack(settings.font_family),
									fontSizePx: fontSizeOverride ?? settings.font_size,
									lineHeight: settings.line_height,
									letterSpacingEm: settings.letter_spacing,
									columnCount: settings.column_count,
									maxWidthCh: settings.max_width_ch,
								}}
								onPositionChange={handlePositionChange}
								seekPercentRequest={seekPercentRequest}
								seekRequest={seekRequest}
								onSelectionChange={onSelectionChange}
								onUserActivity={onUserActivity}
								onRequestNavigate={(dir, id) => {
									if (dir === "to" && id) setActiveChapterId(id);
									else if (dir === "prev") onPrevChapter();
									else if (dir === "next") onNextChapter();
								}}
							/>
							<ReaderPageNav
								canPrev={canPrev}
								canNext={canNext || Boolean(chapter?.next_id)}
								onPrev={onPrevChapter}
								onNext={onNextChapter}
							/>
						</>
					)}

					{loadingChapter ? (
						<div className="reader-main__loading-overlay">章节加载中…</div>
					) : null}
				</main>

				<ReaderCopilot
					open={rightPanelOpen}
					onClose={() => readerStoreApi.toggleRightPanel(false)}
					messages={copilot.messages}
					streaming={copilot.streaming}
					onSubmit={(text) =>
						copilot.send({ kind: "freeform", question: text })
					}
					onStop={copilot.stop}
					onClear={copilot.clear}
				/>
			</div>

			<ReaderProgressBar
				percent={percent}
				chapterTitle={chapter?.title ?? null}
				onPrev={onPrevChapter}
				onNext={onNextChapter}
				canPrev={canPrev}
				canNext={canNext || Boolean(chapter?.next_id)}
				onSeek={handleProgressSeek}
			/>

			<TTSPlaybackBar scope="reader" />

			<ReaderSelectionMenu
				selection={selection}
				onHighlight={handleHighlight}
				onCopy={onSelectionCopy}
				onTranslate={() => onSelectionAi("translate")}
				onExplain={() => onSelectionAi("explain")}
				onAsk={() => onSelectionAi("ask")}
				onSpeak={onSelectionSpeak}
				onGenerateCards={handleGenerateFromSelection}
				onClose={() => setSelection(null)}
			/>

			<ReaderSearchPanel
				open={searchOpen}
				onClose={() => setSearchOpen(false)}
				onSearch={handleSearchInBook}
				onPick={(hit) => {
					setSearchOpen(false);
					if (hit.chapter_id) setActiveChapterId(hit.chapter_id);
				}}
			/>

			<ReaderCardReview
				open={cardReviewOpen}
				cards={cardReviewMode === "due" ? dueCards : cards}
				currentIndex={cardReviewIndex}
				mode={cardReviewMode}
				onClose={() => readerStoreApi.closeCardReview()}
				onPrev={() =>
					readerStoreApi.setCardReviewIndex(Math.max(0, cardReviewIndex - 1))
				}
				onNext={() => {
					const list = cardReviewMode === "due" ? dueCards : cards;
					readerStoreApi.setCardReviewIndex(
						Math.min(list.length - 1, cardReviewIndex + 1),
					);
				}}
				onDelete={handleRemoveCard}
				onEdit={(c) => {
					readerStoreApi.closeCardReview();
					setEditingCard(c);
				}}
				onReview={handleReviewCard}
				onJumpToSource={handleJumpToCardSource}
			/>

			<ReaderCardDraftReview
				open={draftReviewOpen}
				drafts={draftCards}
				onClose={() => readerStoreApi.closeDraftReview()}
				onAccept={handleAcceptDrafts}
				onReject={handleRejectDrafts}
				onEditDraft={(c) => setEditingCard(c)}
			/>

			<ReaderCardGenIndicator
				visible={cardGenerator.generating}
				count={cardGenerator.extractedCount}
				onCancel={cardGenerator.cancel}
				onOpen={() => readerStoreApi.setLeftPanel("cards")}
			/>

			<ReaderCardEdit
				card={editingCard}
				onSave={handleEditCardSave}
				onClose={() => setEditingCard(null)}
			/>
		</div>
	);
}
