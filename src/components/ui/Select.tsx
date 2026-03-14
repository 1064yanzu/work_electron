import { ChevronDown } from "lucide-react";
import {
	forwardRef,
	type SelectHTMLAttributes,
	type ReactNode,
	type ForwardedRef,
} from "react";

/**
 * 统一的高级质感下拉选择组件
 *
 * 设计特点：
 * - 统一圆角、边框、背景色
 * - 内置 ChevronDown 图标
 * - 微妙的渐变和阴影效果
 * - 丰富的交互状态反馈
 * - 解决 z-index 叠压问题
 */

export interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface SelectProps
	extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
	/** 选项列表，如果提供则自动渲染 options */
	options?: SelectOption[];
	/** 子元素（手动渲染 option） */
	children?: ReactNode;
	/** 尺寸变体 */
	variant?: "default" | "compact" | "inline";
	/** 自定义容器类名 */
	containerClassName?: string;
}

/**
 * 获取基于变体的样式
 */
function getVariantStyles(variant: SelectProps["variant"]) {
	switch (variant) {
		case "compact":
			return {
				select: "px-3 py-1.5 pr-8 text-xs",
				icon: "w-3 h-3 right-2",
			};
		case "inline":
			return {
				select: "px-3 py-2 pr-8 text-sm",
				icon: "w-3.5 h-3.5 right-2.5",
			};
		default:
			return {
				select: "px-4 py-2.5 pr-10 text-sm",
				icon: "w-4 h-4 right-3",
			};
	}
}

/**
 * 高级质感下拉选择组件
 */
function SelectComponent(
	{
		options,
		children,
		className = "",
		containerClassName = "",
		variant = "default",
		disabled,
		...props
	}: SelectProps,
	ref: ForwardedRef<HTMLSelectElement>,
) {
	const variantStyles = getVariantStyles(variant);

	return (
		<div className={`relative ${containerClassName}`}>
			<select
				ref={ref}
				disabled={disabled}
				className={`
					w-full appearance-none
					${variantStyles.select}
					bg-white
					border border-zinc-200/80
					rounded-xl
					text-zinc-900 font-medium
					cursor-pointer
					shadow-[0_1px_2px_rgba(0,0,0,0.03)]
					
					/* 交互状态 */
					hover:bg-zinc-50/80
					hover:border-zinc-300
					hover:shadow-[0_2px_4px_rgba(0,0,0,0.04)]
					
					focus:outline-none
					focus:ring-2
					focus:ring-primary/10
					focus:border-primary/50
					
					/* 禁用状态 */
					disabled:opacity-50
					disabled:cursor-not-allowed
					disabled:bg-zinc-100
					disabled:hover:bg-zinc-100
					disabled:hover:border-zinc-200/80
					disabled:shadow-none
					
					/* 过渡动画 */
					transition-all duration-200 ease-out
					
					${className}
				`}
				{...props}
			>
				{options
					? options.map((opt) => (
							<option key={opt.value} value={opt.value} disabled={opt.disabled}>
								{opt.label}
							</option>
						))
					: children}
			</select>
			<ChevronDown
				className={`
					absolute top-1/2 -translate-y-1/2
					${variantStyles.icon}
					text-zinc-400
					pointer-events-none
					transition-colors duration-200
					${disabled ? "" : "group-hover:text-zinc-500"}
				`}
			/>
		</div>
	);
}

// 使用 forwardRef 包装组件以支持 ref 传递
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
	SelectComponent,
);

Select.displayName = "Select";

export default Select;
