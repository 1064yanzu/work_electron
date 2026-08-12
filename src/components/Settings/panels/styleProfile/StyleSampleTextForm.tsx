/**
 * StyleSampleTextForm — 内联文本样本添加表单
 *
 * 替代 window.prompt()，提供一个内嵌的可折叠表单区域。
 * 用于粘贴文本样本并提交，可取消收起。
 */
import { useCallback, useRef, useState } from "react";
import { Check, X } from "lucide-react";

interface Props {
	onSubmit: (content: string, title?: string) => Promise<void>;
	onCancel: () => void;
}

export function StyleSampleTextForm({ onSubmit, onCancel }: Props) {
	const [content, setContent] = useState("");
	const [title, setTitle] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleSubmit = useCallback(async () => {
		const trimmedContent = content.trim();
		if (!trimmedContent) return;
		setSubmitting(true);
		try {
			await onSubmit(trimmedContent, title.trim() || undefined);
		} finally {
			setSubmitting(false);
		}
	}, [content, title, onSubmit]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				onCancel();
			}
		},
		[onCancel],
	);

	return (
		<div className="rounded-xl border border-mint-300/60 dark:border-mint-500/30 bg-mint-50/40 dark:bg-mint-900/10 p-3 space-y-2.5">
			<input
				type="text"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="样本标题（可选）"
				className="w-full text-xs bg-white/70 dark:bg-cream-800/50 rounded-lg px-3 py-1.5 text-text-primary placeholder-text-muted/50 focus:outline-none focus:ring-1 focus:ring-mint-400/50 dark:focus:ring-mint-500/40 border border-cream-200/60 dark:border-cream-600/30 transition-shadow duration-150"
			/>
			<textarea
				ref={textareaRef}
				// eslint-disable-next-line jsx-a11y/no-autofocus
				autoFocus
				value={content}
				onChange={(e) => setContent(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="在此粘贴样本文章内容…"
				rows={6}
				className="w-full text-xs bg-white/70 dark:bg-cream-800/50 rounded-lg px-3 py-2 text-text-primary placeholder-text-muted/50 resize-none focus:outline-none focus:ring-1 focus:ring-mint-400/50 dark:focus:ring-mint-500/40 border border-cream-200/60 dark:border-cream-600/30 transition-shadow duration-150"
			/>
			<div className="flex items-center justify-between">
				<span className="text-[11px] text-text-muted">
					{content.trim().length > 0
						? `${content.trim().length.toLocaleString()} 字符`
						: ""}
				</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="flex items-center gap-1 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors duration-150"
					>
						<X size={10} />
						取消
					</button>
					<button
						type="button"
						onClick={() => void handleSubmit()}
						disabled={submitting || !content.trim()}
						className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full bg-mint-700 dark:bg-mint-600 text-white hover:bg-mint-800 dark:hover:bg-mint-700 disabled:opacity-40 transition-colors duration-150"
					>
						<Check size={10} />
						{submitting ? "添加中…" : "添加样本"}
					</button>
				</div>
			</div>
		</div>
	);
}
