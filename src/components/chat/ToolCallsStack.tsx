/**
 * ToolCallsStack - 简洁的工具调用列表
 *
 * 不再使用大卡片包装,直接渲染工具调用列表
 */

import { memo } from "react";
import type { ChatMessageBlock } from "../../lib/chat/types";
import type { ToolCall } from "../../lib/agent/types";
import ToolCallInline from "../agent/ToolCallInline";

type ToolCallBlock = Extract<ChatMessageBlock, { type: "tool_call" }>;

function ToolCallsStackImpl({ calls }: { calls: Array<ToolCallBlock> }) {
	// 直接渲染工具调用列表,不再用大卡片包装
	return (
		<div className="space-y-0.5">
			{calls.map((c) => {
				const fallbackData: ToolCall | undefined = c.toolCallId
					? {
							id: c.toolCallId,
							type: (c.toolType as any) || ("custom" as any),
							name: c.name || (c.toolType as string) || "Tool",
							status: (c.status as any) || "pending",
							input: c.input || {},
							output: c.output,
							error: c.error,
						}
					: undefined;

				return (
					<ToolCallInline
						key={c.toolCallId}
						taskId={c.taskId}
						toolCallId={c.toolCallId}
						initialData={fallbackData}
					/>
				);
			})}
		</div>
	);
}

// 父组件 AgentBlocksInline 每次渲染会重新构造 calls 数组（在 for 循环里 .push），
// 默认浅比较无法命中。这里对 calls 做轻量结构比较：长度 + 每个 toolCallId 一致即视为相同。
// ToolCallInline 自身用 selector 订阅 toolCall 内部数据，不依赖父组件传入的 input/output 变更。
export const ToolCallsStack = memo(ToolCallsStackImpl, (prev, next) => {
	if (prev.calls === next.calls) return true;
	if (prev.calls.length !== next.calls.length) return false;
	for (let i = 0; i < prev.calls.length; i++) {
		if (prev.calls[i].toolCallId !== next.calls[i].toolCallId) return false;
	}
	return true;
});
