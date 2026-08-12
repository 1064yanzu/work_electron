/**
 * DeviceFrame - 移动 / 平板 / 桌面 设备外观容器
 * 桌面：透明，全宽
 * 移动 / 平板：圆角 + 描边 + 顶部听筒装饰，模拟真实设备外观
 * 实际尺寸由 BrowserShell 控制，本组件只负责"外壳"
 */

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { Breakpoint } from "./BreakpointSwitcher";

interface DeviceFrameProps {
	breakpoint: Breakpoint;
	width: number | null;
	height: number | null;
	children: ReactNode;
	className?: string;
}

export function DeviceFrame({
	breakpoint,
	width,
	height,
	children,
	className,
}: DeviceFrameProps) {
	if (breakpoint === "desktop") {
		return (
			<div
				className={cn(
					"h-full w-full transition-[width,height] duration-250 ease-out-expo",
					className,
				)}
				style={{ width: width ? `${width}px` : "100%" }}
			>
				{children}
			</div>
		);
	}

	const isMobile = breakpoint === "mobile";
	const radius = isMobile ? "rounded-3xl" : "rounded-3xl";
	const innerRadius = isMobile ? "rounded-3xl" : "rounded-2xl";

	return (
		<div
			className={cn(
				"relative flex flex-col items-center justify-start py-6",
				"transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250 ease-out-expo",
				className,
			)}
		>
			<div
				className={cn(
					"relative bg-cream-900 dark:bg-cream-950",
					"shadow-[0_18px_50px_-20px_rgba(26,26,25,0.35),0_2px_4px_0_rgba(26,26,25,0.06)]",
					"p-2.5",
					radius,
					"transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250 ease-out-expo",
				)}
				style={{
					width: width ? `${width + 20}px` : undefined,
					height: height ? `${height + 20}px` : undefined,
				}}
			>
				{/* 顶部听筒装饰（仅 mobile） */}
				{isMobile ? (
					<div className="pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
						<span className="w-7 h-1 rounded-full bg-cream-700/80" />
						<span className="w-1.5 h-1.5 rounded-full bg-cream-700/80" />
					</div>
				) : null}
				<div
					className={cn(
						"relative w-full h-full overflow-hidden bg-surface",
						innerRadius,
					)}
				>
					{children}
				</div>
			</div>

			{/* 尺寸标签 */}
			{width && height ? (
				<div className="mt-3 flex items-center gap-2 text-xs font-mono tabular-nums text-text-muted">
					<span>{width}</span>
					<span className="text-text-light">×</span>
					<span>{height}</span>
					<span className="text-text-light">px</span>
				</div>
			) : null}
		</div>
	);
}
