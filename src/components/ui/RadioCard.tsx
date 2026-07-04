/**
 * RadioCard — B.AI 风格大卡片单选
 *
 * 适用场景：
 * - 线框图 / 高保真 等带预览的二选一
 * - 1:1 / 16:9 / 9:16 等带图标的多选 chip
 * - 图片 / 视频 / 音频 等大类切换
 *
 * 通过 size + layout 适配不同密度：
 * - lg + vertical：大卡片，preview 在上 label 在下
 * - md + vertical：中卡片
 * - sm + horizontal：chip 形态，icon 左 label 右
 *
 * 选中态强调色：accent="primary" 黑色描边（默认），accent="action" 赤陶橙描边
 */
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type RadioCardSize = "sm" | "md" | "lg";
export type RadioCardLayout = "vertical" | "horizontal";
export type RadioCardAccent = "primary" | "action";

export interface RadioCardItem<T extends string = string> {
	value: T;
	label: ReactNode;
	description?: ReactNode;
	/** 左侧/顶部小图标（chip 模式或中卡片） */
	icon?: ReactNode;
	/** 大预览插画（lg 模式专用，会撑满卡片上半） */
	preview?: ReactNode;
	disabled?: boolean;
}

interface RadioCardGroupBaseProps<T extends string = string> {
	items: RadioCardItem<T>[];
	size?: RadioCardSize;
	layout?: RadioCardLayout;
	/** 自动用 grid 排版的列数；不传则用 flex-wrap */
	columns?: 1 | 2 | 3 | 4 | 5;
	accent?: RadioCardAccent;
	className?: string;
	"aria-label"?: string;
}

interface RadioCardGroupSingleProps<T extends string = string>
	extends RadioCardGroupBaseProps<T> {
	multi?: false;
	value: T;
	onChange: (value: T) => void;
}

interface RadioCardGroupMultiProps<T extends string = string>
	extends RadioCardGroupBaseProps<T> {
	multi: true;
	value: T[];
	onChange: (value: T[]) => void;
}

export type RadioCardGroupProps<T extends string = string> =
	| RadioCardGroupSingleProps<T>
	| RadioCardGroupMultiProps<T>;

const sizeStyles: Record<RadioCardSize, string> = {
	sm: "px-3 py-2 text-[12.5px] gap-1.5 rounded-xl",
	md: "p-3 text-[13px] gap-2 rounded-2xl",
	lg: "p-4 text-[14px] gap-3 rounded-2xl",
};

const accentSelectedStyles: Record<RadioCardAccent, string> = {
	primary: cn(
		"border-text-primary",
		"bg-cream-100 dark:bg-cream-800",
		"shadow-bai-card",
		"text-text-primary",
	),
	action: cn(
		"border-terracotta",
		"bg-terracotta/8 dark:bg-terracotta/14",
		"text-terracotta-active dark:text-peach-200",
		"shadow-bai-card",
	),
};

const COLUMN_CLASS: Record<
	NonNullable<RadioCardGroupProps["columns"]>,
	string
> = {
	1: "grid-cols-1",
	2: "grid-cols-2",
	3: "grid-cols-3",
	4: "grid-cols-4",
	5: "grid-cols-5",
};

export function RadioCardGroup<T extends string = string>({
	multi,
	value,
	onChange,
	items,
	size = "lg",
	layout = "vertical",
	columns,
	accent = "primary",
	className,
	"aria-label": ariaLabel,
}: RadioCardGroupProps<T>) {
	const containerClass = columns
		? cn("grid gap-2.5", COLUMN_CLASS[columns])
		: "flex flex-wrap gap-2.5";

	return (
		<div
			role={multi ? "group" : "radiogroup"}
			aria-label={ariaLabel}
			className={cn(containerClass, className)}
		>
			{items.map((item) => {
				const isSelected = multi
					? (value as T[]).includes(item.value)
					: item.value === value;
				const isHorizontal = layout === "horizontal";

				return (
					<button
						key={item.value}
						type="button"
						role={multi ? "checkbox" : "radio"}
						aria-checked={isSelected}
						disabled={item.disabled}
						onClick={() => {
							if (item.disabled) return;
							if (multi) {
								const current = value as T[];
								const next = isSelected
									? current.filter((v) => v !== item.value)
									: [...current, item.value];
								(onChange as (nextValue: T[]) => void)(next);
								return;
							}
							(onChange as (nextValue: T) => void)(item.value);
						}}
						className={cn(
							"relative w-full border transition-all duration-150 text-left",
							"focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
							"active:scale-[0.99]",
							"disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
							sizeStyles[size],
							isHorizontal
								? "flex items-center gap-2.5"
								: "flex flex-col items-stretch",
							isSelected
								? accentSelectedStyles[accent]
								: cn(
										"bg-cream-50 dark:bg-cream-900",
										"border-cream-300 dark:border-cream-500/60",
										"text-text-secondary",
										"hover:border-cream-400 hover:bg-cream-100/60",
										"dark:hover:border-cream-500 dark:hover:bg-cream-800/40",
									),
						)}
					>
						{/* 预览：仅 vertical + 提供 preview 时展示 */}
						{item.preview && !isHorizontal && (
							<div
								className={cn(
									"w-full overflow-hidden rounded-xl",
									"border border-cream-300/80 dark:border-cream-500/40",
									"bg-cream-100/70 dark:bg-cream-800/40",
									size === "lg"
										? "h-20 flex items-center justify-center"
										: "h-14 flex items-center justify-center",
								)}
							>
								{item.preview}
							</div>
						)}

						{/* 图标 + 文字 */}
						<div
							className={cn(
								"flex items-center gap-2 min-w-0",
								!isHorizontal && item.preview ? "" : "flex-1",
							)}
						>
							{item.icon && (
								<span
									className={cn(
										"flex-shrink-0 flex items-center justify-center",
										isSelected
											? accent === "action"
												? "text-terracotta"
												: "text-text-primary"
											: "text-text-muted",
									)}
								>
									{item.icon}
								</span>
							)}
							<div className="min-w-0 flex-1">
								<div
									className={cn(
										"font-medium truncate",
										isSelected && "font-semibold",
									)}
								>
									{item.label}
								</div>
								{item.description && (
									<div
										className={cn(
											"mt-0.5 text-[11.5px] leading-relaxed",
											isSelected
												? accent === "action"
													? "text-terracotta-active/80 dark:text-peach-200/80"
													: "text-text-secondary"
												: "text-text-muted",
										)}
									>
										{item.description}
									</div>
								)}
							</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}

export default RadioCardGroup;
