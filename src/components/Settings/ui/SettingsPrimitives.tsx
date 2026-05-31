import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

interface SettingsPageContainerProps {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
}

export function SettingsPageContainer({
	children,
	className,
	contentClassName,
}: SettingsPageContainerProps) {
	return (
		<div
			className={cn(
				"flex-1 h-full overflow-y-auto p-8 text-text-primary transition-colors duration-300",
				className,
			)}
			style={{ backgroundColor: "var(--t-bg)" }}
		>
			<div className={cn("space-y-6", contentClassName)}>{children}</div>
		</div>
	);
}

interface SettingsSectionCardProps {
	children: ReactNode;
	className?: string;
}

export function SettingsSectionCard({
	children,
	className,
}: SettingsSectionCardProps) {
	return (
		<div
			className={cn(
				"rounded-2xl border border-border shadow-bai-card",
				className,
			)}
			style={{ backgroundColor: "var(--t-bg-surface)" }}
		>
			{children}
		</div>
	);
}

interface SettingsSectionTitleProps {
	children: ReactNode;
	className?: string;
}

export function SettingsSectionTitle({
	children,
	className,
}: SettingsSectionTitleProps) {
	return (
		<h4
			className={cn(
				"mb-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-text-muted",
				className,
			)}
		>
			{children}
		</h4>
	);
}

interface SettingsRowProps {
	label: string;
	description?: string;
	value?: ReactNode;
	action?: ReactNode;
	className?: string;
}

export function SettingsRow({
	label,
	description,
	value,
	action,
	className,
}: SettingsRowProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-between border-b border-border py-3.5 last:border-0",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[13.5px] font-medium leading-snug text-text-primary">
					{label}
				</div>
				{description && (
					<div className="mt-1 text-[12px] leading-relaxed text-text-secondary">
						{description}
					</div>
				)}
			</div>
			<div className="ml-4 flex items-center gap-3">
				{value && (
					<div className="text-[13px] text-text-secondary">{value}</div>
				)}
				{action}
			</div>
		</div>
	);
}

interface SettingsSwitchProps {
	checked: boolean;
	onChange: (next: boolean) => void;
	disabled?: boolean;
	className?: string;
}

export function SettingsSwitch({
	checked,
	onChange,
	disabled = false,
	className,
}: SettingsSwitchProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={() => {
				if (!disabled) onChange(!checked);
			}}
			className={cn(
			"focus-ring relative inline-flex h-[22px] w-[40px] items-center rounded-full transition-colors duration-200",
			checked ? "bg-primary" : "bg-warm-400/80",
				disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
				className,
			)}
		>
			<span
				className={cn(
					"inline-block h-[16px] w-[16px] transform rounded-full shadow-sm transition-transform duration-200",
				checked
					? "translate-x-[20px] bg-primary-foreground"
					: "translate-x-[3px] bg-white dark:bg-zinc-100",
				)}
			/>
		</button>
	);
}

/**
 * 设置面板的「区段头」— 标题 + 可选副标题 + 右侧操作。
 * 用于 SettingsSectionCard 内部的视觉分组。
 */
interface SettingsHeaderProps {
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
}

