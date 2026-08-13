// Copilot 输入区组件 — 输入框 + 文件拖入。
// 运行模式（执行 / 规划）已收进 ChatInput 工具栏的 pill，不再独占一行。
// 通过 React.memo 隔离父组件其他状态变化造成的重渲染。

import { memo, useCallback, useRef } from "react";
import { saveContextAttachmentFromFile } from "../../lib/chat/attachmentFiles";
import { workspaceStore } from "../../lib/workspaceStore";
import { ChatInput, type SubmitOptions } from "../chat/ChatInput";
import type { Model } from "../chat/ModelSelector";
import { toast } from "../ui/Toast";

interface CopilotInputAreaProps {
	isStreaming: boolean;
	isAgentExecuting: boolean;
	agentTaskType?: string;
	chatMode: "chat" | "agent";
	activeModel: string | null;
	enabledModels: Model[];
	planModeEnabled: boolean;
	onTogglePlanMode: (enabled: boolean) => void;
	onSendMessage: (content: string, options?: SubmitOptions) => void;
	onSelectModel: (id: string) => void;
	onOpenPromptLibrary: () => void;
	/** 停止流式 / Agent 执行 —— 响应期间发送键原位变停止键 */
	onStop: () => void;
}

function CopilotInputAreaImpl({
	isStreaming,
	isAgentExecuting,
	agentTaskType,
	chatMode,
	activeModel,
	enabledModels,
	planModeEnabled,
	onTogglePlanMode,
	onSendMessage,
	onSelectModel,
	onOpenPromptLibrary,
	onStop,
}: CopilotInputAreaProps) {
	const disabled = isStreaming || isAgentExecuting;
	// 响应期间输入框保持可打字（起草下一条），发送被拦截、发送键变停止键
	const placeholder = isAgentExecuting
		? agentTaskType === "research"
			? "研究进行中 — 可先起草，完成后发送"
			: "执行中 — 可先起草，完成后发送"
		: chatMode === "agent"
			? "描述你的需求，或用 / 唤起命令..."
			: "输入消息，或用 / 唤起命令...";
	// 窄栏用短文案，避免占位文字被截成半句
	const compactPlaceholder = isAgentExecuting
		? agentTaskType === "research"
			? "研究中，可起草"
			: "执行中，可起草"
		: "描述需求，/ 唤起命令";
	const isDraggingRef = useRef(false);

	const addFileToContext = workspaceStore.addFileToContext.bind(workspaceStore);

	const appendFilesToContext = useCallback(
		async (files: File[]) => {
			let successCount = 0;
			for (const [index, file] of files.entries()) {
				try {
					const normalizedFileName = file.name?.trim() || `file-${index}`;
					const attachment = await saveContextAttachmentFromFile(
						file,
						normalizedFileName,
					);
					addFileToContext(attachment);
					successCount += 1;
				} catch (err) {
					console.error("读取拖入文件失败:", err);
				}
			}
			return successCount;
		},
		[addFileToContext],
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			if (disabled) return;
			if (e.dataTransfer.types.includes("Files")) {
				e.preventDefault();
				e.dataTransfer.dropEffect = "copy";
				isDraggingRef.current = true;
			}
		},
		[disabled],
	);

	const handleDrop = useCallback(
		async (e: React.DragEvent<HTMLDivElement>) => {
			if (disabled) return;
			isDraggingRef.current = false;
			const files = Array.from(e.dataTransfer.files);
			if (files.length === 0) return;
			e.preventDefault();
			try {
				const successCount = await appendFilesToContext(files);
				if (successCount > 0) {
					toast.success(
						successCount === 1 ? "已添加附件" : `已添加 ${successCount} 个附件`,
					);
				} else {
					toast.error("添加附件失败");
				}
			} catch {
				toast.error("拖入文件失败");
			}
		},
		[disabled, appendFilesToContext],
	);

	return (
		<div onDragOver={handleDragOver} onDrop={handleDrop}>
			<ChatInput
				onSubmit={onSendMessage}
				disabled={disabled}
				placeholder={placeholder}
				compactPlaceholder={compactPlaceholder}
				model={activeModel || undefined}
				models={enabledModels}
				onModelSelect={onSelectModel}
				onOpenPromptLibrary={onOpenPromptLibrary}
				isResponding={disabled}
				onStop={onStop}
				planMode={planModeEnabled}
				onTogglePlanMode={onTogglePlanMode}
			/>
		</div>
	);
}

export const CopilotInputArea = memo(CopilotInputAreaImpl);
