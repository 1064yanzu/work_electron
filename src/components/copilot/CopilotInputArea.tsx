// Copilot 输入区组件 — 输入框 + 计划模式开关。
// 通过 React.memo 隔离父组件其他状态变化造成的重渲染。

import { memo } from "react";
import { PlanModeToggle } from "../agent/PlanModeToggle";
import { ChatInput, type SubmitOptions } from "../chat/ChatInput";
import type { Model } from "../chat/ModelSelector";

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
}: CopilotInputAreaProps) {
	const disabled = isStreaming || isAgentExecuting;
	const placeholder = isAgentExecuting
		? agentTaskType === "research"
			? "研究进行中..."
			: "Agent 执行中..."
		: chatMode === "agent"
			? "描述你的需求，Agent 会自动完成..."
			: "输入消息，或用 / 唤起命令...";

	return (
		<>
			<div className="px-0 pb-1.5">
				<PlanModeToggle
					planMode={planModeEnabled}
					onToggle={onTogglePlanMode}
					disabled={disabled}
				/>
			</div>
			<ChatInput
				onSubmit={onSendMessage}
				disabled={disabled}
				placeholder={placeholder}
				model={activeModel || undefined}
				models={enabledModels}
				onModelSelect={onSelectModel}
				onOpenPromptLibrary={onOpenPromptLibrary}
				isAgentExecuting={isAgentExecuting}
			/>
		</>
	);
}

export const CopilotInputArea = memo(CopilotInputAreaImpl);
