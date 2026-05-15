/**
 * 统一 Button 组件 — B.AI 风格
 * 暖调单色、胶囊化 / 圆角双形态、克制阴影、细腻微交互
 */
import { Loader2 } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?:
		| "primary"
		| "secondary"
		| "ghost"
		| "danger"
		| "outline"
		| "peach"
		| "action";
	size?: "sm" | "md" | "lg";
	/** 形状：pill 全胶囊（B.AI 主推），rounded 大圆角（兼容旧调用） */
	shape?: "pill" | "rounded";
	loading?: boolean;
	icon?: React.ReactNode;
	iconPosition?: "left" | "right";
}

const variantStyles = {
	// B.AI 黑底主按钮 — 主题感知
	primary: `
		bg-primary text-primary-foreground
		hover:bg-primary-hover
		active:opacity-90
		border border-transparent
	`,
	// 暖白底次要按钮 — 1px 暖描边
	secondary: `
		bg-surface
		text-text-primary
		border border-border
		hover:bg-warm-200
		hover:border-warm-400
	`,
	// 透明幽灵按钮 — 低优先级操作
	ghost: `
		bg-transparent
		text-text-secondary
		border border-transparent
		hover:bg-warm-200
		hover:text-text-primary
	`,
	// 深红危险按钮
	danger: `
		bg-[#b53333] text-white
		hover:bg-[#9e2b2b]
		border border-transparent
	`,
	// 描边按钮 — 暖色边框，无填充
	outline: `
		bg-transparent
		border border-border
		text-text-primary
		hover:bg-warm-200
		hover:border-warm-400
	`,
	// 桃色 pill — 1% 彩色锚点（升级 / 领取等）
	peach: `
		bg-[#F8DCCB] text-cream-900
		hover:bg-[#F2C4A8]
		border border-transparent
		dark:bg-[rgba(248,220,203,0.18)] dark:text-[#F8DCCB]
	`,
	// 赤陶橙强行动 CTA — 仅用于「创建 / 确认 / 继续 / 提交」类关键动作
	action: `
		bg-[#D96C46] text-white
		hover:bg-[#C25A38]
		active:bg-[#A8482B]
		border border-transparent
		shadow-bai-card
		dark:bg-[#D96C46] dark:text-white
		dark:hover:bg-[#C25A38]
	`,
};

const sizeStyles = {
	pill: {
		sm: "h-7 px-3 text-xs gap-1.5 rounded-full",
		md: "h-9 px-4 text-sm gap-2 rounded-full",
		lg: "h-11 px-5 text-[15px] gap-2.5 rounded-full",
	},
	rounded: {
		sm: "h-8 px-3 text-xs gap-1.5 rounded-xl",
		md: "h-9 px-4 text-sm gap-2 rounded-xl",
		lg: "h-11 px-5 text-base gap-2.5 rounded-2xl",
	},
};

export function Button({
	variant = "primary",
	size = "md",
	shape = "pill",
	loading = false,
	icon,
	iconPosition = "left",
	className,
	disabled,
	children,
	...props
}: ButtonProps) {
	const isDisabled = disabled || loading;

	return (
		<button
			type="button"
			disabled={isDisabled}
			className={cn(
				"inline-flex items-center justify-center font-medium",
				"transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out",
				// B.AI focus ring — 暖灰，不用浏览器蓝
				"focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
				// active 微交互
				"active:scale-[0.98]",
				// 禁用状态
				"disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
				variantStyles[variant],
				sizeStyles[shape][size],
				className,
			)}
			{...props}
		>
			{loading && (
				<Loader2
					className={cn(
						"animate-spin",
						size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4",
					)}
					strokeWidth={1.75}
				/>
			)}

			{!loading && icon && iconPosition === "left" && (
				<span className="flex-shrink-0">{icon}</span>
			)}

			{children && <span>{children}</span>}

			{!loading && icon && iconPosition === "right" && (
				<span className="flex-shrink-0">{icon}</span>
			)}
		</button>
	);
}

/**
 * IconButton — 纯图标按钮，B.AI 风格统一胶囊化
 */
export interface IconButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "ghost" | "danger" | "peach" | "action";
	size?: "sm" | "md" | "lg";
	loading?: boolean;
}

const iconSizeStyles = {
	sm: "w-7 h-7 rounded-full",
	md: "w-9 h-9 rounded-full",
	lg: "w-11 h-11 rounded-full",
};

export function IconButton({
	variant = "ghost",
	size = "md",
	loading = false,
	className,
	disabled,
	children,
	...props
}: IconButtonProps) {
	const isDisabled = disabled || loading;

	return (
		<button
			type="button"
			disabled={isDisabled}
			className={cn(
				"inline-flex items-center justify-center",
				"transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out",
				"focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
				"active:scale-[0.95]",
				"disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
				variantStyles[variant],
				iconSizeStyles[size],
				className,
			)}
			{...props}
		>
			{loading ? (
				<Loader2
					className={cn(
						"animate-spin",
						size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4",
					)}
					strokeWidth={1.75}
				/>
			) : (
				children
			)}
		</button>
	);
}
