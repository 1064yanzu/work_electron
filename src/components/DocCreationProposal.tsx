// 新文档提案组件 - AI 建议创建新文档时的确认卡片
import { Check, FileText, Sparkles, X } from "lucide-react";

interface DocCreationProposalProps {
	title: string;
	summary?: string;
	contentPreview: string;
	onAccept: () => void;
	onReject: () => void;
}

/**
 * AI 新建文档提案卡片
 * 当 AI 判断需要创建新文档时，弹出此卡片供用户确认
 */
export default function DocCreationProposal({
	title,
	summary,
	contentPreview,
	onAccept,
	onReject,
}: DocCreationProposalProps) {
	// 截取预览内容
	const preview =
		contentPreview.length > 500
			? contentPreview.slice(0, 500) + "..."
			: contentPreview;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
			<div className="w-full max-w-lg mx-4 bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-2xl border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
				{/* Header */}
				<div className="px-6 py-4 bg-gradient-to-r from-blue-50/80 to-purple-50/80 dark:from-blue-950/20 dark:to-purple-950/20 border-b border-zinc-200/50 dark:border-zinc-800/50">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30">
							<Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
								AI 建议创建新文档
							</h3>
							<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
								当前文档不适合添加此内容，建议新建
							</p>
						</div>
					</div>
				</div>

				{/* 文档信息 */}
				<div className="px-6 py-4 space-y-4">
					{/* 标题 */}
					<div className="flex items-start gap-3">
						<FileText className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
						<div className="flex-1">
							<p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
								文档标题
							</p>
							<p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
								{title}
							</p>
						</div>
					</div>

					{/* 摘要 */}
					{summary && (
						<div className="pl-8">
							<p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
								摘要
							</p>
							<p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
								{summary}
							</p>
						</div>
					)}

					{/* 内容预览 */}
					<div className="pl-8">
						<p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
							内容预览
						</p>
						<div className="max-h-48 overflow-y-auto scrollbar-hide rounded-xl bg-zinc-50 dark:bg-zinc-900/50 p-4 border border-zinc-200/50 dark:border-zinc-800/50">
							<pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
								{preview}
							</pre>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/50 border-t border-zinc-200/50 dark:border-zinc-800/50 flex items-center justify-end gap-3">
					<button
						onClick={onReject}
						className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 transition-all"
					>
						<X className="w-4 h-4" />
						取消
					</button>
					<button
						onClick={onAccept}
						className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-all shadow-lg shadow-blue-500/20"
					>
						<Check className="w-4 h-4" />
						创建文档
					</button>
				</div>
			</div>
		</div>
	);
}
