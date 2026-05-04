import { FileText, Plus } from "lucide-react";
import { useMascot } from "../../../lib/mascotStore";
import { Mascot } from "../../Mascot/Mascot";

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
	const { enabled } = useMascot();

	if (mode === "search_empty") {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center">
				<p className="text-base font-medium text-text-secondary dark:text-zinc-200">
					没有匹配的文档
				</p>
				<p className="mt-2 text-sm text-text-secondary">
					尝试更换关键词，或清空搜索查看全部文档。
				</p>
				<button
					type="button"
					onClick={onClearSearch}
					className="focus-ring mt-5 min-h-11 px-4 rounded-xl border border-border text-sm text-text-secondary dark:text-zinc-200 hover:bg-warm-200 transition-colors"
				>
					清空搜索
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center h-full text-center px-6">
			{enabled ? (
				<Mascot slot="empty-no-data" size="2xl" float wrapperClassName="mb-2" />
			) : (
				<div className="h-24 w-24 rounded-3xl border border-border/80/70 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 inline-flex items-center justify-center">
					<FileText className="w-12 h-12 text-text-muted" />
				</div>
			)}
			<h3 className="mt-8 text-[40px] leading-none font-semibold tracking-tight text-text-primary">
				开始创作
			</h3>
			<p className="mt-4 max-w-md text-xl leading-relaxed text-text-secondary">
				创建你的第一个文档，或让 AI 助手帮你生成内容
			</p>
			<button
				type="button"
				onClick={() => void onCreateNew()}
				className="focus-ring mt-10 min-h-12 px-6 rounded-2xl inline-flex items-center gap-2.5 bg-dark-bg hover:bg-dark-surface text-white text-xl font-semibold transition-colors"
			>
				<Plus className="w-5 h-5" />
				新建文档
			</button>
		</div>
	);
}
