import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
	findReaderAnchorTarget,
	getReaderScrollContainer,
	normalizeReaderHref,
	resolveReaderInternalHref,
	scrollToReaderTarget,
} from "./textNavigation";
import type { ReaderEngineProps, ReaderEngineSelection } from "./types";

function sanitize(html: string): string {
	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		ADD_ATTR: ["data-cfi", "data-page", "data-locator"],
	});
}

function getCharacterOffsetWithin(root: HTMLElement, range: Range): number {
	const pre = root.ownerDocument!.createRange();
	pre.selectNodeContents(root);
	pre.setEnd(range.startContainer, range.startOffset);
	return pre.toString().length;
}

/** 通用文本引擎：负责 EPUB / TXT / MD / HTML / DOCX 章节的渲染、滚动跟踪、划词上报。 */
export default function TextEngine({
	book,
	chapter,
	requestedChapterId,
	typography,
	onPositionChange,
	seekPercentRequest,
	onRequestNavigate,
	onSelectionChange,
	onUserActivity,
	className,
}: ReaderEngineProps) {
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const articleRef = useRef<HTMLDivElement | null>(null);
	const isPaged = typography.columnCount === 2;

	const cleanedHtml = useMemo(() => {
		if (chapter?.html) return sanitize(chapter.html);
		if (chapter?.text) {
			const escape = (s: string) =>
				s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
			return chapter.text
				.split(/\n{2,}/)
				.map((p) => `<p>${escape(p.trim())}</p>`)
				.join("\n");
		}
		return "";
	}, [chapter?.html, chapter?.text]);

	// 进度上报：滚动百分比 → 父组件
	useEffect(() => {
		const engine = scrollRef.current;
		if (!engine || !chapter) return;
		const scroll = isPaged ? engine : getReaderScrollContainer(engine);
		let raf = 0;
		const onScroll = () => {
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				const current = isPaged ? scroll.scrollLeft : scroll.scrollTop;
				const max = Math.max(
					1,
					isPaged
						? scroll.scrollWidth - scroll.clientWidth
						: scroll.scrollHeight - scroll.clientHeight,
				);
				const pct = Math.max(0, Math.min(1, current / max));
				const locator = `chapter:${chapter.id}:scroll:${Math.round(pct * 1000) / 1000}`;
				onPositionChange?.(locator, pct);
				onUserActivity?.();
			});
		};
		scroll.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			scroll.removeEventListener("scroll", onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	}, [chapter, isPaged, onPositionChange, onUserActivity]);

	// 切章 → 滚到顶部
	useEffect(() => {
		const engine = scrollRef.current;
		if (!engine || !chapter) return;
		const scroll = isPaged ? engine : getReaderScrollContainer(engine);
		scroll.scrollTo({ left: 0, top: 0, behavior: "instant" });
	}, [chapter?.id, isPaged]);

	// 双页模式下，普通鼠标滚轮向下应翻到后续页组，而不是在不可滚动的纵向方向空转。
	useEffect(() => {
		const engine = scrollRef.current;
		if (!engine || !isPaged) return;
		const onWheel = (event: WheelEvent) => {
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
			event.preventDefault();
			engine.scrollLeft += event.deltaY;
			onUserActivity?.();
		};
		engine.addEventListener("wheel", onWheel, { passive: false });
		return () => engine.removeEventListener("wheel", onWheel);
	}, [isPaged, onUserActivity]);

	// 底部进度条拖动：按当前阅读模式映射到纵向滚动或横向页组位置。
	useEffect(() => {
		const engine = scrollRef.current;
		if (!engine || !chapter || !seekPercentRequest) return;
		const scroll = isPaged ? engine : getReaderScrollContainer(engine);
		const pct = Math.max(0, Math.min(1, seekPercentRequest.percent));
		const max = Math.max(
			0,
			isPaged
				? scroll.scrollWidth - scroll.clientWidth
				: scroll.scrollHeight - scroll.clientHeight,
		);
		scroll.scrollTo({
			left: isPaged ? max * pct : 0,
			top: isPaged ? 0 : max * pct,
			behavior: "instant",
		});
		onPositionChange?.(
			`chapter:${chapter.id}:scroll:${Math.round(pct * 1000) / 1000}`,
			pct,
		);
	}, [chapter, isPaged, onPositionChange, seekPercentRequest]);

	// EPUB/HTML 内部目录链接：拦截默认导航，留在阅读器内切章/滚动。
	useEffect(() => {
		const article = articleRef.current;
		const engine = scrollRef.current;
		if (!article || !engine) return;

		const onClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const link = target.closest("a[href]") as HTMLAnchorElement | null;
			if (!link || !article.contains(link)) return;
			const href = link.getAttribute("href");
			if (!href) return;

			const nextChapterId = resolveReaderInternalHref({
				rawHref: href,
				currentChapterId: chapter?.id,
				requestedChapterId,
				toc: book.toc,
			});
			if (!nextChapterId) return;

			event.preventDefault();
			event.stopPropagation();
			onUserActivity?.();

			const [, fragment] = nextChapterId.split("#", 2);
			const currentBase = normalizeReaderHref(chapter?.id ?? "").split("#")[0];
			const nextBase = normalizeReaderHref(nextChapterId).split("#")[0];
			if (fragment && currentBase === nextBase) {
				const anchor = findReaderAnchorTarget(article, fragment);
				if (anchor) {
					scrollToReaderTarget(engine, anchor, "smooth");
					return;
				}
			}

			onRequestNavigate?.("to", nextChapterId);
		};

		article.addEventListener("click", onClick);
		return () => article.removeEventListener("click", onClick);
	}, [
		book.toc,
		chapter?.id,
		onRequestNavigate,
		onUserActivity,
		requestedChapterId,
	]);

	// 切到带片段的目录项后，等章节 HTML 落地再滚到目标锚点。
	useEffect(() => {
		const article = articleRef.current;
		const engine = scrollRef.current;
		const [, fragment] = (requestedChapterId || "").split("#", 2);
		if (!article || !engine || !fragment) return;
		const frame = requestAnimationFrame(() => {
			const anchor = findReaderAnchorTarget(article, fragment);
			if (anchor) scrollToReaderTarget(engine, anchor, "instant");
		});
		return () => cancelAnimationFrame(frame);
	}, [cleanedHtml, requestedChapterId]);

	// 划词上报（mouseup / keyup 后采样选区，避免反复触发）
	const reportSelection = useCallback(() => {
		const article = articleRef.current;
		if (!article) return onSelectionChange?.(null);
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed) return onSelectionChange?.(null);
		if (sel.rangeCount === 0) return onSelectionChange?.(null);
		const range = sel.getRangeAt(0);
		if (!article.contains(range.commonAncestorContainer)) {
			return onSelectionChange?.(null);
		}
		const text = sel.toString().trim();
		if (text.length < 2) return onSelectionChange?.(null);
		const rect = range.getBoundingClientRect();
		const start = getCharacterOffsetWithin(article, range);
		const end = start + text.length;
		const chapterId = chapter?.id ?? "unknown";
		const payload: ReaderEngineSelection = {
			text,
			rect,
			locator_start: `chapter:${chapterId}:offset:${start}`,
			locator_end: `chapter:${chapterId}:offset:${end}`,
		};
		onSelectionChange?.(payload);
	}, [chapter?.id, onSelectionChange]);

	useEffect(() => {
		const article = articleRef.current;
		if (!article) return;
		const onMouseUp = () => reportSelection();
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.shiftKey || e.key === "Shift") reportSelection();
		};
		article.addEventListener("mouseup", onMouseUp);
		article.addEventListener("keyup", onKeyUp);
		return () => {
			article.removeEventListener("mouseup", onMouseUp);
			article.removeEventListener("keyup", onKeyUp);
		};
	}, [reportSelection]);

	const articleStyle: React.CSSProperties = {
		fontFamily: typography.fontFamilyStack,
		fontSize: typography.fontSizePx,
		lineHeight: typography.lineHeight,
		letterSpacing: `${typography.letterSpacingEm}em`,
		"--reader-column-count": isPaged ? 1 : typography.columnCount,
		"--reader-column-gap": isPaged ? "clamp(2.5rem, 5vw, 5rem)" : "0px",
		maxWidth: `${typography.maxWidthCh}ch`,
		columnRuleColor: "var(--reader-border)",
	} as React.CSSProperties;

	return (
		<div
			ref={scrollRef}
			className={`reader-engine reader-engine--text ${isPaged ? "reader-engine--paged" : ""} ${className ?? ""}`}
			data-format={book.format}
		>
			<div
				ref={articleRef}
				className="reader-article"
				style={articleStyle}
				/* biome-ignore lint/security/noDangerouslySetInnerHtml: 已通过 DOMPurify 清理 */
				dangerouslySetInnerHTML={{ __html: cleanedHtml }}
			/>
		</div>
	);
}
