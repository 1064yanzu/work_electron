// CodeViewerPanel - 专业级代码查看器主组件
// 集成 Shiki 高亮、搜索、minimap、行高亮、面包屑导航
// 支持图片/SVG/二进制文件预览

import { FileCode2, Loader2, Paperclip, RefreshCcw, Search } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShikiTokens } from "../../../hooks/useShikiHighlight";
import { readCodingFilePreview, detectFileType } from "../../../lib/coding/filePreview";
import { inferLanguage } from "../../../lib/utils/diffUtils";
import { codingWorkspaceStore, useCodingWorkspaceSelector, type CenterPanelTab } from "../../../lib/stores/codingWorkspaceStore";
import { toast } from "../../ui/Toast";
import { BreadcrumbNav } from "./BreadcrumbNav";
import { CodeViewerSearch } from "./CodeViewerSearch";
import { CodeViewerMinimap } from "./CodeViewerMinimap";
import { useCodeViewerState } from "./useCodeViewerState";
import type { SearchMatch } from "./useCodeViewerState";

interface CodeViewerPanelProps {
	tab: CenterPanelTab;
}

function CodeViewerPanelInner({ tab }: CodeViewerPanelProps) {
	const projectPath = useCodingWorkspaceSelector((s) => s.projectPath);

	// 文件内容状态
	const [content, setContent] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [truncated, setTruncated] = useState(false);

	// 加载文件内容
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);

		readCodingFilePreview(tab.filePath)
			.then((result) => {
				if (cancelled) return;
				setContent(result.content);
				setTruncated(result.truncated);
				setLoading(false);
			})
			.catch((err) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
				setLoading(false);
			});

		return () => { cancelled = true; };
	}, [tab.filePath]);

	const fileType = useMemo(() => detectFileType(tab.filePath), [tab.filePath]);
	const isMediaFile = fileType === "image" || fileType === "binary";
	const language = useMemo(() => inferLanguage(tab.filePath), [tab.filePath]);
	const lines = useMemo(() => content.split("\n"), [content]);
	const { tokens: shikiTokens, loading: shikiLoading } = useShikiTokens(isMediaFile ? "" : content, language);

	// 代码查看器状态
	const viewer = useCodeViewerState(lines, tab.highlightLine);

	// 滚动容器 ref
	const scrollRef = useRef<HTMLDivElement>(null);

	// 可视区域追踪
	const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
	const handleScroll = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const lineHeight = 24;
		const start = Math.floor(el.scrollTop / lineHeight);
		const end = Math.min(start + Math.ceil(el.clientHeight / lineHeight), lines.length);
		setVisibleRange({ start, end });
	}, [lines.length]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.addEventListener("scroll", handleScroll, { passive: true });
		handleScroll();
		return () => el.removeEventListener("scroll", handleScroll);
	}, [handleScroll]);

	// 搜索匹配时自动滚动到当前匹配项
	useEffect(() => {
		if (viewer.matches.length > 0 && viewer.activeMatchIndex < viewer.matches.length) {
			const match = viewer.matches[viewer.activeMatchIndex];
			scrollToLine(match.lineIndex + 1);
		}
	}, [viewer.activeMatchIndex, viewer.matches]);

	// 外部 highlightLine 变化时滚动
	useEffect(() => {
		if (tab.highlightLine != null) {
			scrollToLine(tab.highlightLine);
		}
	}, [tab.highlightLine]);

	// Cmd+F 快捷键
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "f") {
				e.preventDefault();
				e.stopPropagation();
				viewer.openSearch();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [viewer.openSearch]);

	const scrollToLine = useCallback((lineNumber: number) => {
		const el = scrollRef.current;
		if (!el) return;
		const lineHeight = 24;
		const targetTop = (lineNumber - 1) * lineHeight;
		el.scrollTo({ top: targetTop - el.clientHeight / 3, behavior: "smooth" });
	}, []);

	const handleRefresh = useCallback(async () => {
		setLoading(true);
		try {
			const result = await readCodingFilePreview(tab.filePath);
			setContent(result.content);
			setTruncated(result.truncated);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [tab.filePath]);

	const handleAttach = useCallback(() => {
		codingWorkspaceStore.addContextFile({
			path: tab.filePath,
			name: tab.fileName,
			content,
		});
		toast.success("文件已加入当前线程上下文");
	}, [tab.filePath, tab.fileName, content]);

	const handleMinimapClick = useCallback((lineNumber: number) => {
		scrollToLine(lineNumber);
	}, [scrollToLine]);

	// 构建搜索匹配行的 Set（用于高亮背景）
	const activeMatchLine = viewer.matches.length > 0
		? viewer.matches[viewer.activeMatchIndex]?.lineIndex
		: -1;

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 text-center">
				<FileCode2 className="mb-3 h-8 w-8 text-red-400" />
				<div className="text-sm text-red-500">{error}</div>
			</div>
		);
	}

	// 图片文件预览
	if (fileType === "image") {
		return (
			<div className="flex h-full flex-col bg-white dark:bg-[#0d0d0d]">
				<div className="flex items-center justify-between gap-3 border-b border-zinc-200/60 px-3 py-2 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50">
					<BreadcrumbNav filePath={tab.filePath} projectPath={projectPath} />
					<span className="flex-shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">图片</span>
				</div>
				<div className="flex flex-1 items-center justify-center p-6 overflow-auto">
					<img
						src={`local-file://${tab.filePath}`}
						alt={tab.fileName}
						className="max-w-full max-h-[70vh] rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 object-contain"
						onError={(e) => {
							const target = e.target as HTMLImageElement;
							if (target.src.startsWith("local-file://")) {
								target.src = `file://${tab.filePath}`;
							}
						}}
					/>
				</div>
			</div>
		);
	}

	// SVG 预览
	if (fileType === "svg") {
		return (
			<div className="flex h-full flex-col bg-white dark:bg-[#0d0d0d]">
				<div className="flex items-center justify-between gap-3 border-b border-zinc-200/60 px-3 py-2 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50">
					<BreadcrumbNav filePath={tab.filePath} projectPath={projectPath} />
					<span className="flex-shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">SVG</span>
				</div>
				<div className="flex flex-1 items-center justify-center p-6 overflow-auto">
					<div
						className="max-w-full max-h-[70vh] [&>svg]:max-w-full [&>svg]:max-h-[70vh]"
						dangerouslySetInnerHTML={{ __html: content }}
					/>
				</div>
			</div>
		);
	}

	// 二进制文件提示
	if (fileType === "binary") {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 text-center bg-white dark:bg-[#0d0d0d]">
				<FileCode2 className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
				<div className="text-sm font-medium text-zinc-500 dark:text-zinc-300">二进制文件</div>
				<div className="mt-2 text-xs text-zinc-400">此文件无法作为文本预览</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col bg-white dark:bg-[#0d0d0d]">
			{/* 顶部工具栏 */}
			<div className="flex items-center justify-between gap-3 border-b border-zinc-200/60 px-3 py-2 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<BreadcrumbNav filePath={tab.filePath} projectPath={projectPath} />
					<span className="flex-shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
						{language}
					</span>
					{truncated && (
						<span className="flex-shrink-0 text-[10px] text-amber-500">已截断</span>
					)}
					<span className="flex-shrink-0 text-[10px] text-zinc-400 tabular-nums">
						{lines.length} 行
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={viewer.openSearch}
						className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
						title="搜索 (Cmd+F)"
					>
						<Search className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={() => void handleRefresh()}
						className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
						title="刷新"
					>
						<RefreshCcw className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={handleAttach}
						className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
					>
						<Paperclip className="h-3 w-3" />
						加入上下文
					</button>
				</div>
			</div>

			{/* 搜索栏 */}
			{viewer.searchOpen && (
				<CodeViewerSearch
					query={viewer.searchQuery}
					matchCount={viewer.matches.length}
					activeIndex={viewer.activeMatchIndex}
					onQueryChange={viewer.updateSearchQuery}
					onNext={viewer.goToNextMatch}
					onPrev={viewer.goToPrevMatch}
					onClose={viewer.closeSearch}
				/>
			)}

			{/* 代码内容 + minimap */}
			<div className="flex flex-1 overflow-hidden">
				{/* 代码区域 */}
				<div ref={scrollRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
					<div className="min-w-full">
						{lines.map((lineText, lineIdx) => {
							const lineNumber = lineIdx + 1;
							const lineTokens = (!shikiLoading && shikiTokens && lineIdx < shikiTokens.length)
								? shikiTokens[lineIdx]
								: null;
							const isHighlighted = viewer.highlightedLines.has(lineNumber);
							const isMatchLine = viewer.matches.some((m) => m.lineIndex === lineIdx);
							const isActiveMatch = activeMatchLine === lineIdx;

							return (
								<div
									key={lineIdx}
									className={`grid grid-cols-[52px_minmax(0,1fr)] transition-colors ${
										isActiveMatch
											? "bg-yellow-100/80 dark:bg-yellow-900/20"
											: isMatchLine
												? "bg-yellow-50/60 dark:bg-yellow-950/10"
												: isHighlighted
													? "bg-[#D96C46]/[0.06] dark:bg-[#D96C46]/[0.08]"
													: ""
									}`}
								>
									{/* 行号 */}
									<div
										className={`select-none cursor-pointer border-r px-3 py-0 text-right text-[11px] leading-6 transition-colors ${
											isHighlighted
												? "bg-[#D96C46]/10 text-[#D96C46] border-[#D96C46]/20"
												: "text-zinc-400 border-zinc-100/80 dark:text-zinc-600 dark:border-zinc-800/80"
										}`}
										onClick={() => viewer.toggleLineHighlight(lineNumber)}
									>
										{lineNumber}
									</div>
									{/* 内容 */}
									<pre className="overflow-x-auto px-3 py-0 text-[12px] leading-6 font-mono">
										<code>
											{lineTokens ? (
												renderHighlightedLine(lineTokens, lineText, lineIdx, viewer.searchQuery, viewer.matches, viewer.activeMatchIndex)
											) : (
												<span className="text-zinc-800 dark:text-zinc-200">{lineText || " "}</span>
											)}
										</code>
									</pre>
								</div>
							);
						})}
					</div>
				</div>

				{/* Minimap */}
				{lines.length > 50 && (
					<CodeViewerMinimap
						lines={lines}
						tokens={shikiTokens}
						totalLines={lines.length}
						visibleStart={visibleRange.start}
						visibleEnd={visibleRange.end}
						searchMatches={viewer.matches}
						highlightedLines={viewer.highlightedLines}
						onClickLine={handleMinimapClick}
					/>
				)}
			</div>
		</div>
	);
}

/**
 * 渲染带搜索高亮的 token 行
 */
function renderHighlightedLine(
	tokens: import("shiki").ThemedToken[],
	_lineText: string,
	lineIndex: number,
	searchQuery: string,
	matches: SearchMatch[],
	activeMatchIndex: number,
): React.ReactNode[] {
	// 如果没有搜索或没有匹配，直接渲染 tokens
	if (!searchQuery || matches.length === 0) {
		return tokens.map((token, i) => (
			<span key={i} style={{ color: token.color }}>{token.content}</span>
		));
	}

	// 找到当前行的所有匹配
	const lineMatches = matches
		.map((m, idx) => ({ ...m, globalIdx: idx }))
		.filter((m) => m.lineIndex === lineIndex);

	if (lineMatches.length === 0) {
		return tokens.map((token, i) => (
			<span key={i} style={{ color: token.color }}>{token.content}</span>
		));
	}

	// 将 tokens 展平为字符级映射
	const result: React.ReactNode[] = [];
	let charPos = 0;

	for (let ti = 0; ti < tokens.length; ti++) {
		const token = tokens[ti];
		const tokenStart = charPos;
		const tokenEnd = charPos + token.content.length;

		// 检查此 token 是否与任何匹配项重叠
		let lastSplit = 0;
		const tokenChars = token.content;

		for (const match of lineMatches) {
			// 匹配相对于 token 的位置
			const mStart = Math.max(match.startCol - tokenStart, 0);
			const mEnd = Math.min(match.endCol - tokenStart, tokenChars.length);

			if (mStart >= mEnd || mStart >= tokenChars.length || mEnd <= 0) continue;

			// 匹配前的部分
			if (mStart > lastSplit) {
				result.push(
					<span key={`${ti}-pre-${lastSplit}`} style={{ color: token.color }}>
						{tokenChars.slice(lastSplit, mStart)}
					</span>,
				);
			}

			// 匹配的部分
			const isActive = match.globalIdx === activeMatchIndex;
			result.push(
				<mark
					key={`${ti}-match-${mStart}`}
					className={
						isActive
							? "bg-yellow-300 text-zinc-900 rounded-sm px-0"
							: "bg-yellow-200/60 text-zinc-800 dark:bg-yellow-600/30 dark:text-zinc-200 rounded-sm px-0"
					}
				>
					{tokenChars.slice(mStart, mEnd)}
				</mark>,
			);

			lastSplit = mEnd;
		}

		// 剩余部分
		if (lastSplit < tokenChars.length) {
			result.push(
				<span key={`${ti}-rest-${lastSplit}`} style={{ color: token.color }}>
					{tokenChars.slice(lastSplit)}
				</span>,
			);
		} else if (lastSplit === 0) {
			// 没有匹配重叠，正常渲染
			result.push(
				<span key={ti} style={{ color: token.color }}>{token.content}</span>,
			);
		}

		charPos = tokenEnd;
	}

	return result;
}

export const CodeViewerPanel = memo(CodeViewerPanelInner);
