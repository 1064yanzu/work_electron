/**
 * PetBubbleShell — 所有气泡的共用外壳
 *
 * 升级要点：
 * - 暖色微渐变内底（accentColor 极淡）+ 主背景层
 * - backdrop blur 增强桌面叠加感
 * - 思考态时边缘呼吸光晕（glowing prop）
 * - 水滴指针自带 accent 色阴影
 * - 支持 onPointerEnter/Leave 让外层冻结自动消失计时器
 * - placement: 默认上方（指针朝下）；屏幕顶部空间不足时翻成下方（指针朝上）
 * - sinking: 关闭时走 sink 动画而不是瞬间消失
 */

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { withAlpha } from "./utils";

export type PetBubblePlacement = "top" | "bottom";

export interface PetBubbleShellProps {
	children: ReactNode;
	accentColor?: string;
	noInteract?: boolean;
	/** 是否处于"思考/进行中"态：开启边缘呼吸光晕 */
	glowing?: boolean;
	/** 鼠标悬停在气泡上时回调（外层用来冻结自动关闭计时器） */
	onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
	/** 气泡放在角色上方（指针朝下，默认）或下方（指针朝上） */
	placement?: PetBubblePlacement;
	/** 是否处于退场动画期 */
	sinking?: boolean;
	/** 额外样式（用于宽度限制等场景） */
	style?: CSSProperties;
}

export function PetBubbleShell({
	children,
	accentColor = "#D96C46",
	noInteract,
	glowing,
	onPointerEnter,
	onPointerLeave,
	placement = "top",
	sinking = false,
	style,
}: PetBubbleShellProps) {
	const isBottom = placement === "bottom";
	const enterClass = isBottom
		? "animate-pet-bubble-drop"
		: "animate-pet-bubble-rise";
	const animClass = sinking ? "animate-pet-bubble-sink" : enterClass;

	return (
		<div
			className={`relative ${animClass}`}
			style={{ pointerEvents: noInteract ? "none" : "auto", ...style }}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
		>
			{/* 呼吸光晕层 — 仅 glowing 时显示 */}
			{glowing && (
				<div
					aria-hidden="true"
					className="absolute -inset-1 rounded-[24px] animate-pet-glow-breath pointer-events-none"
					style={{
						background: `radial-gradient(ellipse at 50% 60%, ${withAlpha(accentColor, 0.22)} 0%, transparent 70%)`,
					}}
				/>
			)}

			<div
				className="relative px-4 py-3"
				style={{
					// 双层背景：底色 + 极淡 accent 渐变（给气泡"暖意"）
					background: `linear-gradient(180deg, ${withAlpha(accentColor, 0.05)} 0%, var(--t-bg-surface, #ffffff) 38%, var(--t-bg-surface, #ffffff) 100%)`,
					backdropFilter: "blur(8px)",
					WebkitBackdropFilter: "blur(8px)",
					borderRadius: "20px 20px 22px 22px",
					boxShadow: `
						0 0 0 1px ${withAlpha(accentColor, 0.1)},
						0 1px 1px 0 rgba(26, 26, 25, 0.04),
						0 8px 24px -10px rgba(26, 26, 25, 0.18),
						0 24px 48px -24px ${withAlpha(accentColor, 0.22)}
					`,
				}}
			>
				{children}
			</div>

			{/* 水滴形指针：根据 placement 翻转方向 */}
			<svg
				width="22"
				height="14"
				viewBox="0 0 22 14"
				aria-hidden="true"
				className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
				style={{
					...(isBottom ? { top: "-11px" } : { bottom: "-11px" }),
					transform: isBottom
						? "translateX(-50%) rotate(180deg)"
						: "translateX(-50%)",
					filter: `drop-shadow(0 ${isBottom ? -4 : 4}px 6px ${withAlpha(accentColor, 0.14)})`,
				}}
			>
				<path
					d="M 1 0 C 5 0, 8 6, 11 13 C 14 6, 17 0, 21 0 Z"
					fill="var(--t-bg-surface, #ffffff)"
				/>
			</svg>
		</div>
	);
}
