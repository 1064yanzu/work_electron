// 思考程度分段行 —— 住在模型弹层底部。
//
// 思考程度（SDK effort）本质是**模型运行参数**，和模型选择是同一件事的两半，
// 放在一起既符合语义，也把工具栏从四个配置胶囊压回三个，
// 让默认宽度（面板 25% ≈ 360px）下所有胶囊都能完整显示文字。

import { useState } from "react";
import {
	type ThinkingLevel,
	THINKING_LEVEL_LABELS,
} from "../../../lib/models/agentModelConfig";
import {
	agentModelSettingsStore,
	useAgentModelSettingsStore,
} from "../../../lib/models/agentModelSettingsStore";
import { cn } from "../../../lib/utils";

const LEVEL_ORDER: ThinkingLevel[] = ["off", "low", "medium", "high", "xhigh"];

const LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "不开启思考，最快直答",
	low: "极少思考，快速响应",
	medium: "适度思考，兼顾速度与质量",
	high: "深度推理（SDK 默认）",
	xhigh: "更深层推理，仅 Opus 4.7 完整支持",
};

const LEVEL_VALUE: Record<ThinkingLevel, number> = {
	off: 0,
	low: 1,
	medium: 2,
	high: 3,
	xhigh: 4,
};

const BAR_HEIGHTS = [4, 6, 8, 10] as const;

/**
 * 4 根竖条 —— 信号强度风格的思考深度指示器：填充条数 = 当前等级。
 * 把抽象的「思考程度」翻成一眼可读的视觉量。
 */
export function ThinkingBars({
	level,
	active,
}: {
	level: ThinkingLevel;
	active: boolean;
}) {
	const value = LEVEL_VALUE[level];
	return (
		<div className="flex items-end gap-[2.5px] h-[11px] shrink-0">
			{BAR_HEIGHTS.map((h, i) => (
				<div
					key={h}
					className={cn(
						"w-[2.5px] rounded-full transition-colors duration-200",
						i < value
							? active
								? "bg-mint-500 dark:bg-mint-300"
								: "bg-text-secondary/70"
							: "bg-cream-400/60 dark:bg-cream-500/40",
					)}
					style={{ height: `${h}px` }}
				/>
			))}
		</div>
	);
}

/** 当前思考程度 —— 供模型胶囊拼 tooltip 用。 */
export function useThinkingLevel(): ThinkingLevel {
	const { settings } = useAgentModelSettingsStore();
	return settings.contextRuntime?.thinkingLevel ?? "high";
}

export function ThinkingLevelRow() {
	const current = useThinkingLevel();
	const [hovered, setHovered] = useState<ThinkingLevel | null>(null);
	const display = hovered ?? current;

	const handleSelect = (next: ThinkingLevel) => {
		if (next === current) return;
		void agentModelSettingsStore.updateContextRuntime({ thinkingLevel: next });
	};

	return (
		<div className="shrink-0 px-3 pt-2.5 pb-3 border-t border-cream-300 dark:border-cream-500/50">
			<div className="flex items-center justify-between mb-1.5">
				<div className="flex items-center gap-1.5">
					<ThinkingBars level={current} active />
					<span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
						思考程度
					</span>
				</div>
				<span className="text-[9.5px] text-text-muted/60 font-mono">
					effort
				</span>
			</div>

			{/* 5 段等宽分段控件 */}
			<div
				className="flex items-center gap-0.5 p-0.5 rounded-full bg-cream-200/80 dark:bg-cream-800/70"
				onMouseLeave={() => setHovered(null)}
			>
				{LEVEL_ORDER.map((level) => {
					const isActive = level === current;
					return (
						<button
							key={level}
							type="button"
							onClick={() => handleSelect(level)}
							onMouseEnter={() => setHovered(level)}
							aria-pressed={isActive}
							className={cn(
								"flex-1 h-6 rounded-full text-[11px] leading-none",
								"transition-[background-color,color,box-shadow] duration-150 cursor-pointer",
								isActive
									? "bg-surface dark:bg-cream-700 text-text-primary font-semibold shadow-sm"
									: "text-text-muted hover:text-text-secondary font-medium",
							)}
						>
							{THINKING_LEVEL_LABELS[level]}
						</button>
					);
				})}
			</div>

			<div className="mt-1.5 text-[10px] text-text-muted/80 leading-snug min-h-[14px]">
				{LEVEL_DESCRIPTIONS[display]}
			</div>
		</div>
	);
}
