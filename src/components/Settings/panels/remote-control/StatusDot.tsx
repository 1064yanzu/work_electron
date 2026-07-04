/**
 * StatusDot — 统一状态小圆点
 * 用于通道 / 会话 / 配对状态的一致视觉表达。
 * B.AI 暖调：保留 mint(在线) / peach(警告) / 错误用 #b53333 / sky 中性 / cream 灰。
 */

import { cn } from "../../../../lib/utils";

export type StatusTone = "emerald" | "amber" | "rose" | "sky" | "zinc";

const TONE_CLASS: Record<StatusTone, { solid: string; ring: string }> = {
	emerald: {
		solid: "bg-mint-500",
		ring: "ring-mint-500/20",
	},
	amber: {
		solid: "bg-peach-500",
		ring: "ring-peach-500/20",
	},
	rose: {
		solid: "bg-error",
		ring: "ring-error/20",
	},
	sky: {
		solid: "bg-violetx-500",
		ring: "ring-violetx-500/20",
	},
	zinc: {
		solid: "bg-cream-500",
		ring: "ring-cream-500/20",
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
		emerald: "text-mint-600 bg-mint-500/10",
		amber: "text-peach-500 bg-peach-500/10",
		rose: "text-error bg-error/8",
		sky: "text-violetx-500 bg-violetx-500/10",
		zinc: "text-text-muted bg-warm-200",
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
