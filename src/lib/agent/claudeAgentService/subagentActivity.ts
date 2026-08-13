import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentMessage } from "./types";

/**
 * 捕获子代理的内部活动（通过 parent_tool_use_id 关联到 Task 工具）
 * 并将其转化为 tool_progress 事件，从而在前端 SubagentCard 中展示。
 */
export function emitSubagentActivityMessages(
	message: SDKMessage,
	emit: (message: AgentMessage) => void,
): void {
	const msgAny = message as any;

	// 检查是否有关联的父级工具调用（即子代理所属的 Task）
	const parentToolUseId = msgAny?.parent_tool_use_id;
	if (!parentToolUseId) return;

	// 尝试查找 SDK 的 tool_use_id 对应的内部工具 ID
	// 注意：这里需要一个反向映射，或者我们在 tool_call_start 时记录了 sdk_tool_use_id
	// 目前 toolNamesById 存储的是 sdk_tool_use_id -> toolName
	// 我们直接使用 sdk_tool_use_id (即 parentToolUseId) 作为关联键，因为 AgentStore 里已规范化 ID
	// 但前端 AgentStore 使用的 ID 是 `sdk-tool-${sdkId}`

	const internalToolCallId = `sdk-tool-${parentToolUseId}`;

	// 提取子代理的活动内容
	if (msgAny.type === "assistant" && Array.isArray(msgAny.message?.content)) {
		for (const block of msgAny.message.content) {
			if (
				block.type === "text" &&
				typeof block.text === "string" &&
				block.text.trim()
			) {
				// 子代理的思考/回复
				emit({
					type: "tool_progress",
					content: block.text,
					taskId: "", // context 中没有 taskId，前端需根据 toolCallId 匹配
					toolCallId: internalToolCallId,
					progress: -1, // -1 表示非进度条更新，而是活动流更新
					message: JSON.stringify({
						type: "thinking", // 复用 AgentThinkingStep 类型
						phase: "executing",
						content: block.text,
						timestamp: Date.now(),
					}),
				});
			} else if (block.type === "tool_use") {
				// 子代理调用工具
				const toolName = block.name;
				const inputDetails = Object.keys(block.input || {}).join(", ");
				const toolUseMessage = `调用工具: ${toolName}(${inputDetails})`;
				emit({
					type: "tool_progress",
					content: toolUseMessage,
					taskId: "",
					toolCallId: internalToolCallId,
					progress: -1,
					message: JSON.stringify({
						type: "executing", // 借用 phase 类型，或者在前端解析时处理
						phase: "executing",
						content: toolUseMessage,
						timestamp: Date.now(),
					}),
				});
			}
		}
	}
}
