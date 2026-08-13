/**
 * PetHistoryBubble — 最近通知历史列表气泡
 *
 * 显示最近 5 条通知（历史最多存 20 条），用户可清空。
 * 从上下文菜单"最近通知"入口触发。
 */

import type { PointerEvent } from "react";
import { Check, AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { PetBubbleShell, type PetBubblePlacement } from "./PetBubbleShell";
import { CloseIconButton } from "./CloseIconButton";
import { PET_TONE_APPROVAL, PET_TONE_DONE, PET_TONE_ERROR } from "./palette";
import { withAlpha } from "./utils";
import type { PetNotificationItem } from "../usePetEventBridge";

export interface PetHistoryBubbleProps {
	items: PetNotificationItem[];
	onClose: () => void;
	onClear: () => void;
	accentColor?: string;
	noInteract?: boolean;
	onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
	placement?: PetBubblePlacement;
	sinking?: boolean;
}

const TYPE_ICON = {
	done: { Icon: Check, tone: PET_TONE_DONE },
	error: { Icon: AlertTriangle, tone: PET_TONE_ERROR },
	approval: { Icon: HelpCircle, tone: PET_TONE_APPROVAL },
} as const;

function formatTimeAgo(createdAt: number): string {
	const diff = Date.now() - createdAt;
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "刚刚";
	if (mins < 60) return `${mins} 分钟前`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} 小时前`;
	const days = Math.floor(hours / 24);
	return `${days} 天前`;
}

export function PetHistoryBubble({
	items,
	onClose,
	onClear,
	accentColor = "#D96C46",
	noInteract,
	onPointerEnter,
	onPointerLeave,
	placement,
	sinking,
}: PetHistoryBubbleProps) {
	const visible = items.slice(0, 5);

	return (
		<PetBubbleShell
			accentColor={accentColor}
			noInteract={noInteract}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			placement={placement}
			sinking={sinking}
			style={{ minWidth: "220px", maxWidth: "260px" }}
		>
			{/* 标题行 */}
			<div className="flex items-center justify-between mb-2">
				<span className="text-xs font-medium text-[color:var(--t-text-secondary,#6b6b68)]">
					最近通知
				</span>
				<div className="flex items-center gap-1">
					{items.length > 0 && (
						<button
							type="button"
							title="清空"
							onClick={onClear}
							className="flex items-center justify-center h-5 w-5 rounded transition-colors hover:opacity-70"
							style={{ color: "var(--t-text-muted, #9d9d98)" }}
						>
							<Trash2 className="h-3 w-3" />
						</button>
					)}
					<CloseIconButton onClick={onClose} />
				</div>
			</div>

			{/* 列表 */}
			{visible.length === 0 ? (
				<div className="py-3 text-center text-xs text-[color:var(--t-text-muted,#9d9d98)]">
					暂无记录
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					{visible.map((item) => {
						const { Icon, tone } = TYPE_ICON[item.type];
						return (
							<div key={item.id} className="flex items-start gap-2">
								<span
									className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
									style={{
										backgroundColor: withAlpha(tone, 0.12),
										color: tone,
									}}
								>
									<Icon className="h-[9px] w-[9px]" strokeWidth={2} />
								</span>
								<div className="flex-1 min-w-0">
									<p className="text-xs leading-snug text-[color:var(--t-text-primary,#1a1a19)] line-clamp-2">
										{item.message}
									</p>
								</div>
								<span className="shrink-0 text-2xs text-[color:var(--t-text-muted,#9d9d98)] mt-0.5">
									{formatTimeAgo(item.createdAt)}
								</span>
							</div>
						);
					})}
				</div>
			)}
		</PetBubbleShell>
	);
}
