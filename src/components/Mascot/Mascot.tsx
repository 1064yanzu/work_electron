import type * as React from "react";
import { cn } from "../../lib/utils";
import type { MascotSlot } from "../../lib/mascot/manifest";
import { useMascot } from "../../lib/mascotStore";

export type MascotSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE_CLASS: Record<MascotSize, string> = {
	xs: "w-6 h-6",
	sm: "w-10 h-10",
	md: "w-16 h-16",
	lg: "w-24 h-24",
	xl: "w-32 h-32",
	"2xl": "w-44 h-44",
};

export interface MascotProps {
	slot: MascotSlot;
	size?: MascotSize;
	/** off 状态或资产缺失时的 fallback 节点 */
	fallback?: React.ReactNode;
	className?: string;
	/** 容器额外 class，slot 图片永远占满容器 */
	wrapperClassName?: string;
	/** 是否启用浮动动画 */
	float?: boolean;
	alt?: string;
}

/**
 * Mascot — 渲染当前 IP 在指定 slot 的 PNG 图片
 *
 * - currentId === "off" 时返回 fallback（可不传，默认 null）
 * - 资产缺失时自动 fallback 到 hero
 * - 透明背景，深浅模式共用
 */
export function Mascot({
	slot,
	size = "md",
	fallback = null,
	className,
	wrapperClassName,
	float = false,
	alt = "墨鱼君",
}: MascotProps) {
	const { getAsset, enabled } = useMascot();
	if (!enabled) return <>{fallback}</>;
	const src = getAsset(slot);
	if (!src) return <>{fallback}</>;

	return (
		<div
			className={cn(
				"relative inline-flex items-center justify-center select-none",
				SIZE_CLASS[size],
				float && "animate-mascot-float",
				wrapperClassName,
			)}
		>
			<img
				src={src}
				alt={alt}
				draggable={false}
				className={cn(
					"w-full h-full object-contain pointer-events-none",
					className,
				)}
			/>
		</div>
	);
}
