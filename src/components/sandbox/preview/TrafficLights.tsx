/**
 * TrafficLights - macOS 风格的交通灯装饰
 * 三色圆点：仅作视觉装饰，hover 时隐约显示图标
 * 不做关闭/最小化/最大化的真实功能（纯 mock 浏览器壳）
 */

import { cn } from "@/lib/utils";

interface TrafficLightsProps {
	/** 是否显示禁用灰色态（无 src 时） */
	muted?: boolean;
	className?: string;
}

export function TrafficLights({
	muted = false,
	className,
}: TrafficLightsProps) {
	return (
		<div
			className={cn("flex items-center gap-[7px] select-none", className)}
			aria-hidden="true"
		>
			<span
				className={cn(
					"w-3 h-3 rounded-full transition-colors duration-200",
					muted
						? "bg-cream-400/70 dark:bg-cream-700"
						: "bg-[#FF5F57] hover:bg-[#FF5F57]/85",
					"shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]",
				)}
			/>
			<span
				className={cn(
					"w-3 h-3 rounded-full transition-colors duration-200",
					muted
						? "bg-cream-400/70 dark:bg-cream-700"
						: "bg-[#FEBC2E] hover:bg-[#FEBC2E]/85",
					"shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]",
				)}
			/>
			<span
				className={cn(
					"w-3 h-3 rounded-full transition-colors duration-200",
					muted
						? "bg-cream-400/70 dark:bg-cream-700"
						: "bg-[#28C840] hover:bg-[#28C840]/85",
					"shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]",
				)}
			/>
		</div>
	);
}
