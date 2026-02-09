import { Search, X } from "lucide-react";

interface DocumentListSearchBarProps {
	query: string;
	onChangeQuery: (value: string) => void;
	totalCount: number;
	filteredCount: number;
}

export function DocumentListSearchBar({
	query,
	onChangeQuery,
	totalCount,
	filteredCount,
}: DocumentListSearchBarProps) {
	const hasQuery = query.trim().length > 0;

	return (
		<div className="space-y-2">
			<div className="relative group">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-colors group-focus-within:text-zinc-700 dark:group-focus-within:text-zinc-300" />
				<input
					type="text"
					value={query}
					onChange={(e) => onChangeQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") onChangeQuery("");
					}}
					placeholder="搜索文档标题、标签或类型..."
					aria-label="搜索文档"
					className="focus-ring w-full min-h-11 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/90 dark:bg-zinc-900/80 pl-10 pr-10 text-[15px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 transition-all duration-200 focus:border-zinc-400 dark:focus:border-zinc-500 focus:shadow-sm"
				/>
				{hasQuery ? (
					<button
						type="button"
						onClick={() => onChangeQuery("")}
						className="focus-ring absolute right-1.5 top-1/2 -translate-y-1/2 min-h-8 min-w-8 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95"
						aria-label="清空搜索"
						title="清空搜索 (Esc)"
					>
						<X className="w-4 h-4" />
					</button>
				) : null}
			</div>
			<div className="text-xs text-zinc-600 dark:text-zinc-300">
				{hasQuery
					? `匹配 ${filteredCount}/${totalCount} 篇文档`
					: `共 ${totalCount} 篇文档`}
			</div>
		</div>
	);
}
