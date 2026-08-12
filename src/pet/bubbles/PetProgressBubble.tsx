/**
 * PetProgressBubble — 任务进度气泡
 *
 * 适用场景：长任务在跑，用户想知道"现在到第几步了 / 在做什么"。
 * - 标题（任务名）
 * - 当前步骤名（tool name 之类）
 * - 真实进度条（known total）或不定式流动条（unknown total）
 * - 边缘呼吸光晕（同 task 气泡）
 */

import type { PointerEvent } from "react";
import { PetBubbleShell, type PetBubblePlacement } from "./PetBubbleShell";
import { withAlpha } from "./utils";

export interface PetProgressBubbleProps {
	title: string;
	/** 当前正在执行的子步骤（tool name 或人类可读阶段名） */
	stepLabel?: string;
	/** 已完成步数；未提供 total 时显示为"已 X 步" */
	current?: number;
	/** 总步数；提供时渲染为确定进度条，否则为不定式流动条 */
	total?: number;
	accentColor?: string;
	noInteract?: boolean;
	onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
	placement?: PetBubblePlacement;
	sinking?: boolean;
}

export function PetProgressBubble({
	title,
	stepLabel,
	current,
	total,
	accentColor = "#D96C46",
	noInteract,
	onPointerEnter,
	onPointerLeave,
	placement,
	sinking,
}: PetProgressBubbleProps) {
	const hasDeterminate =
		typeof total === "number" && total > 0 && typeof current === "number";
	const pct = hasDeterminate
		? Math.min(
				100,
				Math.max(0, ((current as number) / (total as number)) * 100),
			)
		: 0;

	return (
		<PetBubbleShell
			accentColor={accentColor}
			noInteract={noInteract}
			glowing
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			placement={placement}
			sinking={sinking}
		>
			<div className="w-[244px]">
				{/* 第一行：标题 + 进度数字 */}
				<div data-bubble-row className="flex items-center gap-2">
					<div className="flex-1 text-sm font-medium leading-snug text-[color:var(--t-text-primary,#1a1a19)] truncate">
						{title}
					</div>
					{hasDeterminate ? (
						<div
							className="text-xs font-medium tabular-nums shrink-0"
							style={{ color: accentColor }}
						>
							{current} / {total}
						</div>
					) : typeof current === "number" && current > 0 ? (
						<div
							className="text-xs font-medium tabular-nums shrink-0"
							style={{ color: accentColor }}
						>
							已 {current} 步
						</div>
					) : null}
				</div>

				{/* 第二行：当前步骤名 */}
				{stepLabel && (
					<div
						key={stepLabel}
						data-bubble-row
						className="mt-1 text-xs leading-relaxed text-[color:var(--t-text-secondary,#6b6b68)] line-clamp-1"
					>
						{stepLabel}
					</div>
				)}

				{/* 第三行：进度条 */}
				<div
					data-bubble-row
					className="mt-2 relative h-[4px] w-full overflow-hidden rounded-full"
					style={{ backgroundColor: withAlpha(accentColor, 0.12) }}
				>
					{hasDeterminate ? (
						<div
							className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
							style={{
								width: `${pct}%`,
								background: `linear-gradient(90deg, ${withAlpha(accentColor, 0.85)} 0%, ${accentColor} 100%)`,
							}}
						/>
					) : (
						/* 不定式：一段流动光带 */
						<div
							className="absolute inset-y-0 w-1/3 rounded-full animate-pet-progress-shimmer"
							style={{
								background: `linear-gradient(90deg, transparent 0%, ${accentColor} 50%, transparent 100%)`,
							}}
						/>
					)}
				</div>
			</div>
		</PetBubbleShell>
	);
}
