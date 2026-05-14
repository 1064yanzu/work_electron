// Copilot 状态栏 — 流式 / Agent 执行中时显示的「停止响应」按钮。
// 通过 React.memo 隔离，只在 isStreaming / isAgentExecuting / onStop 变化时重渲染。

import { StopCircle } from "lucide-react";
import { memo } from "react";

interface CopilotStatusBarProps {
	isStreaming: boolean;
	isAgentExecuting: boolean;
	onStop: () => void;
}

function CopilotStatusBarImpl({
	isStreaming,
	isAgentExecuting,
	onStop,
}: CopilotStatusBarProps) {
	if (!isStreaming && !isAgentExecuting) return null;

	return (
		<div className="mb-2 flex items-center justify-center">
			<button
				type="button"
				onClick={onStop}
				aria-label="停止响应"
				className="flex items-center gap-2 px-4 py-2 bg-[rgba(181,51,51,0.08)] dark:bg-red-900/20 text-error dark:text-error hover:bg-[rgba(181,51,51,0.16)] dark:hover:bg-red-900/30 rounded-xl transition-colors text-sm font-medium cursor-pointer"
			>
				<StopCircle className="w-4 h-4" />
				停止响应
			</button>
		</div>
	);
}

export const CopilotStatusBar = memo(CopilotStatusBarImpl);
