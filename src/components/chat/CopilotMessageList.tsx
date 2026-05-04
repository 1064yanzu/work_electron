import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useMemo } from "react";
import type { RefObject } from "react";
import type { ChatMessage as ChatMessageType } from "../../lib/chat/types";
import { ChatMessage as ChatMessageComponent } from "./ChatMessage";

interface CopilotMessageListProps {
	scrollContainerRef: RefObject<HTMLDivElement>;
	messagesEndRef: RefObject<HTMLDivElement>;
	messages: ChatMessageType[];
	hiddenMessageCount: number;
	preferBlocks: boolean;
	canRegenerateMessages: boolean;
	onLoadOlderMessages: () => void;
	onRegenerateMessage: (messageId: string) => void;
}

const VIRTUALIZE_MESSAGE_THRESHOLD = 60;

function CopilotMessageListImpl({
	scrollContainerRef,
	messagesEndRef,
	messages,
	hiddenMessageCount,
	preferBlocks,
	canRegenerateMessages,
	onLoadOlderMessages,
	onRegenerateMessage,
}: CopilotMessageListProps) {
	const shouldVirtualizeMessages =
		messages.length > VIRTUALIZE_MESSAGE_THRESHOLD;
	const messageVirtualizer = useVirtualizer({
		count: shouldVirtualizeMessages ? messages.length : 0,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: () => 280,
		overscan: 6,
	});
	const regenerateHandler = useMemo(
		() => (canRegenerateMessages ? onRegenerateMessage : undefined),
		[canRegenerateMessages, onRegenerateMessage],
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
				<div
					style={{
						height: `${messageVirtualizer.getTotalSize()}px`,
						position: "relative",
					}}
				>
					{messageVirtualizer.getVirtualItems().map((virtualRow) => {
						const message = messages[virtualRow.index];
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
								<ChatMessageComponent
									message={message}
									preferBlocks={preferBlocks}
									onRegenerate={
										message.role === "assistant" ? regenerateHandler : undefined
									}
								/>
							</div>
						);
					})}
				</div>
			) : (
				messages.map((message) => (
					<ChatMessageComponent
						key={message.id}
						message={message}
						preferBlocks={preferBlocks}
						onRegenerate={
							message.role === "assistant" ? regenerateHandler : undefined
						}
					/>
				))
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
		prev.onLoadOlderMessages === next.onLoadOlderMessages &&
		prev.onRegenerateMessage === next.onRegenerateMessage,
);
