/**
 * BreakpointSwitcher - 响应式断点切换器
 * mobile (375x667) / tablet (768x1024) / desktop (100%)
 * 带滑块过渡 + 工具提示
 */

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

export type Breakpoint = "mobile" | "tablet" | "desktop";

interface BreakpointSwitcherProps {
	current: Breakpoint;
	onChange: (bp: Breakpoint) => void;
}

const breakpoints: {
	key: Breakpoint;
	label: string;
	icon: typeof Monitor;
	shortcut: string;
	width: number | null;
	height: number | null;
}[] = [
	{
		key: "mobile",
		label: "手机",
		icon: Smartphone,
		shortcut: "375 × 667",
		width: 375,
		height: 667,
	},
	{
		key: "tablet",
		label: "平板",
		icon: Tablet,
		shortcut: "768 × 1024",
		width: 768,
		height: 1024,
	},
	{
		key: "desktop",
		label: "桌面",
		icon: Monitor,
		shortcut: "自适应",
		width: null,
		height: null,
	},
];

/** 获取断点对应的容器尺寸 */
export function getBreakpointSize(bp: Breakpoint): {
	width: number | null;
	height: number | null;
} {
	const found = breakpoints.find((b) => b.key === bp);
	return { width: found?.width ?? null, height: found?.height ?? null };
}

export function BreakpointSwitcher({
	current,
	onChange,
}: BreakpointSwitcherProps) {
	const groupId = useId();
	const activeIndex = useMemo(
		() => breakpoints.findIndex((b) => b.key === current),
		[current],
	);

	return (
		<div
			className={cn(
				"relative flex items-center bg-cream-200/80 dark:bg-cream-800/70 rounded-full p-0.5",
				"border border-cream-300/60 dark:border-cream-700/60",
			)}
			role="radiogroup"
			aria-label="预览断点切换"
		>
			{/* 滑块指示器 */}
			<div
				className={cn(
					"absolute top-0.5 bottom-0.5 rounded-full bg-surface dark:bg-cream-700",
					"shadow-[0_1px_2px_0_rgba(26,26,25,0.06),0_0_0_1px_rgba(232,229,221,0.6)]",
					"transition-[transform,width] duration-250 ease-out-expo",
				)}
				style={{
					width: `calc((100% - 4px) / ${breakpoints.length})`,
					transform: `translateX(calc(${activeIndex} * 100%))`,
				}}
				aria-hidden="true"
			/>

			{breakpoints.map((bp) => {
				const Icon = bp.icon;
				const isActive = current === bp.key;

				return (
					<button
						key={bp.key}
						type="button"
						role="radio"
						aria-checked={isActive}
						aria-label={`${bp.label} (${bp.shortcut})`}
						title={`${bp.label} · ${bp.shortcut}`}
						data-radio-name={groupId}
						onClick={() => onChange(bp.key)}
						className={cn(
							"relative z-10 inline-flex items-center justify-center",
							"w-8 h-7 rounded-full cursor-pointer",
							"transition-colors duration-150",
							"focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--t-primary-muted,rgba(26,26,25,0.12))]",
							isActive
								? "text-text-primary"
								: "text-text-light hover:text-text-secondary",
						)}
					>
						<Icon className="w-[15px] h-[15px]" strokeWidth={1.75} />
					</button>
				);
			})}
		</div>
	);
}
