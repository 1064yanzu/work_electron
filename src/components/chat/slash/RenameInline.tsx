/**
 * Claude Code 风格斜杠命令 —— /rename 行内输入框（T7.8）。
 *
 * 职责：
 * - 接收 sessionId，提交非空字符串后调用 `chatStore.updateSessionTitle`；
 * - 空字符串视为取消（见 Requirement 3.9）；
 * - Escape 关闭并回退到 SlashMenu 主视图。
 *
 * 约束：
 * - 不走 executor，直接调用 chatStore（因为这是一个纯 UI 附带副作用的交互）；
 * - 组件自管生命周期，挂载即自动聚焦。
 */

import { Check, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { chatStore } from "../../../lib/chat/store";

interface RenameInlineProps {
	sessionId: string;
	initialTitle: string;
	onDone: () => void;
}

export function RenameInline({
	sessionId,
	initialTitle,
	onDone,
}: RenameInlineProps) {
	const [value, setValue] = useState(initialTitle);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const commit = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed) {
			onDone();
			return;
		}
		try {
			chatStore.updateSessionTitle(sessionId, trimmed);
		} catch (err) {
			console.warn("[slashCommands] /rename 更新标题失败。", err);
		}
		onDone();
	}, [value, sessionId, onDone]);

	const cancel = useCallback(() => {
		onDone();
	}, [onDone]);

	return (
		<div className="flex items-center gap-2 px-3 py-2.5 bg-surface dark:bg-[#2b2b2b] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]">
			<span className="font-mono text-[11px] text-[#ccc] dark:text-[#555] flex-shrink-0">
				/rename
			</span>
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						commit();
					} else if (e.key === "Escape") {
						e.preventDefault();
						cancel();
					}
				}}
				placeholder="输入新的会话标题…"
				className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-[#1a1a1a] dark:text-[#eee] placeholder:text-[#bbb] dark:placeholder:text-[#555]"
			/>
			<button
				type="button"
				onClick={commit}
				className="w-7 h-7 flex items-center justify-center rounded-lg text-[#666] dark:text-[#bbb] hover:bg-[#f3f3f3] dark:hover:bg-[#363636] active:scale-95 transition-all duration-100"
				title="确认"
			>
				<Check className="w-3.5 h-3.5" />
			</button>
			<button
				type="button"
				onClick={cancel}
				className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] dark:text-[#666] hover:bg-[#f3f3f3] dark:hover:bg-[#363636] active:scale-95 transition-all duration-100"
				title="取消"
			>
				<X className="w-3.5 h-3.5" />
			</button>
		</div>
	);
}
