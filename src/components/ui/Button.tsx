/**
 * 统一 Button 组件 — B.AI 风格
 * 暖调单色、胶囊化 / 圆角双形态、克制阴影、细腻微交互
 */
import { Loader2 } from "lucide-react";
import type * as React from "react";
import { useSpringPress } from "../../lib/motion";
import { cn } from "../../lib/utils";

/**
 * 按下反馈的两套实现：
 * - standard / reduced 档：CSS `active:scale-*`（原有行为，一字不动）；
 * - expressive 档：GSAP 弹性回弹（`useSpringPress`）。
 *
 * 切到 GSAP 时必须把 transform 从 transition-property 里摘掉，
 * 否则浏览器会在 GSAP 每帧写的值之间再插值一次，过冲直接被抹平。
 */
const TRANSITION_WITH_TRANSFORM =
	"transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out";
const TRANSITION_WITHOUT_TRANSFORM =
	"transition-[background-color,border-color,color,opacity] duration-150 ease-out";

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
	// 深红危险按钮 — 接主题语义 token（--t-error）
	danger: `
		bg-error text-white
		hover:opacity-90
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
	// 桃色 pill — 1% 彩色锚点（升级 / 领取等），peach 色阶来自 tailwind.config.js
	peach: `
		bg-peach-100 text-cream-900
		hover:bg-peach-200
		border border-transparent
		dark:bg-peach-100/[0.18] dark:text-peach-100
	`,
	// 赤陶橙强行动 CTA — 仅用于「创建 / 确认 / 继续 / 提交」类关键动作
	action: `
		bg-terracotta text-white
		hover:bg-terracotta-hover
		active:bg-terracotta-active
		border border-transparent
		shadow-bai-card
		dark:bg-terracotta dark:text-white
		dark:hover:bg-terracotta-hover
	`,
};

const sizeStyles = {
	pill: {
		sm: "h-7 px-3 text-xs gap-1.5 rounded-full",
		md: "h-9 px-4 text-sm gap-2 rounded-full",
		lg: "h-11 px-5 text-base gap-2.5 rounded-full",
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
	const { ref: pressRef, active: springPress } =
		useSpringPress<HTMLButtonElement>({
			pressScale: 0.96,
			disabled: isDisabled,
		});

	return (
		<button
			ref={pressRef}
			type="button"
			disabled={isDisabled}
			className={cn(
				"inline-flex items-center justify-center font-medium",
				springPress ? TRANSITION_WITHOUT_TRANSFORM : TRANSITION_WITH_TRANSFORM,
				// B.AI focus ring — 暖灰，不用浏览器蓝
				"focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
				// active 微交互（expressive 档交给 GSAP，避免两套 scale 打架）
				springPress ? "" : "active:scale-[0.98]",
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
	const { ref: pressRef, active: springPress } =
		useSpringPress<HTMLButtonElement>({
			pressScale: 0.92,
			disabled: isDisabled,
		});

	return (
		<button
			ref={pressRef}
			type="button"
			disabled={isDisabled}
			className={cn(
				"inline-flex items-center justify-center",
				springPress ? TRANSITION_WITHOUT_TRANSFORM : TRANSITION_WITH_TRANSFORM,
				"focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
				springPress ? "" : "active:scale-[0.95]",
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
