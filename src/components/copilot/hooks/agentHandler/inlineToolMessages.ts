import type { AgentMessage } from "@/lib/agent/claudeAgentService";
import { buildFileUpdateFromToolInput } from "@/lib/chat/fileUpdateFromTool";
import type { StreamBlocksBuilder } from "@/lib/chat/streamBlocksBuilder";

export function normalizeSdkToolCallId(toolCallId: string | undefined): string {
	const raw = String(toolCallId || "").trim();
	if (!raw) return "";
	return raw.startsWith("sdk-tool-") ? raw : `sdk-tool-${raw}`;
}

export function createInlineToolMessageHandler(deps: {
	streamBuilder: StreamBlocksBuilder;
	inlineTraceEnabled: boolean;
	getCurrentInlineTaskId: () => string;
	getCurrentWorkingDirectory: () => string | undefined;
	ensureStreamingMessage: () => void;
	updateStreamingMessage: () => void;
	touchActivity: () => void;
}): (message: AgentMessage) => void {
	const {
		streamBuilder,
		inlineTraceEnabled,
		getCurrentInlineTaskId,
		getCurrentWorkingDirectory,
		ensureStreamingMessage,
		updateStreamingMessage,
		touchActivity,
	} = deps;

	const toolNameByInlineId = new Map<string, string>();
	const toolInputByInlineId = new Map<string, Record<string, unknown>>();
	const placeholderShownForToolCallId = new Set<string>();

	const upsertInlineFileUpdate = (
		message: AgentMessage,
		status: "running" | "completed" | "error",
		forceEmptyInput = false,
	) => {
		const toolCallId = normalizeSdkToolCallId(message.toolCallId);
		if (!toolCallId) return false;
		const mergedInput = forceEmptyInput
			? null
			: message.toolInput || toolInputByInlineId.get(toolCallId) || null;
		const mergedToolName =
			message.toolName || toolNameByInlineId.get(toolCallId);
		const update = buildFileUpdateFromToolInput({
			toolName: mergedToolName,
			toolCallId,
			toolInput: mergedInput,
			status,
			baseDir: getCurrentWorkingDirectory(),
		});
		if (!update) return false;
		ensureStreamingMessage();
		streamBuilder.upsertFileUpdate(update);
		updateStreamingMessage();
		return true;
	};

	return (message: AgentMessage) => {
		if (message.type === "tool_call") {
			const toolCallId = normalizeSdkToolCallId(message.toolCallId);
			if (!toolCallId) return;
			if (message.toolName)
				toolNameByInlineId.set(toolCallId, message.toolName);
			if (message.toolInput)
				toolInputByInlineId.set(toolCallId, message.toolInput);

			// 第一次见到这个 tool_call：先显示占位卡片（"创建文件中…"），
			// 让用户能立刻感知到工具开始执行。
			// 即便 SDK 在 content_block_start 就给出完整 input，也强制经历一次占位帧。
			const isFirstSighting = !placeholderShownForToolCallId.has(toolCallId);
			if (isFirstSighting) {
				placeholderShownForToolCallId.add(toolCallId);
				const placeholderShown = upsertInlineFileUpdate(
					message,
					"running",
					true,
				);
				// 下一帧再用真实 input 更新（让占位至少经过一次渲染）
				if (placeholderShown && message.toolInput) {
					requestAnimationFrame(() => {
						upsertInlineFileUpdate(message, "running");
					});
				}
			}

			const didShowFileUpdate =
				isFirstSighting || upsertInlineFileUpdate(message, "running");
			if (inlineTraceEnabled) {
				ensureStreamingMessage();
				streamBuilder.startToolCall({
					type: "tool_call",
					taskId: getCurrentInlineTaskId(),
					toolCallId,
					name: message.toolName,
					status: "running",
					input: message.toolInput,
				});
				updateStreamingMessage();
			} else if (didShowFileUpdate) {
				touchActivity();
			}
			return;
		}

		if (message.type === "tool_input_update") {
			const toolCallId = normalizeSdkToolCallId(message.toolCallId);
			if (!toolCallId) return;
			if (message.toolInput)
				toolInputByInlineId.set(toolCallId, message.toolInput);
			if (inlineTraceEnabled) {
				streamBuilder.updateToolCall(toolCallId, (block) => ({
					...block,
					input: message.toolInput || block.input,
				}));
			}
			upsertInlineFileUpdate(message, "running");
			if (inlineTraceEnabled) updateStreamingMessage();
			return;
		}

		if (message.type === "tool_result") {
			const toolCallId = normalizeSdkToolCallId(message.toolCallId);
			if (!toolCallId) return;
			const status = message.status === "error" ? "error" : "completed";
			if (inlineTraceEnabled) {
				streamBuilder.updateToolCall(toolCallId, (block) => ({
					...block,
					status,
					output: message.toolOutput,
					error: message.status === "error" ? message.content : block.error,
				}));
			}
			const didShowFileUpdate = upsertInlineFileUpdate(message, status);
			if (inlineTraceEnabled || didShowFileUpdate) {
				updateStreamingMessage();
			}
		}
	};
}
