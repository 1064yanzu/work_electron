import { CircleUser, Loader2 } from "lucide-react";
import { memo } from "react";
import type { RefObject } from "react";
import type { AskUserQuestionRequest } from "../../lib/agent/askUserQuestionStore";
import type { ChatMessage as ChatMessageType } from "../../lib/chat/types";
import { AskUserQuestionList } from "../agent/AskUserQuestionCard";
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
	pendingAskUserRequests: AskUserQuestionRequest[];
	onScroll: () => void;
	onLoadOlderMessages: () => void;
	onRegenerateMessage: (messageId: string) => void;
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
	pendingAskUserRequests,
	onScroll,
	onLoadOlderMessages,
	onRegenerateMessage,
	onOpenResearch,
	onAllowAskUserQuestion,
	onDenyAskUserQuestion,
}: CopilotMessagePaneProps) {
	return (
		<div
			ref={scrollContainerRef}
			onScroll={onScroll}
			className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide"
		>
			{messages.length === 0 ? (
				<div className="h-full relative">
					<WelcomeScreen />
					{currentResearch && currentResearch.status !== "completed" && (
						<div className="absolute bottom-0 left-0 right-0 p-3 mx-4 mb-4 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-lg animate-in slide-in-from-bottom-2 duration-300">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2.5">
									<div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
										<Loader2 className="w-4 h-4 text-primary animate-spin" />
									</div>
									<div className="flex flex-col">
										<span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
											正在进行深度研究...
										</span>
										<span className="text-xs text-zinc-400 dark:text-zinc-500">
											AI 正在分析相关资料
										</span>
									</div>
								</div>
								<button
									onClick={onOpenResearch}
									aria-label="查看研究进度"
									className="px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
								>
									查看进度
								</button>
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
						onLoadOlderMessages={onLoadOlderMessages}
						onRegenerateMessage={onRegenerateMessage}
					/>

					{isWaitingForLLM && chatMode === "agent" && (
						<div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
							<div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 dark:from-zinc-300 dark:to-zinc-500 flex items-center justify-center shrink-0 shadow-md">
								<CircleUser className="w-4 h-4 text-white dark:text-zinc-900" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="inline-flex items-center gap-3 px-4 py-3 bg-surface dark:bg-zinc-800/50 rounded-2xl border border-border shadow-sm">
									<div className="relative flex items-center justify-center">
										<div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
										<div className="absolute w-2 h-2 bg-primary rounded-full animate-pulse" />
									</div>
									<div className="flex flex-col">
										<span className="text-sm font-medium text-text-primary">
											正在思考中...
										</span>
										<span className="text-xs text-text-muted">
											AI 正在分析您的请求
										</span>
									</div>
									<div className="flex gap-1 ml-2">
										<span
											className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
											style={{ animationDelay: "0ms" }}
										/>
										<span
											className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
											style={{ animationDelay: "150ms" }}
										/>
										<span
											className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
											style={{ animationDelay: "300ms" }}
										/>
									</div>
								</div>
							</div>
						</div>
					)}

					{pendingAskUserRequests.length > 0 && (
						<div className="px-4 pb-3 shrink-0">
							<AskUserQuestionList
								requests={pendingAskUserRequests}
								onAllow={onAllowAskUserQuestion}
								onDeny={onDenyAskUserQuestion}
							/>
						</div>
					)}
				</>
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
		prev.pendingAskUserRequests === next.pendingAskUserRequests &&
		prev.onScroll === next.onScroll &&
		prev.onLoadOlderMessages === next.onLoadOlderMessages &&
		prev.onRegenerateMessage === next.onRegenerateMessage &&
		prev.onOpenResearch === next.onOpenResearch &&
		prev.onAllowAskUserQuestion === next.onAllowAskUserQuestion &&
		prev.onDenyAskUserQuestion === next.onDenyAskUserQuestion,
);
