// CodeViewerMinimap - 代码缩略图
// 显示代码结构概览，点击跳转，显示搜索匹配和高亮行标记

import { memo, useCallback, useMemo, useRef } from "react";
import type { ThemedToken } from "shiki";
import type { SearchMatch } from "./useCodeViewerState";

interface CodeViewerMinimapProps {
	lines: string[];
	tokens: ThemedToken[][] | null;
	totalLines: number;
	/** 当前可见区域的起始行 (0-based) */
	visibleStart: number;
	/** 当前可见区域的结束行 (0-based) */
	visibleEnd: number;
	/** 搜索匹配 */
	searchMatches: SearchMatch[];
	/** 高亮行集合 */
	highlightedLines: Set<number>;
	/** 点击行号回调 */
	onClickLine: (lineNumber: number) => void;
}

// minimap 中每行的渲染高度（px）
const LINE_HEIGHT = 2;
const MAX_MINIMAP_HEIGHT = 600;

function CodeViewerMinimapInner({
	lines,
	tokens,
	totalLines,
	visibleStart,
	visibleEnd,
	searchMatches,
	highlightedLines,
	onClickLine,
}: CodeViewerMinimapProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	// 搜索匹配行集合
	const matchLineSet = useMemo(() => {
		const set = new Set<number>();
		for (const m of searchMatches) set.add(m.lineIndex);
		return set;
	}, [searchMatches]);

	// 实际渲染高度
	const renderedHeight = Math.min(totalLines * LINE_HEIGHT, MAX_MINIMAP_HEIGHT);
	const scale = totalLines > 0 ? renderedHeight / (totalLines * LINE_HEIGHT) : 1;

	// 可视区域指示器位置
	const viewportTop = visibleStart * LINE_HEIGHT * scale;
	const viewportHeight = Math.max((visibleEnd - visibleStart) * LINE_HEIGHT * scale, 8);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const y = e.clientY - rect.top;
			const lineIndex = Math.floor(y / (LINE_HEIGHT * scale));
			const lineNumber = Math.max(1, Math.min(lineIndex + 1, totalLines));
			onClickLine(lineNumber);
		},
		[scale, totalLines, onClickLine],
	);

	return (
		<div
			ref={containerRef}
			className="relative w-[60px] flex-shrink-0 cursor-pointer select-none border-l border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50"
			style={{ height: renderedHeight }}
			onClick={handleClick}
		>
			{/* 代码行的简化渲染 */}
			<canvas
				width={50}
				height={renderedHeight}
				className="absolute inset-0"
				ref={(canvas) => {
					if (!canvas) return;
					renderMinimapCanvas(canvas, lines, tokens, scale, matchLineSet, highlightedLines);
				}}
			/>

			{/* 可视区域指示器 */}
			<div
				className="absolute left-0 right-0 rounded-sm bg-[#D96C46]/10 border border-[#D96C46]/20 transition-[top] duration-75"
				style={{ top: viewportTop, height: viewportHeight }}
			/>
		</div>
	);
}

function renderMinimapCanvas(
	canvas: HTMLCanvasElement,
	lines: string[],
	tokens: ThemedToken[][] | null,
	scale: number,
	matchLines: Set<number>,
	highlightedLines: Set<number>,
) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const w = canvas.width;
	const h = canvas.height;
	ctx.clearRect(0, 0, w, h);

	const lineH = LINE_HEIGHT * scale;
	const charW = 1.2;

	for (let i = 0; i < lines.length; i++) {
		const y = i * lineH;
		if (y > h) break;

		// 搜索匹配行背景
		if (matchLines.has(i)) {
			ctx.fillStyle = "rgba(234, 179, 8, 0.3)";
			ctx.fillRect(0, y, w, Math.max(lineH, 1));
		}

		// 高亮行背景
		if (highlightedLines.has(i + 1)) {
			ctx.fillStyle = "rgba(217, 108, 70, 0.2)";
			ctx.fillRect(0, y, w, Math.max(lineH, 1));
		}

		// 简化文本渲染
		const lineTokens = tokens?.[i];
		if (lineTokens) {
			let x = 2;
			for (const token of lineTokens) {
				ctx.fillStyle = token.color || "#888";
				const tokenWidth = token.content.length * charW;
				if (x + tokenWidth > w) break;
				ctx.fillRect(x, y + 0.5, Math.min(tokenWidth, w - x), Math.max(lineH - 1, 0.5));
				x += tokenWidth;
			}
		} else {
			// 无 token 数据：用灰色表示行内容长度
			const contentLen = lines[i].trimStart().length;
			const indent = lines[i].length - lines[i].trimStart().length;
			if (contentLen > 0) {
				ctx.fillStyle = "#888888";
				ctx.fillRect(2 + indent * charW, y + 0.5, Math.min(contentLen * charW, w - 4), Math.max(lineH - 1, 0.5));
			}
		}
	}
}

export const CodeViewerMinimap = memo(CodeViewerMinimapInner);
