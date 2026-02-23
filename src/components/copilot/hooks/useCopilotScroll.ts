// 滚动管理 Hook

import { useCallback, useEffect, useRef } from "react";

interface UseCopilotScrollOptions {
	isStreaming: boolean;
	isAgentExecuting: boolean;
	activeSessionId: string | null;
	/** 依赖此值的变化来触发自动滚动 */
	messagesDep: unknown;
}

export function useCopilotScroll({
	isStreaming,
	isAgentExecuting,
	activeSessionId,
	messagesDep,
}: UseCopilotScrollOptions) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const scrollRafRef = useRef<number | null>(null);
	const shouldAutoScrollRef = useRef(true);

	const scrollToBottom = useCallback(() => {
		const el = scrollContainerRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
			return;
		}

		const behavior: ScrollBehavior =
			isStreaming || isAgentExecuting ? "auto" : "smooth";
		messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
	}, [isStreaming, isAgentExecuting]);

	const scheduleScrollToBottom = useCallback(() => {
		if (scrollRafRef.current !== null) return;
		scrollRafRef.current = window.requestAnimationFrame(() => {
			scrollRafRef.current = null;
			scrollToBottom();
		});
	}, [scrollToBottom]);

	const updateAutoScrollState = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		shouldAutoScrollRef.current = distanceToBottom < 120;
	}, []);

	// 消息变化时自动滚动
	useEffect(() => {
		if (shouldAutoScrollRef.current) {
			scheduleScrollToBottom();
		}
	}, [messagesDep, scheduleScrollToBottom]);

	// 清理 RAF
	useEffect(() => {
		return () => {
			if (scrollRafRef.current !== null) {
				window.cancelAnimationFrame(scrollRafRef.current);
				scrollRafRef.current = null;
			}
		};
	}, []);

	// 切换会话时刷新自动滚动判断
	useEffect(() => {
		updateAutoScrollState();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeSessionId]);

	return {
		scrollContainerRef,
		messagesEndRef,
		scrollToBottom,
		scheduleScrollToBottom,
		updateAutoScrollState,
		shouldAutoScrollRef,
	};
}
