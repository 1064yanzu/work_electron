/**
 * PetGroundShadow — 角色脚下的自适应椭圆软阴影
 *
 * 设计目标：
 * - 给桌宠"接地感"，告别"漂浮在桌面"的感觉
 * - 拖起来时阴影散开变淡（模拟脱离地面）
 * - 落地时收紧
 * - 贴墙半隐藏时也要缩窄
 * - prefers-reduced-motion 下禁用平滑过渡
 *
 * 使用方式：放在角色容器内部、z-index 居底。外部按 sizePreset / isDragging / isPeeking 控制。
 */

import type { CSSProperties } from "react";

export interface PetGroundShadowProps {
	/** 角色 px 宽度（用来按比例缩放椭圆） */
	size: number;
	/** 是否处于拖动态：拖起 → 阴影散开变淡 */
	isDragging?: boolean;
	/** 是否贴墙半隐藏：半隐藏时阴影收窄 */
	isPeeking?: boolean;
	/** 额外类名 */
	className?: string;
}

export function PetGroundShadow({
	size,
	isDragging = false,
	isPeeking = false,
	className,
}: PetGroundShadowProps) {
	// 基础椭圆：宽 ≈ 角色 60%，高 ≈ 角色 7%
	const baseW = size * 0.6;
	const baseH = size * 0.07;

	// 拖起：散开到 80%、变高、降透明度
	// 贴墙半隐藏：收窄到 45%
	const scaleX = isDragging ? 1.35 : isPeeking ? 0.75 : 1;
	const scaleY = isDragging ? 1.2 : isPeeking ? 0.9 : 1;
	const opacity = isDragging ? 0.18 : isPeeking ? 0.26 : 0.32;
	const blur = isDragging ? 10 : 6;

	const style: CSSProperties = {
		width: `${baseW}px`,
		height: `${baseH}px`,
		transform: `translateX(-50%) scale(${scaleX}, ${scaleY})`,
		opacity,
		filter: `blur(${blur}px)`,
		// 径向渐变：中心深、边缘透明，形成软阴影
		background:
			"radial-gradient(ellipse at center, rgba(26, 26, 25, 0.55) 0%, rgba(26, 26, 25, 0.3) 45%, rgba(26, 26, 25, 0) 80%)",
		borderRadius: "50%",
		pointerEvents: "none",
	};

	return (
		<div
			aria-hidden="true"
			className={[
				"absolute left-1/2 bottom-[-2px] will-change-transform motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out",
				className ?? "",
			].join(" ")}
			style={style}
		/>
	);
}
