/**
 * 编码模式选择器
 * Segmented Control 风格，在 Agent 模式下显示 Code/Plan/Ask 子模式切换
 * Codex 后端不支持模式切换，自动隐藏
 */

import { Code2, ListChecks, MessageCircleQuestion } from "lucide-react";
import { useCallback, useRef, useEffect, useState } from "react";
import {
	type CodingMode,
	codingAgentStore,
	useCodingAgentSelector,
} from "../../../lib/stores/codingAgentStore";
import { useCodingThreadSelector } from "../../../lib/stores/codingThreadStore";
import { useCodingWorkspaceSelector } from "../../../lib/stores/codingWorkspaceStore";
import { executeCodingCommand } from "../../../lib/coding/codingCommandExecutor";
import { useBackendCapabilities } from "../../../hooks/useBackendCapabilities";

const modes: Array<{
	value: CodingMode;
	label: string;
	icon: typeof Code2;
	description: string;
}> = [
	{
		value: "code",
		label: "Code",
		icon: Code2,
		description: "自主编码",
	},
	{
		value: "plan",
		label: "Plan",
		icon: ListChecks,
		description: "先规划再执行",
	},
	{
		value: "ask",
		label: "Ask",
		icon: MessageCircleQuestion,
		description: "只回答问题",
	},
];

export function CodingModeSelector() {
	const currentMode = useCodingAgentSelector((s) => s.codingMode);
	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const projectPath = useCodingWorkspaceSelector((s) => s.projectPath);
	const { isCodex } = useBackendCapabilities();
	const containerRef = useRef<HTMLDivElement>(null);
	const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

	// 计算滑块位置
	useEffect(() => {
		if (isCodex || !containerRef.current) return;
		const index = modes.findIndex((m) => m.value === currentMode);
		const buttons = containerRef.current.querySelectorAll<HTMLButtonElement>(
			"[data-mode-button]",
		);
		const target = buttons[index];
		if (!target) return;

		setIndicatorStyle({
			width: target.offsetWidth,
			transform: `translateX(${target.offsetLeft}px)`,
		});
	}, [currentMode, isCodex]);

	const handleSelect = useCallback((mode: CodingMode) => {
		codingAgentStore.setCodingMode(mode);
		void executeCodingCommand("set_mode", {
			threadId: activeThreadId,
			projectPath,
		}, { mode });
	}, [activeThreadId, projectPath]);

	// Codex 后端不支持 Code/Plan/Ask 模式切换
	if (isCodex) return null;

	return (
		<div className="flex items-center gap-2">
			<div
				ref={containerRef}
				className="relative inline-flex items-center bg-zinc-100/80 dark:bg-zinc-800/80 rounded-lg p-0.5 ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
			>
				{/* 滑动指示器 */}
				<div
					className="absolute top-0.5 left-0 h-[calc(100%-4px)] rounded-md bg-white dark:bg-zinc-700 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] transition-all duration-200 ease-out"
					style={indicatorStyle}
				/>

				{modes.map((mode) => {
					const Icon = mode.icon;
					const isActive = currentMode === mode.value;
					return (
						<button
							key={mode.value}
							type="button"
							data-mode-button
							onClick={() => handleSelect(mode.value)}
							title={mode.description}
							className={`relative z-10 flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors duration-150 cursor-pointer ${
								isActive
									? "text-zinc-900 dark:text-zinc-100"
									: "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
							}`}
						>
							<Icon className="w-3 h-3" />
							{mode.label}
						</button>
					);
				})}
			</div>

			{/* 当前模式描述 */}
			<span className="text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
				{modes.find((m) => m.value === currentMode)?.description}
			</span>
		</div>
	);
}
