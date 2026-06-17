// 用户消息内联编辑气泡
// 替换普通消息气泡，展示可编辑的 textarea，⌘↵ 提交 / Esc 取消

import { useEffect, useRef } from "react";
import { isMac } from "../../lib/platform";

interface InlineEditBubbleProps {
	initialValue: string;
	onSubmit: (newContent: string) => void;
	onCancel: () => void;
}

export function InlineEditBubble({
	initialValue,
	onSubmit,
	onCancel,
}: InlineEditBubbleProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// 聚焦并将光标移至末尾
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.focus();
		el.selectionStart = el.value.length;
		el.selectionEnd = el.value.length;
	}, []);

	// 自动调整高度
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [initialValue]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			const value = textareaRef.current?.value.trim() ?? "";
			if (value) onSubmit(value);
		} else if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	};

	const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
		const el = e.currentTarget;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	};

	const handleSubmitClick = () => {
		const value = textareaRef.current?.value.trim() ?? "";
		if (value) onSubmit(value);
	};

	return (
		<div className="w-full flex flex-col items-end gap-2">
			<textarea
				ref={textareaRef}
				defaultValue={initialValue}
				onKeyDown={handleKeyDown}
				onInput={handleInput}
				className="w-full rounded-2xl rounded-tr-sm px-5 py-3 text-sm leading-6 bg-warm-200 dark:bg-cream-800 text-text-primary border border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none min-h-[48px] shadow-sm"
				rows={1}
			/>
			<div className="flex items-center gap-2 text-xs text-text-muted">
				<span className="opacity-60">Esc 取消</span>
				<span className="opacity-40">·</span>
				<button
					type="button"
					onClick={handleSubmitClick}
					className="flex items-center gap-1 px-3 py-1 rounded-lg bg-text-primary text-surface hover:bg-text-secondary transition-colors font-medium"
				>
					保存并重发
					<span className="opacity-60 font-normal ml-1">
						{isMac ? "⌘↵" : "Ctrl+↵"}
					</span>
				</button>
			</div>
		</div>
	);
}
