/**
 * PetTaskBubble — 思考中气泡
 *
 * "我在想…" + 任务标题；三点节奏点 + 边缘呼吸光晕。
 * opener 文案根据 elapsedMs 取自 personality 池：< 30s 短句 / 30s-2min 中句 / > 5min 长句。
 */

import type { PointerEvent } from "react";
import { PetBubbleShell, type PetBubblePlacement } from "./PetBubbleShell";
import { selectLine } from "../../lib/mascot/personality";
import type { MascotSelection } from "../../lib/mascotStore";

export interface PetTaskBubbleProps {
	title: string;
	accentColor?: string;
	noInteract?: boolean;
	onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
	placement?: PetBubblePlacement;
	sinking?: boolean;
	/** 已经思考的毫秒数；用于挑选短/中/长 opener 文案 */
	elapsedMs?: number;
	/** 当前 IP（取个性化文案） */
	mascotId?: MascotSelection;
}

function pickThinkingKey(
	elapsedMs: number,
): "thinkingShort" | "thinkingMedium" | "thinkingLong" {
	if (elapsedMs > 5 * 60 * 1000) return "thinkingLong";
	if (elapsedMs >= 30 * 1000) return "thinkingMedium";
	return "thinkingShort";
}

export function PetTaskBubble({
	title,
	accentColor = "#D96C46",
	noInteract,
	onPointerEnter,
	onPointerLeave,
	placement,
	sinking,
	elapsedMs = 0,
	mascotId = "efficiency",
}: PetTaskBubbleProps) {
	const opener = selectLine(mascotId, pickThinkingKey(elapsedMs));

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
			<div className="max-w-[220px]">
				<div
					data-bubble-row
					className="flex items-center gap-1.5 text-sm leading-snug text-[color:var(--t-text-primary,#1a1a19)]"
				>
					<span data-bubble-line>{opener}</span>
					<span className="inline-flex items-center gap-1 pb-0.5">
						{[0, 180, 360].map((delay) => (
							<span
								key={delay}
								className="block h-[3px] w-[3px] rounded-full animate-pet-thinking-dot"
								style={{
									backgroundColor: accentColor,
									animationDelay: `${delay}ms`,
								}}
							/>
						))}
					</span>
				</div>
				<div
					data-bubble-row
					className="mt-1 text-xs leading-relaxed text-[color:var(--t-text-muted,#9d9d98)] line-clamp-2"
				>
					{title}
				</div>
			</div>
		</PetBubbleShell>
	);
}
