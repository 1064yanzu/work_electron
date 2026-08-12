/**
 * PetReminderBubble — 主动提醒气泡
 *
 * 适用场景：番茄钟到点 / Agent 等待审批超过阈值 / 用户预设的待办时间到了。
 * 与 PetNotificationBubble 的差别：reminder 是"宠物主动想起来要告诉你"，
 * 多一个"稍后提醒"的二级动作。
 */

import type { PointerEvent } from "react";
import { Bell, Clock } from "lucide-react";
import { PetBubbleShell, type PetBubblePlacement } from "./PetBubbleShell";
import { CloseIconButton } from "./CloseIconButton";
import { withAlpha } from "./utils";

export type PetReminderKind = "schedule" | "pomodoro" | "approval-waiting";

export interface PetReminderBubbleProps {
	kind: PetReminderKind;
	title: string;
	detail?: string;
	/** 主操作（如"去看看"） */
	onPrimary?: () => void;
	primaryLabel?: string;
	/** 次操作（如"5 分钟后再说"） */
	onSnooze?: () => void;
	snoozeLabel?: string;
	/** 关闭按钮 */
	onDismiss?: () => void;
	accentColor?: string;
	noInteract?: boolean;
	onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
	placement?: PetBubblePlacement;
	sinking?: boolean;
}

const ICON_MAP: Record<PetReminderKind, typeof Bell> = {
	schedule: Bell,
	pomodoro: Clock,
	"approval-waiting": Bell,
};

const TONE_MAP: Record<PetReminderKind, string> = {
	schedule: "#3F77C9", // 蓝
	pomodoro: "#D9694B", // 橙红
	"approval-waiting": "#8B6FB8", // 紫
};

export function PetReminderBubble({
	kind,
	title,
	detail,
	onPrimary,
	primaryLabel = "去看看",
	onSnooze,
	snoozeLabel = "5 分钟后",
	onDismiss,
	accentColor = "#D96C46",
	noInteract,
	onPointerEnter,
	onPointerLeave,
	placement,
	sinking,
}: PetReminderBubbleProps) {
	const Icon = ICON_MAP[kind];
	const tone = TONE_MAP[kind];

	return (
		<PetBubbleShell
			accentColor={accentColor}
			noInteract={noInteract}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			placement={placement}
			sinking={sinking}
		>
			<div className="max-w-[240px]">
				<div data-bubble-row className="flex items-start gap-2">
					<span
						className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
						style={{
							backgroundColor: withAlpha(tone, 0.14),
							color: tone,
						}}
					>
						<Icon className="h-3 w-3" strokeWidth={2.4} />
					</span>
					<div className="flex-1 text-[13.5px] font-medium leading-snug text-[color:var(--t-text-primary,#1a1a19)]">
						{title}
					</div>
					{onDismiss && <CloseIconButton onClick={onDismiss} />}
				</div>

				{detail && (
					<div
						data-bubble-row
						className="mt-1 pl-7 text-[12px] leading-relaxed text-[color:var(--t-text-secondary,#6b6b68)] line-clamp-3"
					>
						{detail}
					</div>
				)}

				{(onPrimary || onSnooze) && (
					<div data-bubble-row className="mt-2 pl-7 flex items-center gap-3">
						{onPrimary && (
							<button
								type="button"
								onClick={onPrimary}
								className="text-[12px] font-medium transition-opacity hover:opacity-80"
								style={{ color: tone }}
							>
								{primaryLabel}
							</button>
						)}
						{onSnooze && (
							<button
								type="button"
								onClick={onSnooze}
								className="text-[12px] text-[color:var(--t-text-light,#9d9d98)] transition-colors hover:text-[color:var(--t-text-secondary,#6b6b68)]"
							>
								{snoozeLabel}
							</button>
						)}
					</div>
				)}
			</div>
		</PetBubbleShell>
	);
}
