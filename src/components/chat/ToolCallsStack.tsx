/**
 * ToolCallsStack - 简洁的工具调用列表
 *
 * 不再使用大卡片包装,直接渲染工具调用列表
 */

import type { ChatMessageBlock } from "../../lib/chat/types";
import type { ToolCall } from "../../lib/agent/types";
import ToolCallInline from "../agent/ToolCallInline";

export function ToolCallsStack({
	calls,
}: {
	calls: Array<Extract<ChatMessageBlock, { type: "tool_call" }>>;
}) {
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
