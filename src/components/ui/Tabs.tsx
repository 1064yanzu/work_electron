/**
 * Tabs — B.AI 风格统一 Tab 组件
 *
 * 三种 variant：
 * - segmented（默认）：截图风格，容器胶囊化，选中态白底 + 轻阴影 + 加粗
 * - underline：选中态在底部画一条短指示线（带 transition）
 * - pills：纯胶囊 chip，选中态深底白字
 */
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type TabsVariant = "segmented" | "underline" | "pills";
export type TabsSize = "sm" | "md" | "lg";

export interface TabItem<T extends string = string> {
	value: T;
	label: ReactNode;
	icon?: ReactNode;
	/** 可选副说明（仅 segmented variant 在足够空间时显示） */
	hint?: string;
	disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
	value: T;
	onChange: (value: T) => void;
	items: TabItem<T>[];
	variant?: TabsVariant;
	size?: TabsSize;
	/** 容器自定义类名 */
	className?: string;
	/** 是否撑满父容器宽度（每个 tab 等宽） */
	fullWidth?: boolean;
	"aria-label"?: string;
}

const sizeStyles: Record<TabsSize, { trigger: string; container: string }> = {
	sm: {
		trigger: "h-7 px-2.5 text-xs gap-1.5",
		container: "p-0.5",
	},
	md: {
		trigger: "h-8 px-3 text-sm gap-2",
		container: "p-1",
	},
	lg: {
		trigger: "h-9 px-4 text-sm gap-2",
		container: "p-1",
	},
};

function getVariantClasses(variant: TabsVariant, size: TabsSize) {
	switch (variant) {
		case "underline":
			return {
				root: "inline-flex items-center gap-1 border-b border-cream-300 dark:border-cream-500/60",
				trigger: cn(
					"relative inline-flex items-center justify-center rounded-none",
					"font-medium transition-colors duration-150",
					sizeStyles[size].trigger,
					"-mb-px",
				),
				active: "text-text-primary",
				inactive: "text-text-secondary hover:text-text-primary",
				indicator:
					"absolute left-3 right-3 -bottom-px h-[2px] rounded-full bg-text-primary",
			};
		case "pills":
			return {
				root: "inline-flex items-center gap-1.5",
				trigger: cn(
					"inline-flex items-center justify-center rounded-full",
					"font-medium transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150",
					sizeStyles[size].trigger,
				),
				active: "bg-primary text-primary-foreground shadow-bai-card",
				inactive:
					"bg-cream-100 text-text-secondary hover:bg-cream-200 hover:text-text-primary dark:bg-cream-800/60 dark:hover:bg-cream-800",
				indicator: "",
			};
		default:
			return {
				root: cn(
					"inline-flex items-center gap-0.5 rounded-full border border-cream-300 dark:border-cream-500/60",
					"bg-cream-100/70 dark:bg-cream-800/40",
					sizeStyles[size].container,
				),
				trigger: cn(
					"relative inline-flex items-center justify-center rounded-full",
					"font-medium transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150",
					sizeStyles[size].trigger,
				),
				active:
					"bg-cream-50 dark:bg-cream-900 text-text-primary font-semibold shadow-bai-card",
				inactive:
					"text-text-secondary hover:text-text-primary hover:bg-cream-50/60 dark:hover:bg-cream-900/50",
				indicator: "",
			};
	}
}

export function Tabs<T extends string = string>({
	value,
	onChange,
	items,
	variant = "segmented",
	size = "md",
	className,
	fullWidth = false,
	"aria-label": ariaLabel,
}: TabsProps<T>) {
	const classes = getVariantClasses(variant, size);

	return (
		<div
			role="tablist"
			aria-label={ariaLabel}
			className={cn(classes.root, fullWidth && "w-full", className)}
		>
			{items.map((item) => {
				const isActive = item.value === value;
				return (
					<button
						key={item.value}
						type="button"
						role="tab"
						aria-selected={isActive}
						tabIndex={isActive ? 0 : -1}
						disabled={item.disabled}
						onClick={() => !item.disabled && onChange(item.value)}
						className={cn(
							classes.trigger,
							isActive ? classes.active : classes.inactive,
							fullWidth && "flex-1",
							"focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
							"disabled:opacity-40 disabled:cursor-not-allowed",
							"active:scale-[0.985]",
						)}
					>
						{item.icon && <span className="flex-shrink-0">{item.icon}</span>}
						<span className="truncate">{item.label}</span>
						{isActive && variant === "underline" && (
							<span className={classes.indicator} aria-hidden="true" />
						)}
					</button>
				);
			})}
		</div>
	);
}

export default Tabs;
