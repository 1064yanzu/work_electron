/**
 * 统一 Button 组件 — Claude 风格
 * 环形阴影、暖色调、细腻微交互
 */
import { Loader2 } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
	size?: "sm" | "md" | "lg";
	loading?: boolean;
	icon?: React.ReactNode;
	iconPosition?: "left" | "right";
}

const variantStyles = {
	// 陶土橙主按钮 — 品牌核心 CTA
	primary: `
		bg-[#c96442] text-[#faf9f5]
		hover:bg-[#b5573a]
		active:bg-[#a34e34]
		shadow-[#c96442_0px_0px_0px_0px,#c96442_0px_0px_0px_1px]
		hover:shadow-[#c96442_0px_0px_0px_0px,#b5573a_0px_0px_0px_1px]
		transition-shadow
	`,
	// 暖沙色次要按钮 — 日常操作
	secondary: `
		bg-[#e8e6dc] dark:bg-[#30302e]
		text-[#4d4c48] dark:text-[#b0aea5]
		hover:bg-[#dddbd0] dark:hover:bg-[#3a3937]
		active:bg-[#d5d3c8] dark:active:bg-[#404040]
		shadow-[#e8e6dc_0px_0px_0px_0px,#d1cfc5_0px_0px_0px_1px]
		dark:shadow-[#30302e_0px_0px_0px_0px,#4a4845_0px_0px_0px_1px]
		hover:shadow-[#e8e6dc_0px_0px_0px_0px,#c2c0b6_0px_0px_0px_1px]
	`,
	// 透明幽灵按钮 — 低优先级操作
	ghost: `
		bg-transparent
		text-[#5e5d59] dark:text-[#87867f]
		hover:bg-[#f0eee6] dark:hover:bg-[#30302e]
		hover:text-[#141413] dark:hover:text-[#faf9f5]
		active:bg-[#e8e6dc] dark:active:bg-[#3a3937]
	`,
	// 深暖红危险按钮
	danger: `
		bg-[#b53333] text-[#faf9f5]
		hover:bg-[#9e2b2b]
		active:bg-[#8a2424]
		shadow-[#b53333_0px_0px_0px_0px,#b53333_0px_0px_0px_1px]
		hover:shadow-[#9e2b2b_0px_0px_0px_0px,#9e2b2b_0px_0px_0px_1px]
	`,
	// 描边按钮 — 暖色边框
	outline: `
		bg-transparent
		border border-[#e8e6dc] dark:border-[#30302e]
		text-[#4d4c48] dark:text-[#b0aea5]
		hover:bg-[#f5f4ed] dark:hover:bg-[#30302e]
		hover:border-[#d1cfc5] dark:hover:border-[#4a4845]
		active:bg-[#f0eee6] dark:active:bg-[#3a3937]
	`,
};

const sizeStyles = {
	sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
	md: "h-9 px-4 text-sm gap-2 rounded-xl",
	lg: "h-11 px-5 text-base gap-2.5 rounded-xl",
};

export function Button({
	variant = "primary",
	size = "md",
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
				"transition-all duration-150 ease-out",
				// Focus ring — 唯一冷色，用于无障碍
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3898ec]/50 focus-visible:ring-offset-2",
				// active 微交互
				"active:scale-[0.98]",
				// 禁用状态
				"disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
				variantStyles[variant],
				sizeStyles[size],
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
 * IconButton — 纯图标按钮
 */
export interface IconButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "ghost" | "danger";
	size?: "sm" | "md" | "lg";
	loading?: boolean;
}

const iconSizeStyles = {
	sm: "w-7 h-7 rounded-lg",
	md: "w-9 h-9 rounded-xl",
	lg: "w-11 h-11 rounded-xl",
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
				"transition-all duration-150 ease-out",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3898ec]/50 focus-visible:ring-offset-2",
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
				/>
			) : (
				children
			)}
		</button>
	);
}
