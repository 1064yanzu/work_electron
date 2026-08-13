/**
 * StatusDot — 统一状态小圆点
 * 用于通道 / 会话 / 配对状态的一致视觉表达。
 * 语义色全部走主题 token：success(在线) / warning(警告) / error / info / warm 灰。
 */

import { cn } from "../../../../lib/utils";

export type StatusTone = "emerald" | "amber" | "rose" | "sky" | "zinc";

const TONE_CLASS: Record<StatusTone, { solid: string; ring: string }> = {
	emerald: {
		solid: "bg-success",
		ring: "ring-success/20",
	},
	amber: {
		solid: "bg-warning",
		ring: "ring-warning/20",
	},
	rose: {
		solid: "bg-error",
		ring: "ring-error/20",
	},
	sky: {
		solid: "bg-info",
		ring: "ring-info/20",
	},
	zinc: {
		solid: "bg-warm-500",
		ring: "ring-border/20",
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
		emerald: "text-success bg-success/10",
		amber: "text-warning bg-warning/10",
		rose: "text-error bg-error/8",
		sky: "text-info bg-info/10",
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