export function SettingsHeader({
	title,
	description,
	action,
	className,
}: SettingsHeaderProps) {
	return (
		<div
			className={cn(
				"flex items-start justify-between gap-4 border-b border-border px-5 py-3.5",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				<h3 className="text-[14px] font-semibold leading-snug text-text-primary">
					{title}
				</h3>
				{description && (
					<p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
						{description}
					</p>
				)}
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</div>
	);
}

/**
 * 表单字段 — 左标签 + 可选 hint，右侧放表单控件（input / select / 自定义）。
 * 比 SettingsRow 更适合复杂表单（control 不只是开关或读出值）。
 */
interface SettingsFieldProps {
	label: string;
	hint?: string;
	htmlFor?: string;
	required?: boolean;
	error?: string;
	children: ReactNode;
	className?: string;
	/** vertical: label 在控件上方；horizontal: label 在左侧 */
	layout?: "vertical" | "horizontal";
}

export function SettingsField({
	label,
	hint,
	htmlFor,
	required = false,
	error,
	children,
	className,
	layout = "vertical",
}: SettingsFieldProps) {
	if (layout === "horizontal") {
		return (
			<div
				className={cn(
					"flex items-center gap-4 border-b border-border py-3.5 last:border-0",
					className,
				)}
			>
				<div className="w-[160px] shrink-0">
					<label
						htmlFor={htmlFor}
						className="block text-[13px] font-medium text-text-primary"
					>
						{label}
						{required && <span className="ml-0.5 text-error">*</span>}
					</label>
					{hint && (
						<p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
							{hint}
						</p>
					)}
				</div>
				<div className="min-w-0 flex-1">
					{children}
					{error && (
						<p className="mt-1 text-[11.5px] leading-relaxed text-error">
							{error}
						</p>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className={cn("space-y-1.5 py-3", className)}>
			<label
				htmlFor={htmlFor}
				className="block text-[13px] font-medium text-text-primary"
			>
				{label}
				{required && <span className="ml-0.5 text-error">*</span>}
			</label>
			{hint && (
				<p className="text-[11.5px] leading-relaxed text-text-muted">{hint}</p>
			)}
			<div>{children}</div>
			{error && (
				<p className="text-[11.5px] leading-relaxed text-error">{error}</p>
			)}
		</div>
	);
}

/**
 * 字段组 — 把相关的几个 SettingsField / SettingsRow 包起来，加细描边分隔。
 * 配合 SettingsSectionCard 使用，提供二级分组。
 */
interface SettingsFieldGroupProps {
	title?: string;
	description?: string;
	children: ReactNode;
	className?: string;
}

export function SettingsFieldGroup({
	title,
	description,
	children,
	className,
}: SettingsFieldGroupProps) {
	return (
		<div className={cn("px-5 py-4", className)}>
			{(title || description) && (
				<div className="mb-3">
					{title && (
						<h5 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-muted">
							{title}
						</h5>
					)}
					{description && (
						<p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">
							{description}
						</p>
					)}
				</div>
			)}
			<div className="space-y-0">{children}</div>
		</div>
	);
}

/**
 * 输入框样式工具 — 与 Settings 主题一致的 input/textarea 基础样式。
 * 调用方传入 className，用 cn 合并即可。
 */
export const settingsInputClass = cn(
	"w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary",
	"placeholder:text-text-light",
	"focus:outline-none focus:border-warm-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)]",
	"transition-[border-color,box-shadow] duration-150",
);

/**
 * SettingsSlider — 主题感知滑动条
 *
 * 视觉：标题左对齐 + 当前值药丸右对齐 + 自定义轨道 / 拇指（不依赖 native thumb）。
 * 实现：透明 native range 叠在装饰层上，pointer-events 由 input 单独承接。
 */
interface SettingsSliderProps {
	label?: string;
	hint?: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (next: number) => void;
	formatValue?: (value: number) => string;
	minLabel?: string;
	maxLabel?: string;
	accentColor?: string;
	disabled?: boolean;
	className?: string;
}

export function SettingsSlider({
	label,
	hint,
	value,
	min,
	max,
	step = 1,
	onChange,
	formatValue,
	minLabel,
	maxLabel,
	accentColor,
	disabled = false,
	className,
}: SettingsSliderProps) {
	const display = formatValue ? formatValue(value) : `${value}`;
	const pct = Math.max(
		0,
		Math.min(100, ((value - min) / Math.max(0.0001, max - min)) * 100),
	);
	const accent = accentColor ?? "var(--t-primary, #1A1A19)";
	const accentSoft = accentColor
		? `${accentColor}1F`
		: "var(--t-primary-muted, rgba(26,26,25,0.06))";
	return (
		<div className={cn("space-y-2", className)}>
			{(label || display) && (
				<div className="flex items-baseline justify-between gap-3">
					<div className="min-w-0 flex-1">
						{label && (
							<div className="text-[12.5px] font-medium leading-snug text-text-primary">
								{label}
							</div>
						)}
						{hint && (
							<div className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
								{hint}
							</div>
						)}
					</div>
					<span
						className="shrink-0 inline-flex items-center rounded-full border border-border bg-cream-100 px-2.5 py-[2px] text-[11px] font-mono tabular-nums text-text-primary"
						style={{ backgroundColor: accentSoft, color: accent }}
					>
						{display}
					</span>
				</div>
			)}
			<div
				className={cn(
					"group relative h-6 flex items-center",
					disabled && "opacity-50 pointer-events-none",
				)}
			>
				<div
					className="pointer-events-none absolute inset-x-0 h-[5px] rounded-full"
					style={{ backgroundColor: "var(--t-bg-muted, #F4F2EC)" }}
				/>
				<div
					className="pointer-events-none absolute h-[5px] rounded-full transition-[width] duration-100"
					style={{ width: `${pct}%`, backgroundColor: accent }}
				/>
				<div
					className="pointer-events-none absolute h-4 w-4 rounded-full border-[2px] shadow-bai-card transition-transform duration-150 group-hover:scale-110 group-active:scale-95"
					style={{
						left: `calc(${pct}% - 8px)`,
						borderColor: accent,
						backgroundColor: "var(--t-bg-surface, #FFFFFF)",
					}}
				/>
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					disabled={disabled}
					onChange={(e) => onChange(Number(e.target.value))}
					className="absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
					style={{ WebkitAppearance: "none" }}
				/>
			</div>
			{(minLabel || maxLabel) && (
				<div className="flex justify-between text-[10.5px] tabular-nums text-text-light">
					<span>{minLabel}</span>
					<span>{maxLabel}</span>
				</div>
			)}
		</div>
	);
}

/**
 * SettingsChipGroup — 同一组内多选一的 chip / pill 选择器
 *
 * 用于桌面宠物大小、停留时长、读音方案等小集合。
 * 单个 chip 紧凑、有 hint badge，支持自定义 accent 色（桌宠每个 IP 都有自己的 accent）。
 */
export interface SettingsChipOption<T extends string = string> {
	value: T;
	label: string;
	hint?: string;
	icon?: ReactNode;
	disabled?: boolean;
}

interface SettingsChipGroupProps<T extends string = string> {
	value: T;
	options: SettingsChipOption<T>[];
	onChange: (next: T) => void;
	accentColor?: string;
	size?: "sm" | "md";
	fullWidth?: boolean;
	className?: string;
}

export function SettingsChipGroup<T extends string = string>({
	value,
	options,
	onChange,
	accentColor,
	size = "md",
	fullWidth = false,
	className,
}: SettingsChipGroupProps<T>) {
	const accent = accentColor ?? "var(--t-primary, #1A1A19)";
	return (
		<div
			className={cn(
				"inline-flex items-center gap-1 rounded-full border border-border p-[3px]",
				fullWidth && "w-full",
				className,
			)}
			style={{ backgroundColor: "var(--t-bg-muted, #F4F2EC)" }}
			role="radiogroup"
		>
			{options.map((opt) => {
				const active = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						role="radio"
						aria-checked={active}
						disabled={opt.disabled}
						onClick={() => onChange(opt.value)}
						className={cn(
							"relative inline-flex items-center justify-center gap-1.5 rounded-full transition-[color,background-color,border-color,box-shadow] duration-150 ease-out",
							size === "sm"
								? "px-3 py-1 text-[11.5px]"
								: "px-3.5 py-1.5 text-[12.5px]",
							active
								? "font-semibold shadow-bai-card"
								: "text-text-secondary hover:text-text-primary",
							fullWidth && "flex-1",
							opt.disabled && "cursor-not-allowed opacity-40",
						)}
						style={
							active
								? {
										backgroundColor: "var(--t-bg-surface, #FFFFFF)",
										color: accent,
									}
								: undefined
						}
					>
						{opt.icon && <span className="shrink-0">{opt.icon}</span>}
						<span className="leading-none">{opt.label}</span>
						{opt.hint && (
							<span
								className={cn(
									"text-[10px] tabular-nums",
									active ? "opacity-70" : "text-text-light",
								)}
							>
								{opt.hint}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

/**
 * SettingsStat — 单个数字 + 描述的小展示块
 *
 * 用于在 panel header 旁边展示统计（"3 个内置 / 2 个自定义"），
 * 或在卡片内部做指标块（"语速 1x / 音量 80% / 音调 1"）。
 */
interface SettingsStatProps {
	label: string;
	value: ReactNode;
	hint?: string;
	className?: string;
}

export function SettingsStat({
	label,
	value,
	hint,
	className,
}: SettingsStatProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-0.5 rounded-xl border border-border bg-cream-50 px-3 py-2",
				className,
			)}
		>
			<div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-text-muted">
				{label}
			</div>
			<div className="text-[15px] font-semibold leading-tight tabular-nums text-text-primary">
				{value}
			</div>
			{hint && (
				<div className="text-[10.5px] leading-relaxed text-text-light">
					{hint}
				</div>
			)}
		</div>
	);
}

/**
 * SettingsCardSection — 简化的「带 header + 内容 padding」组合
 *
 * 等价于 <SettingsSectionCard><SettingsHeader/><div className="p-x">…</div></SettingsSectionCard>，
 * 但常用结构出现频率太高，给个一行 API。
 */
interface SettingsCardSectionProps {
	title?: string;
	description?: string;
	headerAction?: ReactNode;
	children: ReactNode;
	bodyClassName?: string;
	className?: string;
}

export function SettingsCardSection({
	title,
	description,
	headerAction,
	children,
	bodyClassName,
	className,
}: SettingsCardSectionProps) {
	return (
		<SettingsSectionCard className={className}>
			{(title || description || headerAction) && (
				<SettingsHeader
					title={title ?? ""}
					description={description}
					action={headerAction}
				/>
			)}
			<div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
		</SettingsSectionCard>
	);
}

// =====================================================================
// 表单基础控件 / 按钮 / 徽章 — 统一从此处再导出
// =====================================================================

export {
	SettingsTextInput,
	SettingsTextArea,
	SettingsPasswordInput,
	SettingsNumberInput,
	SettingsCheckbox,
} from "./SettingsFormControls";

export {
	SettingsButton,
	SettingsBadge,
	SettingsHint,
	SettingsToolbar,
} from "./SettingsButtons";
