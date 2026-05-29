import { CircleUser, Loader2 } from "lucide-react";
import { memo } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { AskUserQuestionRequest } from "../../lib/agent/askUserQuestionStore";
import type { ChatMessage as ChatMessageType } from "../../lib/chat/types";
import { AskUserQuestionList } from "../agent/AskUserQuestionCard";
import { Button } from "../ui/Button";
import { ScrollToBottomFab } from "../copilot/ScrollToBottomFab";
import { CopilotMessageJumper } from "../copilot/CopilotMessageJumper";
import { CopilotMessageList } from "./CopilotMessageList";
import { WelcomeScreen } from "./WelcomeScreen";

interface CopilotMessagePaneProps {
	scrollContainerRef: RefObject<HTMLDivElement>;
	messagesEndRef: RefObject<HTMLDivElement>;
	messages: ChatMessageType[];
	hiddenMessageCount: number;
	currentResearch: {
		status?: string;
	} | null;
	isStreaming: boolean;
	isAgentExecuting: boolean;
	isWaitingForLLM: boolean;
	chatMode: "chat" | "agent";
	preferBlocks: boolean;
	sessionHasError?: boolean;
	pendingAskUserRequests: AskUserQuestionRequest[];
	shouldAutoScrollRef: MutableRefObject<boolean>;
	onScroll: () => void;
	onLoadOlderMessages: () => void;
	onRegenerateMessage: (messageId: string) => void;
	onEditMessage?: (messageId: string, newContent: string) => void;
	onDeleteMessage?: (messageId: string) => void;
	onOpenResearch: () => void;
	onAllowAskUserQuestion: (
		requestId: string,
		updatedInput: Record<string, unknown>,
	) => void;
	onDenyAskUserQuestion: (requestId: string, message?: string) => void;
}
function CopilotMessagePaneImpl({
	scrollContainerRef,
	messagesEndRef,
	messages,
	hiddenMessageCount,
	currentResearch,
	isStreaming,
	isAgentExecuting,
	isWaitingForLLM,
	chatMode,
	preferBlocks,
	sessionHasError,
	pendingAskUserRequests,
	shouldAutoScrollRef,
	onScroll,
	onLoadOlderMessages,
	onRegenerateMessage,
	onEditMessage,
	onDeleteMessage,
	onOpenResearch,
	onAllowAskUserQuestion,
	onDenyAskUserQuestion,
}: CopilotMessagePaneProps) {
	return (
		<div className="flex-1 min-h-0 relative flex flex-col">
			{/* 可滚动的消息区域 */}
			<div
				ref={scrollContainerRef}
				onScroll={onScroll}
				className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide"
			>
				{messages.length === 0 ? (
					<div className="h-full relative">
						<WelcomeScreen />
						{currentResearch && currentResearch.status !== "completed" && (
							<div className="absolute bottom-0 left-0 right-0 p-3 mx-4 mb-4 bg-surface/90 backdrop-blur-md border border-border rounded-2xl shadow-[0_4px_12px_0_rgb(26_26_25/0.06)] animate-in slide-in-from-bottom-2 duration-300">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2.5">
										<div className="w-8 h-8 rounded-full bg-warm-200 flex items-center justify-center">
											<Loader2
												className="w-4 h-4 text-text-secondary animate-spin"
												strokeWidth={1.5}
											/>
										</div>
										<div className="flex flex-col">
											<span className="text-sm font-medium text-text-primary">
												正在进行深度研究...
											</span>
											<span className="text-xs text-text-muted">
												正在分析相关资料
											</span>
										</div>
									</div>
									<Button
										onClick={onOpenResearch}
										aria-label="查看研究进度"
										variant="primary"
										size="sm"
									>
										查看进度
									</Button>
								</div>
							</div>
						)}
					</div>
				) : (
					<>
						<CopilotMessageList
							scrollContainerRef={scrollContainerRef}
							messagesEndRef={messagesEndRef}
							messages={messages}
							hiddenMessageCount={hiddenMessageCount}
							preferBlocks={preferBlocks}
							canRegenerateMessages={!isStreaming && !isAgentExecuting}
							sessionHasError={sessionHasError}
							onLoadOlderMessages={onLoadOlderMessages}
							onRegenerateMessage={onRegenerateMessage}
							onEditMessage={onEditMessage}
							onDeleteMessage={onDeleteMessage}
						/>

						{isWaitingForLLM && chatMode === "agent" && (
							<div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
								<div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 dark:from-zinc-300 dark:to-zinc-500 flex items-center justify-center shrink-0 shadow-md">
									<CircleUser className="w-4 h-4 text-white" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="inline-flex items-center gap-3 px-4 py-3 bg-surface/50 rounded-2xl border border-border shadow-sm">
										<div className="relative flex items-center justify-center">
											<div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
											<div className="absolute w-2 h-2 bg-primary rounded-full animate-pulse" />
										</div>
										<div className="flex flex-col">
											<span className="text-sm font-medium text-text-primary">
												正在思考中...
											</span>
											<span className="text-xs text-text-muted">
												正在分析您的请求
											</span>
										</div>
										<div className="flex gap-1 ml-2">
											<span
												className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce"
												style={{ animationDelay: "0ms" }}
											/>
											<span
												className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce"
												style={{ animationDelay: "150ms" }}
											/>
											<span
												className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce"
												style={{ animationDelay: "300ms" }}
											/>
										</div>
									</div>
								</div>
							</div>
						)}
					</>
				)}
			</div>

			{/* 滚到底部浮动按钮 */}
			<ScrollToBottomFab
				scrollContainerRef={scrollContainerRef}
				shouldAutoScrollRef={shouldAutoScrollRef}
				messageCount={messages.length}
			/>

			{/* DeepSeek 风格消息导航条 */}
			{messages.length > 0 && (
				<CopilotMessageJumper
					messages={messages}
					scrollContainerRef={scrollContainerRef}
					onDeleteMessage={onDeleteMessage}
				/>
			)}

			{/* AskUserQuestion 浮动弹窗 — 覆盖在聊天区域上方 */}
			{pendingAskUserRequests.length > 0 && (
				<AskUserQuestionList
					requests={pendingAskUserRequests}
					onAllow={onAllowAskUserQuestion}
					onDeny={onDenyAskUserQuestion}
				/>
			)}
		</div>
	);
}

