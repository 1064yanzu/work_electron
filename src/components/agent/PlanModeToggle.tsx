/**
 * PlanModeToggle - 规划模式切换器
 * 在 ChatInput 上方显示，仅 agent 模式下可见
 */

import { ListChecks, Zap } from "lucide-react";
import { cn } from "../../lib/utils";

interface PlanModeToggleProps {
	planMode: boolean;
	onToggle: (enabled: boolean) => void;
	disabled?: boolean;
}

export function PlanModeToggle({
	planMode,
	onToggle,
	disabled = false,
}: PlanModeToggleProps) {
	return (
		<div className="flex items-center gap-1.5">
			<div
				className={cn(
					"relative flex items-center rounded-lg p-0.5 transition-colors",
					"bg-warm-200",
					disabled && "opacity-50 pointer-events-none",
				)}
			>
				{/* 滑块背景 */}
				<div
					className={cn(
						"absolute top-0.5 h-[calc(100%-4px)] rounded-md transition-all duration-200 ease-out",
						planMode
							? "bg-[#D96C46] shadow-sm left-[calc(50%+1px)] w-[calc(50%-3px)]"
							: "bg-surface dark:bg-cream-700 shadow-sm left-0.5 w-[calc(50%-3px)]",
					)}
				/>

				{/* 执行按钮 */}
				<button
					type="button"
					onClick={() => onToggle(false)}
					className={cn(
						"relative z-10 flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
						!planMode
							? "text-text-primary"
							: "text-text-light hover:text-text-secondary dark:hover:text-text-light",
					)}
				>
					<Zap className="w-3 h-3" />
					执行
				</button>

				{/* 规划按钮 */}
				<button
					type="button"
					onClick={() => onToggle(true)}
					className={cn(
						"relative z-10 flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
						planMode
							? "text-white"
							: "text-text-light hover:text-text-secondary dark:hover:text-text-light",
					)}
				>
					<ListChecks className="w-3 h-3" />
					规划
				</button>
			</div>

			{/* 模式说明 */}
			{planMode && (
				<span className="text-[10px] text-[#D96C46] font-medium animate-in fade-in slide-in-from-left-1 duration-200">
					Agent 将先输出计划，确认后再执行
				</span>
			)}
		</div>
	);
}
