// CodeViewerSearch - 代码查看器内置搜索栏
// Cmd+F 触发，支持上/下导航匹配项

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";

interface CodeViewerSearchProps {
	query: string;
	matchCount: number;
	activeIndex: number;
	onQueryChange: (query: string) => void;
	onNext: () => void;
	onPrev: () => void;
	onClose: () => void;
}

function CodeViewerSearchInner({
	query,
	matchCount,
	activeIndex,
	onQueryChange,
	onNext,
	onPrev,
	onClose,
}: CodeViewerSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	// 打开时自动聚焦
	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (e.shiftKey) {
					onPrev();
				} else {
					onNext();
				}
			}
		},
		[onClose, onNext, onPrev],
	);

	return (
		<div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/80 dark:bg-zinc-900/80">
			{/* 搜索输入框 */}
			<div className="relative flex-1 max-w-xs">
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="搜索..."
					className="w-full pl-3 pr-16 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D96C46]/40 focus:border-[#D96C46]/40 placeholder:text-zinc-400 text-zinc-700 dark:text-zinc-300 font-mono"
				/>
				{/* 匹配计数 */}
				{query && (
					<span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 dark:text-zinc-500 font-mono tabular-nums">
						{matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : "无匹配"}
					</span>
				)}
			</div>

			{/* 上/下导航 */}
			<div className="flex items-center gap-0.5">
				<button
					type="button"
					onClick={onPrev}
					disabled={matchCount === 0}
					className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-300"
					title="上一个匹配 (Shift+Enter)"
				>
					<ChevronUp className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					onClick={onNext}
					disabled={matchCount === 0}
					className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-300"
					title="下一个匹配 (Enter)"
				>
					<ChevronDown className="h-3.5 w-3.5" />
				</button>
			</div>

			{/* 关闭 */}
			<button
				type="button"
				onClick={onClose}
				className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-600 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-300"
				title="关闭搜索 (Esc)"
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

export const CodeViewerSearch = memo(CodeViewerSearchInner);
