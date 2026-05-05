import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef } from "react";

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
	typography,
	onPositionChange,
	onSelectionChange,
	onUserActivity,
	className,
}: ReaderEngineProps) {
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const articleRef = useRef<HTMLDivElement | null>(null);

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
		const scroll = scrollRef.current;
		if (!scroll || !chapter) return;
		let raf = 0;
		const onScroll = () => {
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				const scrollTop = scroll.scrollTop;
				const max = Math.max(1, scroll.scrollHeight - scroll.clientHeight);
				const pct = Math.max(0, Math.min(1, scrollTop / max));
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
	}, [chapter, onPositionChange, onUserActivity]);

	// 切章 → 滚到顶部
	useEffect(() => {
		const scroll = scrollRef.current;
		if (!scroll || !chapter) return;
		scroll.scrollTo({ top: 0, behavior: "instant" });
	}, [chapter?.id]);

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
		maxWidth: `${typography.maxWidthCh}ch`,
		columnCount: typography.columnCount,
		columnGap: typography.columnCount === 2 ? "3rem" : undefined,
		columnRuleColor: "var(--reader-border)",
	};

	return (
		<div
			ref={scrollRef}
			className={`reader-engine reader-engine--text ${className ?? ""}`}
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
