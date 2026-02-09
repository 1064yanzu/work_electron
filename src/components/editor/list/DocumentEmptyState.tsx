import { FileText, Plus } from "lucide-react";

interface DocumentEmptyStateProps {
	mode: "empty" | "search_empty";
	onCreateNew: () => void | Promise<void>;
	onClearSearch: () => void;
}

export function DocumentEmptyState({
	mode,
	onCreateNew,
	onClearSearch,
}: DocumentEmptyStateProps) {
	if (mode === "search_empty") {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center">
				<p className="text-base font-medium text-zinc-700 dark:text-zinc-200">
					没有匹配的文档
				</p>
				<p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
					尝试更换关键词，或清空搜索查看全部文档。
				</p>
				<button
					type="button"
					onClick={onClearSearch}
					className="focus-ring mt-5 min-h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
				>
					清空搜索
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center h-full text-center px-6">
			<div className="h-24 w-24 rounded-3xl border border-zinc-200/80 dark:border-zinc-700/70 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 inline-flex items-center justify-center">
				<FileText className="w-12 h-12 text-zinc-500 dark:text-zinc-300" />
			</div>
			<h3 className="mt-8 text-[40px] leading-none font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
				开始创作
			</h3>
			<p className="mt-4 max-w-md text-xl leading-relaxed text-zinc-600 dark:text-zinc-300">
				创建你的第一个文档，或让 AI 助手帮你生成内容
			</p>
			<button
				type="button"
				onClick={() => void onCreateNew()}
				className="focus-ring mt-10 min-h-12 px-6 rounded-2xl inline-flex items-center gap-2.5 bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xl font-semibold transition-colors"
			>
				<Plus className="w-5 h-5" />
				新建文档
			</button>
		</div>
	);
}
