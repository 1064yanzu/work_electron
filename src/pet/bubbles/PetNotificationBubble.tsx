/**
 * PetNotificationBubble — 通知气泡（done / error / approval）
 *
 * 升级要点：
 * - 不同 type 配不同图标 + 强调色（done=绿、error=橙红、approval=紫）
 * - 右上角统一关闭按钮（用户可以主动关掉，不必等 dwell timer）
 * - approval 类型明确两个按钮：「去看看」+「忽略」
 * - 图标在容器里有圆形底色，更有"卡片"感
 * - 内容分层渐入
 * - 文案 opener 从 personality 池取（按 IP 个性化）
 * - placement / sinking 支持
 */

import { useMemo, type PointerEvent } from "react";
import { Check, AlertTriangle, HelpCircle } from "lucide-react";
import { PetBubbleShell, type PetBubblePlacement } from "./PetBubbleShell";
import { CloseIconButton } from "./CloseIconButton";
import { withAlpha } from "./utils";
import { selectLine } from "../../lib/mascot/personality";
import type { MascotSelection } from "../../lib/mascotStore";

export type PetNotificationType = "done" | "error" | "approval";

export interface PetNotificationBubbleProps {
	type: PetNotificationType;
	message: string;
	onAction?: () => void;
	onDismiss?: () => void;
	accentColor?: string;
	noInteract?: boolean;
	onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
	placement?: PetBubblePlacement;
	sinking?: boolean;
	mascotId?: MascotSelection;
	/** 当 message 已在 reducer 拼好"激励/安抚"前缀时，显示出来 */
	prefix?: string;
}

interface NotificationStyle {
	personalityKey: "done" | "error" | "approval";
	icon: typeof Check;
	tone: string; // 强调色
}

const STYLE_MAP: Record<PetNotificationType, NotificationStyle> = {
	done: {
		personalityKey: "done",
		icon: Check,
		tone: "#3F9C6E", // 沉稳绿，与暖色不冲突
	},
	error: {
		personalityKey: "error",
		icon: AlertTriangle,
		tone: "#D9694B", // 橙红
	},
	approval: {
		personalityKey: "approval",
		icon: HelpCircle,
		tone: "#8B6FB8", // 内敛紫
	},
};

export function PetNotificationBubble({
	type,
	message,
	onAction,
	onDismiss,
	accentColor = "#D96C46",
	noInteract,
	onPointerEnter,
	onPointerLeave,
	placement,
	sinking,
	mascotId = "efficiency",
	prefix,
}: PetNotificationBubbleProps) {
	const style = STYLE_MAP[type];
	const Icon = style.icon;
	// 必须 memo：selectLine 每次调用都从台词池随机取一条，不锁住的话
	// 任何一次重渲染都会换台词——既是既有的闪烁 bug，也会让 SplitText
	// 拆出来的 span 和 React 的文本节点对不上。
	const opener = useMemo(
		() => selectLine(mascotId, style.personalityKey),
		[mascotId, style.personalityKey],
	);
	// approval/error 才有"去看看"主操作；done 类只读
	const showAction = type === "approval" || type === "error";

	return (
		<PetBubbleShell
			accentColor={accentColor}
			noInteract={noInteract}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			placement={placement}
			sinking={sinking}
		>
			<div className="max-w-[230px] pr-1">
				{/* 顶行：图标 + opener + 关闭按钮 */}
				<div data-bubble-row className="flex items-start gap-2">
					<span
						className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
						style={{
							backgroundColor: withAlpha(style.tone, 0.14),
							color: style.tone,
						}}
					>
						<Icon className="h-3 w-3" strokeWidth={2.6} />
					</span>
					<div className="flex-1 text-[13.5px] font-medium leading-snug text-[color:var(--t-text-primary,#1a1a19)]">
						{prefix ? (
							<>
								<span style={{ color: style.tone }}>{prefix}</span>{" "}
								<span data-bubble-line>{opener}</span>
							</>
						) : (
							<span data-bubble-line>{opener}</span>
						)}
					</div>
					{onDismiss && <CloseIconButton onClick={onDismiss} />}
				</div>

				{message && (
					<div
						data-bubble-row
						className="mt-1 pl-7 text-[12px] leading-relaxed text-[color:var(--t-text-secondary,#6b6b68)] line-clamp-3"
					>
						{message}
					</div>
				)}

				{showAction && onAction && (
					<div data-bubble-row className="mt-2 pl-7 flex items-center gap-3">
						<button
							type="button"
							onClick={onAction}
							className="text-[12px] font-medium transition-opacity hover:opacity-80"
							style={{ color: style.tone }}
						>
							去看看
						</button>
						{onDismiss && (
							<button
								type="button"
								onClick={onDismiss}
								className="text-[12px] text-[color:var(--t-text-light,#9d9d98)] transition-colors hover:text-[color:var(--t-text-secondary,#6b6b68)]"
							>
								稍后
							</button>
						)}
					</div>
				)}
			</div>
		</PetBubbleShell>
	);
}
