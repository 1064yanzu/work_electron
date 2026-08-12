/**
 * RemoteTabNav — 远程控制设置的分段导航
 * 四段：概览 / 通道 / 配对与会话 / 高级。
 * 使用绝对定位的底部滑块指示条，带弹性过渡。
 */

import type { LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../../../lib/utils";

export type RemoteTabKey =
	| "overview"
	| "channels"
	| "pairing"
	| "terminal"
	| "advanced";

type RemoteTabItem = {
	key: RemoteTabKey;
	label: string;
	icon: LucideIcon;
	/** 可选：tab 上的数字徽章 */
	badge?: number;
	/** badge 大于 0 的时候使用的强调色 */
	badgeTone?: "amber" | "emerald" | "rose";
};

type IndicatorStyle = {
	left: number;
	width: number;
};

export function RemoteTabNav({
	tabs,
	active,
	onChange,
	className,
}: {
	tabs: RemoteTabItem[];
	active: RemoteTabKey;
	onChange: (key: RemoteTabKey) => void;
	className?: string;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const [indicator, setIndicator] = useState<IndicatorStyle>({
		left: 0,
		width: 0,
	});

	useLayoutEffect(() => {
		const btn = itemRefs.current[active];
		const container = containerRef.current;
		if (!btn || !container) return;
		const btnRect = btn.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		setIndicator({
			left: btnRect.left - containerRect.left,
			width: btnRect.width,
		});
	}, [active, tabs.length]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative flex items-center gap-1 rounded-2xl border border-border bg-surface/80 p-1 shadow-bai-card",
				className,
			)}
		>
			{/* 指示条 */}
			<span
				className="pointer-events-none absolute bottom-1 top-1 rounded-xl bg-warm-200 transition-[left,width] duration-250 ease-out"
				style={{ left: indicator.left, width: indicator.width }}
			/>

			{tabs.map((tab) => {
				const Icon = tab.icon;
				const isActive = tab.key === active;
				const badgeToneClass =
					tab.badgeTone === "emerald"
						? "bg-mint-500/15 text-mint-600"
						: tab.badgeTone === "rose"
							? "bg-error/[0.1] text-error"
							: tab.badgeTone === "amber"
								? "bg-peach-500/15 text-peach-500"
								: "bg-warm-300 text-text-secondary";
				return (
					<button
						key={tab.key}
						type="button"
						ref={(el) => {
							itemRefs.current[tab.key] = el;
						}}
						onClick={() => onChange(tab.key)}
						className={cn(
							"relative z-10 inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors duration-150",
							isActive
								? "text-text-primary"
								: "text-text-muted hover:text-text-secondary",
						)}
					>
						<Icon
							className={cn(
								"h-4 w-4 transition-colors",
								isActive ? "text-primary" : "",
							)}
							strokeWidth={1.5}
						/>
						<span>{tab.label}</span>
						{typeof tab.badge === "number" && tab.badge > 0 ? (
							<span
								className={cn(
									"inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-4 tabular-nums",
									badgeToneClass,
								)}
							>
								{tab.badge > 99 ? "99+" : tab.badge}
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
