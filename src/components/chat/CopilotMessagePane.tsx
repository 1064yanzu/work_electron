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
import { ShinyText } from "../ui/ShinyText";
import { WelcomeScreen } from "./WelcomeScreen";

interface CopilotMessagePaneProps {
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	messagesEndRef: RefObject<HTMLDivElement | null>;
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
				className="flex-1 overflow-y-auto px-4 py-4"
			>
				{messages.length === 0 ? (
					<div className="h-full relative">
						<WelcomeScreen />
						{currentResearch && currentResearch.status !== "completed" && (
							<div className="absolute bottom-0 left-0 right-0 p-3 mx-4 mb-4 bg-surface/90 backdrop-blur-md border border-border rounded-2xl shadow-bai-pop animate-in slide-in-from-bottom-2 duration-250">
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
					/* 中心阅读列：消息不随面板宽度无限拉伸（Codex/Claude 同款约束），
					   超宽显示器上正文行长保持在舒适阅读范围 */
					<div className="mx-auto w-full max-w-[44rem] space-y-6">
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

						{/* 等待态刻意安静：一行扫光文字足够，堆动画只会显得廉价（Codex 同款处理） */}
						{isWaitingForLLM && chatMode === "agent" && (
							<div className="flex items-center gap-3 px-1 py-1 animate-in fade-in duration-250">
								<div className="w-6 h-6 rounded-full bg-warm-200 flex items-center justify-center shrink-0">
									<CircleUser className="w-3.5 h-3.5 text-text-secondary" />
								</div>
								<ShinyText
									className="text-sm"
									color="var(--t-text-muted, #9D9D98)"
									shineColor="var(--t-text-primary, #1A1A19)"
									speed={1.8}
								>
									正在思考中
								</ShinyText>
							</div>
						)}
					</div>
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

// 逐字段 `===` 的比较器与 memo 默认浅比较等价，只是多了一份会腐化的清单
// （新增 prop 忘记补一行 = 组件静默不更新）。用默认比较。
export const CopilotMessagePane = memo(CopilotMessagePaneImpl);
