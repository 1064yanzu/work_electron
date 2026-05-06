import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	readerCreateBookmark,
	readerCreateHighlight,
	readerDeleteBookmark,
	readerDeleteHighlight,
	readerGetChapter,
	readerGetSettings,
	readerListBookmarks,
	readerListHighlights,
	readerOpenBook,
	readerSaveProgress,
	readerSearchInBook,
	readerSessionEnd,
	readerSessionStart,
	readerUpdateSettings,
} from "../../lib/api/reader";
import type {
	ReaderClientSettings,
	ReaderHighlight,
	ReaderHighlightColor,
	ReaderTocItem,
} from "../../lib/api/reader";
import { readerStoreApi, useReaderStore } from "../../lib/stores/readerStore";
import { toast } from "../ui/Toast";

import EngineSelector from "./engines/EngineSelector";
import type { ReaderEngineSelection } from "./engines/types";
import { useReaderCopilot } from "./hooks/useReaderCopilot";
import { useReaderShortcuts } from "./hooks/useReaderShortcuts";
import { useReaderTTS } from "./hooks/useReaderTTS";
import { ReaderCopilot } from "./ReaderCopilot";
import { ReaderPageNav } from "./ReaderPageNav";
import { ReaderProgressBar } from "./ReaderProgressBar";
import { ReaderSearchPanel } from "./ReaderSearchPanel";
import { ReaderSelectionMenu } from "./ReaderSelectionMenu";
import { ReaderTOC } from "./ReaderTOC";
import { ReaderTopBar } from "./ReaderTopBar";
import { ReaderTTSBar } from "./ReaderTTSBar";
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

	const tts = useReaderTTS(settings?.tts_rate ?? 1.0);
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

				const [hs, bms] = await Promise.all([
					readerListHighlights(bookId),
					readerListBookmarks(bookId),
				]);
				if (cancelled) return;
				readerStoreApi.setHighlights(hs);
				readerStoreApi.setBookmarks(bms);

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
	const canPrev = currentTocIndex > 0;
	const canNext =
		currentTocIndex >= 0 && currentTocIndex < flatTocList.length - 1;
	const onPrevChapter = useCallback(() => {
		if (!canPrev) return;
		const target = flatTocList[currentTocIndex - 1];
		setActiveChapterId(target.href || target.id);
	}, [canPrev, flatTocList, currentTocIndex]);
	const onNextChapter = useCallback(() => {
		// 引擎可能已知 next_id（PDF/CBZ 章节切片）
		if (chapter?.next_id) {
			setActiveChapterId(chapter.next_id);
			return;
		}
		if (!canNext) return;
		const target = flatTocList[currentTocIndex + 1];
		setActiveChapterId(target.href || target.id);
	}, [chapter?.next_id, canNext, flatTocList, currentTocIndex]);

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

	// 10. 朗读
	const onToggleTts = useCallback(() => {
		if (tts.status === "playing" || tts.status === "paused") {
			tts.playPause();
		} else if (chapter?.text || chapter?.html) {
			const text =
				chapter.text ||
				new DOMParser().parseFromString(chapter.html || "", "text/html").body
					.textContent ||
				"";
			tts.queueText(text);
		}
	}, [tts, chapter?.text, chapter?.html]);

	// 11. 主题循环（Y 键）
	const cycleTheme = useCallback(() => {
		const idx = READER_THEMES.findIndex((t) => t.id === settings?.theme);
		const next =
			READER_THEMES[(idx + 1 + READER_THEMES.length) % READER_THEMES.length];
		void onPatchSettings({ theme: next.id });
	}, [settings?.theme, onPatchSettings]);

	// 12. 快捷键
	useReaderShortcuts(
		{
			onClose: onRequestClose,
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
			onCycleTheme: cycleTheme,
		},
		Boolean(book),
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
		tts.queueText(selection.text);
		setSelection(null);
		window.getSelection()?.removeAllRanges();
	}, [selection, tts]);

	const onJumpToHighlight = useCallback((h: ReaderHighlight) => {
		const m = h.locator_start.match(/^chapter:(.+?):/);
		if (m) {
			setActiveChapterId(m[1]);
		}
	}, []);

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
				ttsActive={tts.status !== "idle"}
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
					onJumpToBookmark={(b) => {
						const m = b.locator.match(/^chapter:(.+?):/);
						if (m) setActiveChapterId(m[1]);
					}}
					onRemoveBookmark={handleRemoveBookmark}
				/>

				<main className="reader-main">
					{loadingBook || !book ? (
						<div className="reader-shell__loading-pulse" />
					) : error ? (
						<div className="reader-error">
							<div className="reader-error__icon">⚠️</div>
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

			<ReaderTTSBar
				visible={tts.status !== "idle"}
				playing={tts.status === "playing"}
				rate={tts.rate}
				onPlayPause={tts.playPause}
				onStop={tts.stop}
				onChangeRate={tts.setRate}
			/>

			<ReaderSelectionMenu
				selection={selection}
				onHighlight={handleHighlight}
				onCopy={onSelectionCopy}
				onTranslate={() => onSelectionAi("translate")}
				onExplain={() => onSelectionAi("explain")}
				onAsk={() => onSelectionAi("ask")}
				onSpeak={onSelectionSpeak}
				onClose={() => setSelection(null)}
			/>

			<ReaderSearchPanel
				open={searchOpen}
				onClose={() => setSearchOpen(false)}
				onSearch={async (q) => (book ? readerSearchInBook(book.id, q, 50) : [])}
				onPick={(hit) => {
					setSearchOpen(false);
					if (hit.chapter_id) setActiveChapterId(hit.chapter_id);
				}}
			/>
		</div>
	);
}
