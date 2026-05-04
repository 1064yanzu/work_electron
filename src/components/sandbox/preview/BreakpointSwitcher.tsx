/**
 * BreakpointSwitcher - 响应式断点切换器
 * mobile (375x667) / tablet (768x1024) / desktop (100%)
 */

import { Monitor, Smartphone, Tablet } from "lucide-react";
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
		shortcut: "375x667",
		width: 375,
		height: 667,
	},
	{
		key: "tablet",
		label: "平板",
		icon: Tablet,
		shortcut: "768x1024",
		width: 768,
		height: 1024,
	},
	{
		key: "desktop",
		label: "桌面",
		icon: Monitor,
		shortcut: "100%",
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
	return (
		<div
			className="flex items-center bg-warm-200 dark:bg-cream-800 rounded-xl p-0.5"
			role="radiogroup"
			aria-label="断点切换"
		>
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
						title={`${bp.label} (${bp.shortcut})`}
						onClick={() => onChange(bp.key)}
						className={cn(
							"inline-flex items-center justify-center p-2 min-h-9 rounded-lg",
							"transition-all duration-150 cursor-pointer",
							"focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
							isActive
								? "bg-surface dark:bg-cream-700 text-text-primary shadow-sm"
								: "text-text-muted hover:text-text-secondary hover:bg-warm-100 dark:hover:bg-cream-700/50",
						)}
					>
						<Icon className="w-4 h-4" strokeWidth={1.5} />
					</button>
				);
			})}
		</div>
	);
}
