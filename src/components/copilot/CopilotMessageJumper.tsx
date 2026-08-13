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
				className="h-full pointer-events-auto transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150"
				style={{ width: expanded ? 280 : 12 }}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				{expanded ? (
					/* 展开态 */
					<div className="h-full w-full bg-surface/95 backdrop-blur-md border border-border rounded-l-xl shadow-lg overflow-hidden flex flex-col animate-in fade-in slide-in-from-right-2 duration-150">
						<div className="px-3 py-2 text-xs font-medium text-text-muted border-b border-border shrink-0">
							消息导航
						</div>
						<div className="flex-1 overflow-y-auto py-1 scrollbar-hide">
							{userMessages.map((msg) => {
								const isActive = msg.id === activeId;
								const preview = msg.content.replace(/\s+/g, " ").slice(0, 28);
								return (
									<div
										key={msg.id}
										className={`group flex items-center gap-2 pr-2 transition-colors ${
											isActive
												? "bg-primary/8 text-primary"
												: "hover:bg-warm-200 text-text-secondary"
										}`}
									>
										<button
											type="button"
											onClick={() => scrollToMessage(msg.id)}
											className="flex-1 min-w-0 flex items-center gap-2 pl-3 py-1.5 text-left"
										>
											<span
												className={`shrink-0 rounded-full transition-[color,background-color,border-color,opacity,box-shadow,transform] ${
													isActive
														? "w-2.5 h-0.5 bg-primary"
														: "w-1.5 h-0.5 bg-current opacity-40"
												}`}
											/>
											<span className="flex-1 text-xs truncate leading-5">
												{preview || "（空消息）"}
											</span>
										</button>
										{onDeleteMessage && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onDeleteMessage(msg.id);
												}}
												className="opacity-0 group-hover:opacity-100 p-0.5 rounded-lg hover:bg-error-muted hover:text-error transition-[color,background-color,border-color,opacity,box-shadow,transform]"
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
					<div className="h-full w-full flex flex-col justify-center items-center pr-0.5">
						{userMessages.map((msg) => {
							const isActive = msg.id === activeId;
							return (
								<button
									key={msg.id}
									type="button"
									onClick={() => scrollToMessage(msg.id)}
									className="group/line flex items-center justify-center py-1.5 px-2 cursor-pointer"
									title={msg.content.slice(0, 40)}
								>
									<span
										className={`block rounded-full transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ${
											isActive
												? "w-2.5 h-1 bg-primary"
												: "w-2 h-0.5 bg-text-muted/40 group-hover/line:bg-text-muted"
										}`}
									/>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