export const CopilotMessagePane = memo(
	CopilotMessagePaneImpl,
	(prev, next) =>
		prev.scrollContainerRef === next.scrollContainerRef &&
		prev.messagesEndRef === next.messagesEndRef &&
		prev.messages === next.messages &&
		prev.hiddenMessageCount === next.hiddenMessageCount &&
		prev.currentResearch === next.currentResearch &&
		prev.isStreaming === next.isStreaming &&
		prev.isAgentExecuting === next.isAgentExecuting &&
		prev.isWaitingForLLM === next.isWaitingForLLM &&
		prev.chatMode === next.chatMode &&
		prev.preferBlocks === next.preferBlocks &&
		prev.sessionHasError === next.sessionHasError &&
		prev.pendingAskUserRequests === next.pendingAskUserRequests &&
		prev.shouldAutoScrollRef === next.shouldAutoScrollRef &&
		prev.onScroll === next.onScroll &&
		prev.onLoadOlderMessages === next.onLoadOlderMessages &&
		prev.onRegenerateMessage === next.onRegenerateMessage &&
		prev.onEditMessage === next.onEditMessage &&
		prev.onDeleteMessage === next.onDeleteMessage &&
		prev.onOpenResearch === next.onOpenResearch &&
		prev.onAllowAskUserQuestion === next.onAllowAskUserQuestion &&
		prev.onDenyAskUserQuestion === next.onDenyAskUserQuestion,
);
