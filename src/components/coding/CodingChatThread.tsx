/**
 * 编程工作区 - 对话线程视图（中间主区域）
 * 参考 Claude Code / Codex 的设计语言：扁平化、紧凑、高信息密度
 */
import { Bot, User } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useCodingSessionSelector } from "../../lib/stores/codingSessionStore";
import type { CodingSessionMessage } from "../../lib/stores/codingSessionTypes";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { ToolCallCard } from "./messages/ToolCallCard";
import { ThinkingPanel } from "./messages/ThinkingPanel";
import { PermissionRequestCard } from "./messages/PermissionRequestCard";
import { SubagentCard } from "./messages/SubagentCard";
import { TeamPanel } from "./messages/TeamPanel";
import { NotificationCard } from "./messages/NotificationCard";
import { useBackendCapabilities } from "../../hooks/useBackendCapabilities";

interface CodingChatThreadProps {
	onResolvePermission?: (requestId: string, allow: boolean) => void;
	onAskUserAnswer?: (
		requestId: string,
		answers: Record<string, string>,
	) => void;
}

export function CodingChatThread({
	onResolvePermission,
	onAskUserAnswer,
}: CodingChatThreadProps) {
	const messages = useCodingSessionSelector((s) => s.messages);
	const pendingPermission = useCodingSessionSelector(
		(s) => s.pendingPermission,
	);
	const { isClaudeCode } = useBackendCapabilities();
	const scrollRef = useRef<HTMLDivElement>(null);

	// 自动滚动到底部
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [
		messages.length,
		messages[messages.length - 1]?.content,
		pendingPermission,
	]);

	// AskUserQuestion 回答处理
	const isAskUserQuestion = pendingPermission?.toolName === "AskUserQuestion";

	const handleAskUserAnswer = useCallback(
		(requestId: string, answers: Record<string, string>) => {
			if (onResolvePermission) {
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
			<div className="mx-auto max-w-3xl px-5 py-6 space-y-5">
				{messages.map((message) => (
					<MessageBubble
						key={message.id}
						message={message}
						onAskUserAnswer={handleAskUserAnswer}
					/>
				))}
			</div>

			{/* 权限审批卡片（仅 Claude Code，排除 AskUserQuestion） */}
			{isClaudeCode &&
				pendingPermission &&
				onResolvePermission &&
				!isAskUserQuestion && (
					<div className="sticky bottom-0 backdrop-blur-sm">
						<PermissionRequestCard
							request={pendingPermission}
							onResolve={onResolvePermission}
						/>
					</div>
				)}
		</div>
	);
}

/* ── 消息渲染 ────────────────────────────────────────────── */

function MessageBubble({
	message,
	onAskUserAnswer,
}: {
	message: CodingSessionMessage;
	onAskUserAnswer?: (
		requestId: string,
		answers: Record<string, string>,
	) => void;
}) {
	const isUser = message.role === "user";
	const isSystem = message.role === "system";

	// 系统消息 — 紧凑分隔线样式
	if (isSystem) {
		return <SystemDivider content={message.content} />;
	}

	// 用户消息 — 带微背景圆角卡片 + 用户图标
	if (isUser) {
		return <UserMessage content={message.content} />;
	}

	// Assistant 消息 — 扁平渲染
	return <AssistantMessage message={message} onAskUserAnswer={onAskUserAnswer} />;
}

/* ── 系统消息分隔线 ────────────────────────────────────────── */

function SystemDivider({ content }: { content: string }) {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-zinc-200/60 dark:bg-zinc-700/40" />
			<span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
				{content}
			</span>
			<div className="h-px flex-1 bg-zinc-200/60 dark:bg-zinc-700/40" />
		</div>
	);
}

/* ── 用户消息 ────────────────────────────────────────────── */

function UserMessage({ content }: { content: string }) {
	return (
		<div className="group relative">
			<div className="flex items-start gap-3">
				{/* 用户头像 */}
				<div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200/80 dark:bg-zinc-700/80">
					<User className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
				</div>
				{/* 内容区 */}
				<div className="flex-1 min-w-0 rounded-2xl bg-zinc-100/70 dark:bg-zinc-800/50 px-4 py-2.5">
					<div className="text-[13.5px] leading-[1.7] text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
						{content}
					</div>
				</div>
			</div>
		</div>
	);
}

/* ── Assistant 消息 ────────────────────────────────────────── */

function AssistantMessage({
	message,
	onAskUserAnswer,
}: {
	message: CodingSessionMessage;
	onAskUserAnswer?: (
		requestId: string,
		answers: Record<string, string>,
	) => void;
}) {
	const hasContent = !!message.content;
	const hasToolCalls = message.toolCalls.length > 0;
	const hasThinking = message.thinkingBlocks.length > 0;
	const hasSubagents = message.subagents.length > 0;
	const hasTeam = !!message.team;
	const hasNotifications = message.notifications.length > 0;

	return (
		<div className="space-y-2.5">
			{/* 思考过程 */}
			{hasThinking && (
				<ThinkingPanel blocks={message.thinkingBlocks} />
			)}

			{/* 工具调用 — 紧凑列表 */}
			{hasToolCalls && (
				<div className="space-y-1">
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
			{hasSubagents && (
				<div className="space-y-1.5">
					{message.subagents.map((sa) => (
						<SubagentCard key={sa.id} subagent={sa} />
					))}
				</div>
			)}

			{/* 团队协作信息 */}
			{hasTeam && message.team && <TeamPanel team={message.team} />}

			{/* 任务通知 */}
			{hasNotifications && (
				<div className="space-y-1">
					{message.notifications.map((n) => (
						<NotificationCard key={n.id} notification={n} />
					))}
				</div>
			)}

			{/* 文本内容 — 无背景扁平渲染，自定义排版 */}
			{hasContent && (
				<div className="coding-assistant-message text-[13.5px] leading-[1.75] text-zinc-800 dark:text-zinc-200">
					<MarkdownRenderer
						content={message.content}
						isStreaming={message.isStreaming}
					/>
					{/* 流式光标 */}
					{message.isStreaming && (
						<span className="inline-flex items-center ml-0.5 align-middle">
							<span className="w-[2.5px] h-[15px] rounded-full bg-[#D96C46] animate-pulse" />
						</span>
					)}
				</div>
			)}

			{/* 流式等待指示（无内容也无工具调用时） */}
			{message.isStreaming && !hasContent && !hasToolCalls && (
				<div className="flex items-center gap-1.5 py-1">
					<div className="flex gap-[3px]">
						<div className="h-1.5 w-1.5 rounded-full bg-[#D96C46]/70 animate-[pulse_1.4s_ease-in-out_infinite]" />
						<div className="h-1.5 w-1.5 rounded-full bg-[#D96C46]/70 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
						<div className="h-1.5 w-1.5 rounded-full bg-[#D96C46]/70 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
					</div>
				</div>
			)}
		</div>
	);
}

/* ── 空状态 ────────────────────────────────────────────── */

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
					描述你想要实现的功能，AI 会通过 Claude Code CLI
					自主分析项目结构并编写代码。 输入{" "}
					<span className="font-mono text-[#D96C46]">/</span> 查看斜杠命令， 或{" "}
					<span className="font-mono text-[#D96C46]">@</span>{" "}
					附加文件作为上下文。
				</p>
			</div>
		</div>
	);
}
