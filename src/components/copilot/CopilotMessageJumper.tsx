// DeepSeek 风格的消息跳转导航条
// 右边缘折叠态小横线 → hover 展开 280px 消息列表 + 激活态 + 点击滚动 + 删除

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ChatMessage } from "../../lib/chat/types";

interface CopilotMessageJumperProps {
	messages: ChatMessage[];
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	onDeleteMessage?: (messageId: string) => void;
}

export function CopilotMessageJumper({
	messages,
	scrollContainerRef,
	onDeleteMessage,
}: CopilotMessageJumperProps) {
	const userMessages = messages.filter((m) => m.role === "user");
	const [expanded, setExpanded] = useState(false);
	const [activeId, setActiveId] = useState<string | null>(null);
	const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);

	// IntersectionObserver：追踪哪条用户消息最靠近视口顶部
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container || userMessages.length === 0) return;

		if (observerRef.current) {
			observerRef.current.disconnect();
		}

		const visible = new Map<string, number>();

		observerRef.current = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const id = (entry.target as HTMLElement).dataset.userMessageId;
					if (!id) continue;
					if (entry.isIntersecting) {
						visible.set(id, entry.boundingClientRect.top);
					} else {
						visible.delete(id);
					}
				}
				// 取最靠近视口顶部（top 最小且 >= 0）的那条
				let best: string | null = null;
				let bestTop = Infinity;
				for (const [id, top] of visible) {
					if (top >= 0 && top < bestTop) {
						bestTop = top;
						best = id;
					}
				}
				if (best) setActiveId(best);
			},
			{
				root: container,
				threshold: 0,
				rootMargin: "0px 0px -80% 0px",
			},
		);

		const els = container.querySelectorAll("[data-user-message-id]");
		for (const el of els) {
			observerRef.current.observe(el);
		}

		return () => observerRef.current?.disconnect();
	}, [userMessages.length, scrollContainerRef]);

	const scrollToMessage = useCallback(
		(messageId: string) => {
			const container = scrollContainerRef.current;
			if (!container) return;
			setActiveId(messageId);
			const tryLocate = (attempt: number) => {
				const el = container.querySelector(
					`[data-user-message-id="${messageId}"]`,
				) as HTMLElement | null;
				if (el) {
					el.scrollIntoView({
						behavior: attempt === 0 ? "smooth" : "auto",
						block: "center",
					});
					return;
				}
				if (attempt >= 12) return;
				// 长对话虚拟化时历史消息可能未渲染：按消息占比先粗跳到目标区域，
				// 触发该区域挂载后逐帧重试精确定位
				const index = messages.findIndex((m) => m.id === messageId);
				if (index < 0) return;
				const fraction = index / Math.max(1, messages.length - 1);
				container.scrollTop =
					fraction * (container.scrollHeight - container.clientHeight);
				requestAnimationFrame(() => tryLocate(attempt + 1));
			};
			tryLocate(0);
		},
		[scrollContainerRef, messages],
	);

	const handleMouseEnter = () => {
		hoverTimerRef.current = setTimeout(() => setExpanded(true), 250);
	};

	const handleMouseLeave = () => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		setExpanded(false);
	};

	if (userMessages.length < 2) return null;

	return (
		<div
			className="absolute top-16 bottom-24 right-0 z-10 flex items-start justify-end pointer-events-none"
			style={{ width: expanded ? 280 : 12 }}
		>
			<div
				className="h-full pointer-events-auto transition-all duration-200"
				style={{ width: expanded ? 280 : 12 }}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				{expanded ? (
					/* 展开态 */
					<div className="h-full w-full bg-surface/95 backdrop-blur-md border border-border rounded-l-xl shadow-lg overflow-hidden flex flex-col">
						<div className="px-3 py-2 text-[11px] font-medium text-text-muted border-b border-border shrink-0">
							消息导航
						</div>
						<div className="flex-1 overflow-y-auto py-1 scrollbar-hide">
							{userMessages.map((msg) => {
								const isActive = msg.id === activeId;
								const preview = msg.content.replace(/\s+/g, " ").slice(0, 28);
								return (
									<div
										key={msg.id}
										className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
											isActive
												? "bg-primary/8 text-primary"
												: "hover:bg-warm-200 dark:hover:bg-cream-800/50 text-text-secondary"
										}`}
										onClick={() => scrollToMessage(msg.id)}
									>
										<span
											className={`shrink-0 rounded-full transition-all ${
												isActive
													? "w-2.5 h-0.5 bg-primary"
													: "w-1.5 h-0.5 bg-current opacity-40"
											}`}
										/>
										<span className="flex-1 text-[12px] truncate leading-5">
											{preview || "（空消息）"}
										</span>
										{onDeleteMessage && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onDeleteMessage(msg.id);
												}}
												className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-500 transition-all"
												title="删除此消息"
											>
												<X className="w-3 h-3" />
											</button>
										)}
									</div>
								);
							})}
						</div>
					</div>
				) : (
					/* 折叠态：一列小横线 */
					<div className="h-full w-full flex flex-col justify-center items-center gap-1.5 pr-0.5">
						{userMessages.map((msg) => {
							const isActive = msg.id === activeId;
							return (
								<div
									key={msg.id}
									onClick={() => scrollToMessage(msg.id)}
									className={`rounded-full cursor-pointer transition-all duration-150 ${
										isActive
											? "w-2.5 h-1 bg-primary"
											: "w-2 h-0.5 bg-text-muted/40 hover:bg-text-muted"
									}`}
									title={msg.content.slice(0, 40)}
								/>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
