// 滚到底部浮动按钮
// 当用户上滚离开底部时浮现，红点指示有未读新消息

import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";

interface ScrollToBottomFabProps {
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	shouldAutoScrollRef: MutableRefObject<boolean>;
	/** 消息数量变化时触发红点提示 */
	messageCount: number;
}

export function ScrollToBottomFab({
	scrollContainerRef,
	shouldAutoScrollRef,
	messageCount,
}: ScrollToBottomFabProps) {
	const [visible, setVisible] = useState(false);
	const [hasUnread, setHasUnread] = useState(false);
	const prevMessageCountRef = useRef(messageCount);

	// 监听滚动位置，决定是否显示按钮
	useEffect(() => {
		const el = scrollContainerRef.current;
		if (!el) return;

		const handleScroll = () => {
			const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
			const atBottom = distanceToBottom < 120;
			setVisible(!atBottom);
			if (atBottom) {
				setHasUnread(false);
			}
		};

		el.addEventListener("scroll", handleScroll, { passive: true });
		handleScroll();
		return () => el.removeEventListener("scroll", handleScroll);
	}, [scrollContainerRef]);

	// 新消息到来时（且当前不在底部），显示红点
	useEffect(() => {
		if (messageCount !== prevMessageCountRef.current) {
			prevMessageCountRef.current = messageCount;
			if (!shouldAutoScrollRef.current) {
				setHasUnread(true);
			}
		}
	}, [messageCount, shouldAutoScrollRef]);

	const handleClick = () => {
		const el = scrollContainerRef.current;
		if (el) {
			el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		}
		shouldAutoScrollRef.current = true;
		setHasUnread(false);
	};

	if (!visible) return null;

	return (
		<button
			type="button"
			onClick={handleClick}
			className="absolute bottom-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-surface border border-border shadow-md hover:shadow-lg hover:border-primary/40 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 text-text-secondary hover:text-text-primary animate-in fade-in slide-in-from-bottom-2 duration-150"
			title="滚到底部"
		>
			{hasUnread && (
				<span className="absolute -top-1 -right-1 w-3 h-3 bg-error rounded-full border-2 border-surface" />
			)}
			<ArrowDown className="w-3.5 h-3.5" />
		</button>
	);
}
