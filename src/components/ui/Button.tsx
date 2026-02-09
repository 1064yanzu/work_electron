/**
 * 统一 Button 组件
 * 提供高级质感的按钮，包含微交互动画、多种变体和加载状态
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
    primary: `
		bg-primary text-white
		hover:bg-primary-hover
		active:bg-primary
		shadow-sm hover:shadow-md
	`,
    secondary: `
		bg-zinc-100 dark:bg-zinc-800 
		text-zinc-800 dark:text-zinc-100
		hover:bg-zinc-200 dark:hover:bg-zinc-700
		active:bg-zinc-300 dark:active:bg-zinc-600
	`,
    ghost: `
		bg-transparent
		text-zinc-600 dark:text-zinc-400
		hover:bg-zinc-100 dark:hover:bg-zinc-800
		hover:text-zinc-800 dark:hover:text-zinc-200
		active:bg-zinc-200 dark:active:bg-zinc-700
	`,
    danger: `
		bg-red-500 text-white
		hover:bg-red-600
		active:bg-red-700
		shadow-sm hover:shadow-md
	`,
    outline: `
		bg-transparent
		border border-zinc-200 dark:border-zinc-700
		text-zinc-700 dark:text-zinc-300
		hover:bg-zinc-50 dark:hover:bg-zinc-800/50
		hover:border-zinc-300 dark:hover:border-zinc-600
		active:bg-zinc-100 dark:active:bg-zinc-800
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
                // 基础样式
                "inline-flex items-center justify-center font-medium",
                "transition-all duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
                // 微交互
                "hover:scale-[1.02] active:scale-[0.98]",
                // 禁用状态
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100",
                // 变体和尺寸
                variantStyles[variant],
                sizeStyles[size],
                className,
            )}
            {...props}
        >
            {/* 加载状态 */}
            {loading && (
                <Loader2
                    className={cn(
                        "animate-spin",
                        size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4",
                    )}
                />
            )}

            {/* 左侧图标 */}
            {!loading && icon && iconPosition === "left" && (
                <span className="flex-shrink-0">{icon}</span>
            )}

            {/* 内容 */}
            {children && <span>{children}</span>}

            {/* 右侧图标 */}
            {!loading && icon && iconPosition === "right" && (
                <span className="flex-shrink-0">{icon}</span>
            )}
        </button>
    );
}

/**
 * IconButton - 只有图标的按钮
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
                // 基础样式
                "inline-flex items-center justify-center",
                "transition-all duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
                // 微交互
                "hover:scale-[1.05] active:scale-[0.95]",
                // 禁用状态
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100",
                // 变体和尺寸
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
