import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useMemo } from "react";
import type { RefObject } from "react";
import { getCachedPerformanceTuning } from "../../lib/config";
import type { ChatMessage as ChatMessageType } from "../../lib/chat/types";
import { ChatMessage as ChatMessageComponent } from "./ChatMessage";

interface CopilotMessageListProps {
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	messagesEndRef: RefObject<HTMLDivElement | null>;
	messages: ChatMessageType[];
	hiddenMessageCount: number;
	preferBlocks: boolean;
	canRegenerateMessages: boolean;
	/** 当前会话是否处于错误状态，用于在最后一条用户消息显示重试 */
	sessionHasError?: boolean;
	onLoadOlderMessages: () => void;
	onRegenerateMessage: (messageId: string) => void;
	onEditMessage?: (messageId: string, newContent: string) => void;
	onDeleteMessage?: (messageId: string) => void;
}

const VIRTUALIZE_MESSAGE_THRESHOLD = 60;

/**
 * 分段虚拟化：尾部 N 条永远常规渲染。
 * 流式输出只发生在尾部，高度变化完全不经过 virtualizer，
 * sticky-to-bottom 与 rAF 滚动逻辑零改动、不再和估算高度打架；
 * 历史区（上滚才看的部分）高度稳定，虚拟化估算准确。
 */
const TAIL_ALWAYS_RENDERED = 8;

function CopilotMessageListImpl({
	scrollContainerRef,
	messagesEndRef,
	messages,
	hiddenMessageCount,
	preferBlocks,
	canRegenerateMessages,
	sessionHasError,
	onLoadOlderMessages,
	onRegenerateMessage,
	onEditMessage,
	onDeleteMessage,
}: CopilotMessageListProps) {
	// 设置面板「长对话虚拟渲染」开关（默认开；关闭走全量渲染 + content-visibility）
	const virtualizationEnabled = getCachedPerformanceTuning().chatVirtualization;
	const shouldVirtualizeMessages =
		virtualizationEnabled &&
		messages.length > VIRTUALIZE_MESSAGE_THRESHOLD + TAIL_ALWAYS_RENDERED;

	const headCount = shouldVirtualizeMessages
		? messages.length - TAIL_ALWAYS_RENDERED
		: 0;
	const { headMessages, tailMessages } = useMemo(
		() => ({
			headMessages: shouldVirtualizeMessages
				? messages.slice(0, headCount)
				: [],
			tailMessages: shouldVirtualizeMessages
				? messages.slice(headCount)
				: messages,
		}),
		[messages, headCount, shouldVirtualizeMessages],
	);

	const messageVirtualizer = useVirtualizer({
		count: headCount,
		getScrollElement: () => scrollContainerRef.current,
		// 按角色粗分估高：用户消息通常短，助手消息含工具卡/代码块偏长
		estimateSize: (index) => (headMessages[index]?.role === "user" ? 120 : 320),
		overscan: 6,
		// 稳定 key：加载更早消息会在头部插入，按 id 对齐测量缓存避免错位
		getItemKey: (index) => headMessages[index]?.id ?? index,
	});
	const regenerateHandler = useMemo(
		() => (canRegenerateMessages ? onRegenerateMessage : undefined),
		[canRegenerateMessages, onRegenerateMessage],
	);

	// 计算最后一条用户消息的 id（用于 C.4 失败重试）
	const lastUserMessageId = useMemo(() => {
		if (!sessionHasError) return null;
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === "user") return messages[i].id;
		}
		return null;
	}, [messages, sessionHasError]);

	const renderMessage = (message: ChatMessageType) => (
		<ChatMessageComponent
			key={message.id}
			message={message}
			preferBlocks={preferBlocks}
			onRegenerate={
				message.role === "assistant" ? regenerateHandler : undefined
			}
			onEditSubmit={message.role === "user" ? onEditMessage : undefined}
			onDelete={onDeleteMessage}
			isFailedUserMessage={
				sessionHasError ? message.id === lastUserMessageId : undefined
			}
		/>
	);

	return (
		<>
			{hiddenMessageCount > 0 ? (
				<div className="flex justify-center">
					<button
						type="button"
						onClick={onLoadOlderMessages}
						className="px-3 py-1.5 rounded-full text-xs text-text-muted bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 transition-colors"
					>
						加载更早消息（{hiddenMessageCount} 条）
					</button>
				</div>
			) : null}

			{shouldVirtualizeMessages ? (
				<>
					{/* 历史区：虚拟化 */}
					<div
						style={{
							height: `${messageVirtualizer.getTotalSize()}px`,
							position: "relative",
						}}
					>
						{messageVirtualizer.getVirtualItems().map((virtualRow) => {
							const message = headMessages[virtualRow.index];
							if (!message) return null;
							return (
								<div
									key={message.id}
									data-index={virtualRow.index}
									ref={messageVirtualizer.measureElement}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										transform: `translateY(${virtualRow.start}px)`,
									}}
								>
									{renderMessage(message)}
								</div>
							);
						})}
					</div>
					{/* 尾部：常规渲染（流式高度变化不经过 virtualizer） */}
					{tailMessages.map((message) => renderMessage(message))}
				</>
			) : (
				// 全量渲染路径：给离屏消息 content-visibility 渐进增强（最后一条除外，正在流式）
				tailMessages.map((message, i) => {
					const isLast = i === tailMessages.length - 1;
					return isLast ? (
						renderMessage(message)
					) : (
						<div key={message.id} className="chat-cv-auto">
							{renderMessage(message)}
						</div>
					);
				})
			)}

			<div ref={messagesEndRef} />
		</>
	);
}

export const CopilotMessageList = memo(
	CopilotMessageListImpl,
	(prev, next) =>
		prev.scrollContainerRef === next.scrollContainerRef &&
		prev.messagesEndRef === next.messagesEndRef &&
		prev.messages === next.messages &&
		prev.hiddenMessageCount === next.hiddenMessageCount &&
		prev.preferBlocks === next.preferBlocks &&
		prev.canRegenerateMessages === next.canRegenerateMessages &&
		prev.sessionHasError === next.sessionHasError &&
		prev.onLoadOlderMessages === next.onLoadOlderMessages &&
		prev.onRegenerateMessage === next.onRegenerateMessage &&
		prev.onEditMessage === next.onEditMessage &&
		prev.onDeleteMessage === next.onDeleteMessage,
);
