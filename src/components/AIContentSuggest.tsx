import { Check, X } from "lucide-react";

interface AIContentSuggestProps {
	content: string;
	onAccept: () => void;
	onReject: () => void;
}

/**
 * AI 内容建议组件
 * 类似 Cursor 的 Accept/Reject 交互
 */
export default function AIContentSuggest({
	content,
	onAccept,
	onReject,
}: AIContentSuggestProps) {
	return (
		<div className="fixed bottom-8 right-8 max-w-md z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
			<div className="bg-surface rounded-xl shadow-2xl border border-border overflow-hidden">
				{/* Header */}
				<div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-b border-border">
					<div className="flex items-center gap-2">
						<div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
						<span className="text-sm font-medium text-text-secondary">
							AI 建议
						</span>
					</div>
				</div>

				{/* Content Preview */}
				<div className="p-4 max-h-60 overflow-y-auto scrollbar-hide">
					<pre className="text-sm text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
						{content}
					</pre>
				</div>

				{/* Actions */}
				<div className="px-4 py-3 bg-warm-50/50 border-t border-border flex items-center justify-end gap-2">
					<button
						onClick={onReject}
						className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-warm-300 transition-colors flex items-center gap-2"
					>
						<X className="w-4 h-4" />
						拒绝
					</button>
					<button
						onClick={onAccept}
						className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors flex items-center gap-2 shadow-sm"
					>
						<Check className="w-4 h-4" />
						接受
					</button>
				</div>

				{/* Keyboard Hint */}
				<div className="px-4 py-2 bg-warm-200/50/50 border-t border-border">
					<p className="text-xs text-text-light text-center">
						<kbd className="px-1.5 py-0.5 bg-surface rounded border border-zinc-300 font-mono">
							Tab
						</kbd>{" "}
						接受 ·
						<kbd className="px-1.5 py-0.5 bg-surface rounded border border-zinc-300 font-mono ml-2">
							Esc
						</kbd>{" "}
						拒绝
					</p>
				</div>
			</div>
		</div>
	);
}
