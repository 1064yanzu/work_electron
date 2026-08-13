/**
 * ChatTraceMessage —— `role === "trace"` 消息的渲染分支。
 *
 * ## 为什么要从 ChatMessage 里拆出来
 *
 * 原先这三个分支写在 `ChatMessage` 内部，位置在 `useState`/`useTTS`/`useEffect`
 * 之后、两个 `useMemo` 之前，属于「Hook 之间的条件 early return」。
 * 流式期间 `chatStore.updateMessage` 会持续往 `metadata.blocks` 追加块，
 * `renderableAgentBlocks` 的判定会从 false 翻成 true，同一个组件实例前后两次
 * 渲染的 Hook 数量就对不上，React 会抛
 * "Rendered fewer hooks than expected"。
 *
 * 拆成独立组件后，trace 与非 trace 各自的 Hook 数量恒定；`ChatMessage` 退化成
 * 一个不含任何 Hook 的分派器，切换分支只是换组件类型（React 会正常卸载/挂载），
 * 不会出现 Hook 错位。
 */
import { memo } from "react";
import type {
	ChatMessage as ChatMessageType,
	ChatMessageBlock,
} from "../../lib/chat/types";
import ToolCallInline from "../agent/ToolCallInline";
import { AgentBlocksInline } from "./AgentBlocksInline";

export interface ChatTraceMessageProps {
	message: ChatMessageType;
	/**
	 * 虚拟化列表里必须关掉 `content-visibility`：
	 * 见 ChatMessage.tsx 中同名 prop 的说明。
	 */
	disableContentVisibility?: boolean;
}

/** 离屏渲染优化的内联样式；虚拟化路径下必须返回 undefined。 */
function cvStyle(disabled: boolean | undefined) {
	if (disabled) return undefined;
	return {
		contentVisibility: "auto",
		// auto 前缀：首次渲染后记住真实高度，快速滚动不再抖滚动条；
		// trace 块折叠态多为紧凑卡片，估值取 160px
		containIntrinsicSize: "auto 160px",
	} as const;
}

/** blocks 中是否存在「值得作为执行轨迹渲染」的块。 */
function hasRenderableAgentBlocks(
	blocks: ChatMessageBlock[] | undefined,
): boolean {
	return (
		Array.isArray(blocks) &&
		blocks.some(
			(b) =>
				b.type === "tool_call" ||
				b.type === "thought" ||
				b.type === "task_list" ||
				b.type === "file_update" ||
				b.type === "image",
		)
	);
}

/**
 * 这条消息是否应该走 trace 渲染分支。
 *
 * 注意：`role === "trace"` 但三个分支都不匹配时（例如只有 text block、
 * 又没有 metadata.trace），原实现是**继续往下走助手消息的渲染路径**把文本显示
 * 出来的。这个 fall-through 必须保留，所以判定单独抽成谓词，由 ChatMessage
 * 分派，而不是在 ChatTraceMessage 内部返回 null 了事。
 */
export function shouldRenderAsTrace(message: ChatMessageType): boolean {
	if (message.role !== "trace") return false;

	const trace = message.metadata?.trace;
	if (!trace && hasRenderableAgentBlocks(message.metadata?.blocks)) return true;
	if (trace?.type === "agent_task") return true;
	if (trace?.type === "tool_call") return true;

	return false;
}

function ChatTraceMessageImpl({
	message,
	disableContentVisibility,
}: ChatTraceMessageProps) {
	const isStreaming = !!message.isStreaming;
	const blocks = message.metadata?.blocks;
	const messageTaskId =
		message.metadata?.taskId ||
		(message.metadata?.trace?.type === "agent_task"
			? message.metadata.trace.taskId
			: undefined);

	const renderableAgentBlocks =
		!message.metadata?.trace &&
		Array.isArray(blocks) &&
		blocks.some(
			(b) =>
				b.type === "tool_call" ||
				b.type === "thought" ||
				b.type === "task_list" ||
				b.type === "file_update" ||
				b.type === "image",
		);

	if (renderableAgentBlocks) {
		return (
			<div
				className="group mb-6 animate-in fade-in slide-in-from-bottom-2 duration-250 w-full"
				style={cvStyle(disableContentVisibility)}
			>
				<AgentBlocksInline
					blocks={blocks as NonNullable<typeof blocks>}
					isStreaming={isStreaming}
					summaryTaskId={messageTaskId}
				/>
			</div>
		);
	}

	if (message.metadata?.trace?.type === "agent_task") {
		if (!Array.isArray(blocks)) return null;

		return (
			<div
				className="group mb-6 animate-in fade-in slide-in-from-bottom-2 duration-250 w-full"
				style={cvStyle(disableContentVisibility)}
			>
				<AgentBlocksInline
					blocks={blocks}
					isStreaming={isStreaming}
					summaryTaskId={messageTaskId}
				/>
			</div>
		);
	}

	if (message.metadata?.trace?.type === "tool_call") {
		const trace = message.metadata.trace;
		return (
			<div
				className="group mb-4 animate-in fade-in slide-in-from-bottom-2 duration-250 w-full"
				style={cvStyle(disableContentVisibility)}
			>
				{Array.isArray(blocks) ? (
					<AgentBlocksInline
						blocks={blocks}
						isStreaming={isStreaming}
						summaryTaskId={messageTaskId}
					/>
				) : (
					<ToolCallInline taskId={trace.taskId} toolCallId={trace.toolCallId} />
				)}
			</div>
		);
	}

	// 既没有可渲染的 blocks 也没有已知的 trace 类型：不占位
	return null;
}

export const ChatTraceMessage = memo(ChatTraceMessageImpl);
