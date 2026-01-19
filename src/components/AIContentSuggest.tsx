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
			<div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
				{/* Header */}
				<div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-b border-zinc-200 dark:border-zinc-800">
					<div className="flex items-center gap-2">
						<div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
						<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
							AI 建议
						</span>
					</div>
				</div>

				{/* Content Preview */}
				<div className="p-4 max-h-60 overflow-y-auto scrollbar-hide">
					<pre className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-sans leading-relaxed">
						{content}
					</pre>
				</div>

				{/* Actions */}
				<div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2">
					<button
						onClick={onReject}
						className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
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
				<div className="px-4 py-2 bg-zinc-100/50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800">
					<p className="text-xs text-zinc-400 text-center">
						<kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-700 font-mono">
							Tab
						</kbd>{" "}
						接受 ·
						<kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-700 font-mono ml-2">
							Esc
						</kbd>{" "}
						拒绝
					</p>
				</div>
			</div>
		</div>
	);
}
