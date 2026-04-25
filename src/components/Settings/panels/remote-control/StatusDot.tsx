/**
 * StatusDot — 统一状态小圆点
 * 用于通道 / 会话 / 配对状态的一致视觉表达。
 */

import { cn } from "../../../../lib/utils";

export type StatusTone = "emerald" | "amber" | "rose" | "sky" | "zinc";

const TONE_CLASS: Record<StatusTone, { solid: string; ring: string }> = {
	emerald: {
		solid: "bg-emerald-500",
		ring: "ring-emerald-500/20",
	},
	amber: {
		solid: "bg-amber-500",
		ring: "ring-amber-500/20",
	},
	rose: {
		solid: "bg-rose-500",
		ring: "ring-rose-500/20",
	},
	sky: {
		solid: "bg-sky-500",
		ring: "ring-sky-500/20",
	},
	zinc: {
		solid: "bg-zinc-4000",
		ring: "ring-zinc-400/20",
	},
};

export function StatusDot({
	tone,
	pulse = false,
	size = "sm",
	className,
}: {
	tone: StatusTone;
	pulse?: boolean;
	size?: "xs" | "sm" | "md";
	className?: string;
}) {
	const tc = TONE_CLASS[tone];
	const sizeClass =
		size === "xs" ? "h-1.5 w-1.5" : size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
	return (
		<span className={cn("relative inline-flex", sizeClass, className)}>
			{pulse && (
				<span
					className={cn(
						"absolute inset-0 rounded-full opacity-75 animate-ping",
						tc.solid,
					)}
				/>
			)}
			<span
				className={cn(
					"relative inline-block rounded-full ring-2",
					sizeClass,
					tc.solid,
					tc.ring,
				)}
			/>
		</span>
	);
}

export function StatusPill({
	tone,
	label,
	pulse = false,
	className,
}: {
	tone: StatusTone;
	label: string;
	pulse?: boolean;
	className?: string;
}) {
	const toneText: Record<StatusTone, string> = {
		emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
		amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
		rose: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
		sky: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
		zinc: "text-text-muted bg-warm-500/10",
	};
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
				toneText[tone],
				className,
			)}
		>
			<StatusDot tone={tone} pulse={pulse} size="xs" />
			{label}
		</span>
	);
}
