/**
 * 编程工作区 - 对话线程视图（中间主区域）
 * 基于 codingSessionStore 的新消息模型渲染
 */
import { Bot, User } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useCodingSessionSelector } from '../../lib/stores/codingSessionStore';
import type { CodingSessionMessage } from '../../lib/stores/codingSessionTypes';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { ToolCallCard } from './messages/ToolCallCard';
import { ThinkingPanel } from './messages/ThinkingPanel';
import { PermissionDialog } from './messages/PermissionDialog';
import { SubagentCard } from './messages/SubagentCard';
import { TeamPanel } from './messages/TeamPanel';
import { NotificationCard } from './messages/NotificationCard';
import { useBackendCapabilities } from '../../hooks/useBackendCapabilities';

interface CodingChatThreadProps {
	onResolvePermission?: (requestId: string, allow: boolean) => void;
	onAskUserAnswer?: (requestId: string, answers: Record<string, string>) => void;
}

export function CodingChatThread({ onResolvePermission, onAskUserAnswer }: CodingChatThreadProps) {
	const messages = useCodingSessionSelector((s) => s.messages);
	const pendingPermission = useCodingSessionSelector((s) => s.pendingPermission);
	const { isClaudeCode } = useBackendCapabilities();
	const scrollRef = useRef<HTMLDivElement>(null);

	// 自动滚动到底部
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages.length, messages[messages.length - 1]?.content, pendingPermission]);

	// AskUserQuestion 回答处理：
	// 判断 interaction_request 中 toolName 是否为 AskUserQuestion
	// 如果是，将其视为 Q&A 而非权限审批
	const isAskUserQuestion = pendingPermission?.toolName === 'AskUserQuestion';

	const handleAskUserAnswer = useCallback(
		(requestId: string, answers: Record<string, string>) => {
			// 通过权限审批机制回传答案（allow = true, 携带选择的答案）
			if (onResolvePermission) {
				// 将答案编码为 JSON 字符串作为 message 传递
				onResolvePermission(requestId, true);
			}
			onAskUserAnswer?.(requestId, answers);
		},
		[onResolvePermission, onAskUserAnswer],
	);

	if (messages.length === 0) {
		return <EmptyState />;
	}

	return (
		<div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
			<div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
				{messages.map((message) => (
					<MessageBubble
						key={message.id}
						message={message}
						onAskUserAnswer={handleAskUserAnswer}
					/>
				))}
			</div>

			{/* 权限审批浮窗（仅 Claude Code，排除 AskUserQuestion） */}
			{isClaudeCode && pendingPermission && onResolvePermission && !isAskUserQuestion && (
				<div className="sticky bottom-0">
					<PermissionDialog
						request={pendingPermission}
						onResolve={onResolvePermission}
					/>
				</div>
			)}
		</div>
	);
}

function MessageBubble({
	message,
	onAskUserAnswer,
}: {
	message: CodingSessionMessage;
	onAskUserAnswer?: (requestId: string, answers: Record<string, string>) => void;
}) {
	const isUser = message.role === 'user';
	const isSystem = message.role === 'system';

	if (isSystem) {
		return (
			<div className="flex justify-center">
				<span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">
					{message.content}
				</span>
			</div>
		);
	}

	return (
		<div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
			{/* 头像 */}
			<div
				className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
					isUser
						? 'bg-zinc-200 dark:bg-zinc-700'
						: 'bg-[#D96C46]/10'
				}`}
			>
				{isUser ? (
					<User className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
				) : (
					<Bot className="w-3.5 h-3.5 text-[#D96C46]" />
				)}
			</div>

			{/* 消息内容 */}
			<div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
				{/* 思考过程 */}
				{!isUser && message.thinkingBlocks.length > 0 && (
					<ThinkingPanel blocks={message.thinkingBlocks} />
				)}

				{/* 工具调用 */}
				{!isUser && message.toolCalls.length > 0 && (
					<div className="space-y-2 mb-3">
						{message.toolCalls.map((tc) => (
							<ToolCallCard
								key={tc.id}
								toolCall={tc}
								onAskUserAnswer={onAskUserAnswer}
							/>
						))}
					</div>
				)}

				{/* 子代理活动 */}
				{!isUser && message.subagents.length > 0 && (
					<div className="space-y-2 mb-3">
						{message.subagents.map((sa) => (
							<SubagentCard key={sa.id} subagent={sa} />
						))}
					</div>
				)}

				{/* 团队协作信息 */}
				{!isUser && message.team && <TeamPanel team={message.team} />}

				{/* 任务通知 */}
				{!isUser && message.notifications.length > 0 && (
					<div className="space-y-1 mb-2">
						{message.notifications.map((n) => (
							<NotificationCard key={n.id} notification={n} />
						))}
					</div>
				)}

				{/* 文本内容 */}
				{message.content && (
					<div
						className={`inline-block max-w-full text-left ${
							isUser
								? 'bg-[#D96C46] text-white rounded-2xl rounded-tr-md px-4 py-2.5'
								: 'prose prose-sm dark:prose-invert prose-zinc max-w-none'
						}`}
					>
						{isUser ? (
							<p className="text-sm whitespace-pre-wrap">{message.content}</p>
						) : (
							<MarkdownRenderer content={message.content} />
						)}
					</div>
				)}

				{/* 流式输出指示 */}
				{message.isStreaming && !message.content && message.toolCalls.length === 0 && (
					<div className="flex items-center gap-1 mt-1.5">
						<div className="flex gap-0.5">
							<div className="w-1.5 h-1.5 rounded-full bg-[#D96C46] animate-pulse" />
							<div className="w-1.5 h-1.5 rounded-full bg-[#D96C46] animate-pulse [animation-delay:100ms]" />
							<div className="w-1.5 h-1.5 rounded-full bg-[#D96C46] animate-pulse [animation-delay:200ms]" />
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="text-center max-w-md mx-auto px-4">
				<div className="w-16 h-16 rounded-2xl bg-[#D96C46]/10 flex items-center justify-center mx-auto mb-6">
					<Bot className="w-8 h-8 text-[#D96C46]" />
				</div>
				<h3 className="text-lg font-serif font-medium text-zinc-800 dark:text-zinc-200 mb-2">
					开始编程对话
				</h3>
				<p className="text-sm text-zinc-400 leading-relaxed">
					描述你想要实现的功能，AI 会通过 Claude Code CLI 自主分析项目结构并编写代码。
					输入 <span className="font-mono text-[#D96C46]">/</span> 查看斜杠命令，
					或 <span className="font-mono text-[#D96C46]">@</span> 附加文件作为上下文。
				</p>
			</div>
		</div>
	);
}
