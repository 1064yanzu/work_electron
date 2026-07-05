/**
 * SettingsButtons — Settings 面板专用的按钮 / 徽章 / 提示条
 *
 * 与 SettingsFormControls / SettingsPrimitives 视觉对齐。
 * Settings 内部不再需要手撸 button / span — 全部用这些组件。
 */
import { type LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "../../../lib/utils";

// =====================================================================
// SettingsButton
// =====================================================================

type ButtonVariant =
	| "primary"
	| "secondary"
	| "ghost"
	| "danger"
	| "danger-solid"
	| "subtle";
type ButtonSize = "sm" | "md";

interface SettingsButtonProps
	extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	icon?: LucideIcon;
	loading?: boolean;
	pill?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
	primary: cn(
		"bg-primary text-primary-foreground shadow-bai-card",
		"hover:opacity-90",
		"disabled:bg-cream-300 disabled:text-text-light disabled:shadow-none",
	),
	secondary: cn(
		"border border-border bg-surface text-text-secondary shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
		"hover:border-cream-500 hover:bg-warm-50 hover:text-text-primary hover:shadow-[0_2px_4px_rgba(0,0,0,0.04)]",
	),
	ghost: cn(
		"border border-transparent text-text-secondary",
		"hover:border-border hover:bg-warm-50 hover:text-text-primary",
	),
	danger: cn(
		"border border-transparent text-text-light",
		"hover:border-[rgba(181,51,51,0.32)] hover:bg-[rgba(181,51,51,0.08)] hover:text-error",
	),
	"danger-solid": cn("bg-error text-white shadow-bai-card", "hover:opacity-90"),
	subtle: cn(
		"border border-border bg-cream-50 text-text-secondary",
		"hover:bg-warm-50 hover:text-text-primary",
	),
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
	sm: "px-2.5 py-1 text-[11px] gap-1",
	md: "px-3.5 py-1.5 text-[12px] gap-1.5",
};

export const SettingsButton = forwardRef<
	HTMLButtonElement,
	SettingsButtonProps
>(function SettingsButton(
	{
		variant = "secondary",
		size = "md",
		icon: Icon,
		loading,
		pill = true,
		className,
		children,
		disabled,
		...rest
	},
	ref,
) {
	return (
		<button
			ref={ref}
			type={rest.type ?? "button"}
			disabled={disabled || loading}
			{...rest}
			className={cn(
				"inline-flex items-center justify-center whitespace-nowrap font-medium",
				"transition-[transform,opacity,color,background-color,border-color,box-shadow] duration-150 ease-out",
				"disabled:cursor-not-allowed disabled:opacity-60",
				pill ? "rounded-full" : "rounded-xl",
				SIZE_CLASSES[size],
				VARIANT_CLASSES[variant],
				className,
			)}
		>
			{loading ? (
				<span className="inline-flex h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
			) : (
				Icon && <Icon className="h-3 w-3" strokeWidth={1.5} />
			)}
			{children}
		</button>
	);
});

// =====================================================================
// SettingsBadge
// =====================================================================

type BadgeTone =
	| "neutral"
	| "primary"
	| "success"
	| "warning"
	| "error"
	| "info"
	| "violet";

interface SettingsBadgeProps {
	children: ReactNode;
	tone?: BadgeTone;
	icon?: LucideIcon;
	dot?: boolean;
	size?: "xs" | "sm";
	className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
	neutral: "bg-cream-200 text-text-muted border-cream-400/60",
	primary: "bg-primary/10 text-primary border-primary/20",
	success: "bg-mint-300/30 text-mint-600 border-mint-300/60",
	warning: "bg-peach-100 text-peach-500 border-peach-200/70",
	error: "bg-[rgba(181,51,51,0.08)] text-error border-[rgba(181,51,51,0.28)]",
	info: "bg-violetx-300/30 text-violetx-600 border-violetx-300/60",
	violet: "bg-violetx-300/30 text-violetx-600 border-violetx-300/60",
};

const TONE_DOT: Record<BadgeTone, string> = {
	neutral: "bg-text-muted",
	primary: "bg-primary",
	success: "bg-mint-500",
	warning: "bg-peach-500",
	error: "bg-error",
	info: "bg-violetx-500",
	violet: "bg-violetx-500",
};

export function SettingsBadge({
	children,
	tone = "neutral",
	icon: Icon,
	dot = false,
	size = "sm",
	className,
}: SettingsBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full border font-semibold",
				size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
				TONE_CLASSES[tone],
				className,
			)}
		>
			{dot && (
				<span
					className={cn(
						"inline-block h-1 w-1 shrink-0 rounded-full",
						TONE_DOT[tone],
					)}
				/>
			)}
			{Icon && <Icon className="h-2.5 w-2.5" strokeWidth={1.5} />}
			{children}
		</span>
	);
}

// =====================================================================
// SettingsHint — 带 icon 的提示条（信息 / 警告 / 成功）
// =====================================================================

type HintTone = "info" | "warning" | "success" | "error";

interface SettingsHintProps {
	tone?: HintTone;
	icon?: LucideIcon;
	title?: ReactNode;
	children: ReactNode;
	className?: string;
}

const HINT_TONE: Record<HintTone, string> = {
	info: "border-cream-400 bg-cream-50 text-text-secondary",
	warning: "border-peach-200/70 bg-peach-100/60",
	success: "border-mint-300/60 bg-mint-300/15",
	error: "border-[rgba(181,51,51,0.28)] bg-[rgba(181,51,51,0.06)]",
};

const HINT_ICON_TONE: Record<HintTone, string> = {
	info: "text-text-muted",
	warning: "text-peach-500",
	success: "text-mint-600",
	error: "text-error",
};

export function SettingsHint({
	tone = "info",
	icon: Icon,
	title,
	children,
	className,
}: SettingsHintProps) {
	return (
		<div
			className={cn(
				"flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5",
				HINT_TONE[tone],
				className,
			)}
		>
			{Icon && (
				<Icon
					className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", HINT_ICON_TONE[tone])}
					strokeWidth={1.5}
				/>
			)}
			<div className="min-w-0 flex-1">
				{title && (
					<div className="text-[12.5px] font-medium leading-snug text-text-primary">
						{title}
					</div>
				)}
				<div
					className={cn(
						"text-[11.5px] leading-relaxed text-text-muted",
						title && "mt-0.5",
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}

// =====================================================================
// SettingsToolbar — sticky 底部操作栏
// =====================================================================

interface SettingsToolbarProps {
	left?: ReactNode;
	right?: ReactNode;
	className?: string;
}

export function SettingsToolbar({
	left,
	right,
	className,
}: SettingsToolbarProps) {
	return (
		<div
			className={cn(
				"sticky bottom-0 -mx-2 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-bai-pop",
				className,
			)}
		>
			<div className="min-w-0 flex-1 text-[12px] text-text-muted">{left}</div>
			<div className="flex shrink-0 items-center gap-2">{right}</div>
		</div>
	);
}
