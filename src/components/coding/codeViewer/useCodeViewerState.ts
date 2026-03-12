// useCodeViewerState - 代码查看器的本地状态管理
// 处理搜索、高亮行、滚动位置等

import { useCallback, useMemo, useRef, useState } from "react";

export interface SearchMatch {
	lineIndex: number;
	startCol: number;
	endCol: number;
}

export function useCodeViewerState(lines: string[], externalHighlightLine?: number) {
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeMatchIndex, setActiveMatchIndex] = useState(0);
	const [highlightedLines, setHighlightedLines] = useState<Set<number>>(() => {
		return externalHighlightLine != null ? new Set([externalHighlightLine]) : new Set();
	});

	const scrollContainerRef = useRef<HTMLDivElement | null>(null);

	// 计算搜索匹配
	const matches = useMemo<SearchMatch[]>(() => {
		if (!searchQuery.trim()) return [];
		const q = searchQuery.toLowerCase();
		const results: SearchMatch[] = [];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].toLowerCase();
			let start = 0;
			while (true) {
				const idx = line.indexOf(q, start);
				if (idx === -1) break;
				results.push({ lineIndex: i, startCol: idx, endCol: idx + q.length });
				start = idx + 1;
			}
		}
		return results;
	}, [lines, searchQuery]);

	const openSearch = useCallback(() => {
		setSearchOpen(true);
	}, []);

	const closeSearch = useCallback(() => {
		setSearchOpen(false);
		setSearchQuery("");
		setActiveMatchIndex(0);
	}, []);

	const updateSearchQuery = useCallback((query: string) => {
		setSearchQuery(query);
		setActiveMatchIndex(0);
	}, []);

	const goToNextMatch = useCallback(() => {
		if (matches.length === 0) return;
		setActiveMatchIndex((prev) => (prev + 1) % matches.length);
	}, [matches.length]);

	const goToPrevMatch = useCallback(() => {
		if (matches.length === 0) return;
		setActiveMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
	}, [matches.length]);

	const toggleLineHighlight = useCallback((lineNumber: number) => {
		setHighlightedLines((prev) => {
			const next = new Set(prev);
			if (next.has(lineNumber)) {
				next.delete(lineNumber);
			} else {
				next.add(lineNumber);
			}
			return next;
		});
	}, []);

	const scrollToLine = useCallback((lineNumber: number) => {
		const container = scrollContainerRef.current;
		if (!container) return;
		// 每行高度约 24px（text-[12px] leading-6）
		const lineHeight = 24;
		const targetTop = (lineNumber - 1) * lineHeight;
		container.scrollTo({ top: targetTop - container.clientHeight / 3, behavior: "smooth" });
	}, []);

	return {
		searchOpen,
		searchQuery,
		matches,
		activeMatchIndex,
		highlightedLines,
		scrollContainerRef,
		openSearch,
		closeSearch,
		updateSearchQuery,
		goToNextMatch,
		goToPrevMatch,
		toggleLineHighlight,
		scrollToLine,
	};
}
