// 新文档提案组件 - AI 建议创建新文档时的确认卡片
import { Check, FilePlus2, FileText, X } from "lucide-react";
import { useMascot } from "../lib/mascotStore";
import { Mascot } from "./Mascot/Mascot";

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
	const { enabled } = useMascot();

	// 截取预览内容
	const preview =
		contentPreview.length > 500
			? contentPreview.slice(0, 500) + "..."
			: contentPreview;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-cream-900/20 backdrop-blur-sm animate-in fade-in duration-200">
			<div className="w-full max-w-lg mx-4 bg-surface rounded-2xl shadow-bai-pop border border-border overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
				{/* Header */}
				<div className="px-6 py-4 bg-warm-200/60 border-b border-border">
					<div className="flex items-center gap-3">
						{enabled ? (
							<Mascot
								slot="state-organize"
								size="md"
								float
								wrapperClassName="shrink-0"
							/>
						) : (
							<div className="w-9 h-9 rounded-xl bg-warm-200 border border-border flex items-center justify-center shrink-0">
								<FilePlus2
									className="w-4 h-4 text-text-secondary"
									strokeWidth={1.5}
								/>
							</div>
						)}
						<div>
							<h3 className="text-base font-semibold text-text-primary">
								AI 建议创建新文档
							</h3>
							<p className="text-xs text-text-muted mt-0.5">
								当前文档不适合添加此内容，建议新建
							</p>
						</div>
					</div>
				</div>

				{/* 文档信息 */}
				<div className="px-6 py-4 space-y-4">
					{/* 标题 */}
					<div className="flex items-start gap-3">
						<FileText
							className="w-5 h-5 text-text-light mt-0.5 shrink-0"
							strokeWidth={1.5}
						/>
						<div className="flex-1">
							<p className="text-xs text-text-muted mb-1">文档标题</p>
							<p className="text-sm font-medium text-text-primary">{title}</p>
						</div>
					</div>

					{/* 摘要 */}
					{summary && (
						<div className="pl-8">
							<p className="text-xs text-text-muted mb-1">摘要</p>
							<p className="text-sm text-text-secondary leading-relaxed">
								{summary}
							</p>
						</div>
					)}

					{/* 内容预览 */}
					<div className="pl-8">
						<p className="text-xs text-text-muted mb-2">内容预览</p>
						<div className="max-h-48 overflow-y-auto scrollbar-hide rounded-xl bg-cream-200/60 p-4 border border-border">
							<pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">
								{preview}
							</pre>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="px-6 py-4 bg-warm-200/60 border-t border-border flex items-center justify-end gap-3">
					<button
						onClick={onReject}
						className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-text-secondary hover:bg-warm-200 transition-colors"
					>
						<X className="w-4 h-4" strokeWidth={1.5} />
						取消
					</button>
					<button
						onClick={onAccept}
						className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors active:scale-[0.98]"
					>
						<Check className="w-4 h-4" strokeWidth={1.5} />
						创建文档
					</button>
				</div>
			</div>
		</div>
	);
}
