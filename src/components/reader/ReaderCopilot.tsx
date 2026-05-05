import { Loader2, Send, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import type { CopilotMessage } from "./hooks/useReaderCopilot";

interface ReaderCopilotProps {
	open: boolean;
	onClose: () => void;
	messages: CopilotMessage[];
	streaming: boolean;
	onSubmit: (text: string) => void;
	onStop: () => void;
	onClear: () => void;
}

export function ReaderCopilot({
	open,
	onClose,
	messages,
	streaming,
	onSubmit,
	onStop,
	onClear,
}: ReaderCopilotProps) {
	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [messages, open]);

	if (!open) return null;

	const handleSubmit = () => {
		const text = input.trim();
		if (!text) return;
		onSubmit(text);
		setInput("");
	};

	return (
		<aside
			className="reader-copilot"
			role="complementary"
			aria-label="AI 副驾驶"
		>
			<header className="reader-copilot__header">
				<div className="reader-copilot__title">
					<Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
					AI 副驾驶
				</div>
				<div className="reader-copilot__actions">
					<button
						type="button"
						className="reader-copilot__action"
						onClick={onClear}
						title="清空对话"
						aria-label="清空对话"
					>
						<Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
					</button>
					<button
						type="button"
						className="reader-copilot__action"
						onClick={onClose}
						title="关闭"
						aria-label="关闭副驾驶"
					>
						<X className="w-3.5 h-3.5" strokeWidth={1.5} />
					</button>
				</div>
			</header>

			<div ref={scrollRef} className="reader-copilot__scroll">
				{messages.length === 0 ? (
					<div className="reader-copilot__empty">
						<Sparkles className="w-5 h-5" strokeWidth={1.5} />
						<p>选中文字让我翻译/解释/总结，或在这里直接提问。</p>
						<ul>
							<li>· 你的当前章节会作为上下文传给模型</li>
							<li>· 当书已经做了全文索引，会附带 KB 检索片段</li>
							<li>· 流式输出，可随时停止</li>
						</ul>
					</div>
				) : (
					<ul className="reader-copilot__messages" role="list">
						{messages.map((m) => (
							<li
								key={m.id}
								className={`reader-copilot__message reader-copilot__message--${m.role}`}
							>
								<div className="reader-copilot__bubble">
									<MarkdownRenderer
										content={m.content || (m.streaming ? "…" : "")}
										className="reader-copilot__markdown"
									/>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>

			<form
				className="reader-copilot__composer"
				onSubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="问点什么，或粘贴一段想让我处理的文字…"
					rows={2}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSubmit();
						}
					}}
				/>
				<div className="reader-copilot__composer-actions">
					{streaming ? (
						<button
							type="button"
							className="reader-copilot__stop"
							onClick={onStop}
						>
							<Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
							停止
						</button>
					) : (
						<button
							type="submit"
							className="reader-copilot__send"
							disabled={!input.trim()}
						>
							<Send className="w-3.5 h-3.5" strokeWidth={1.5} />
							发送
						</button>
					)}
				</div>
			</form>
		</aside>
	);
}
