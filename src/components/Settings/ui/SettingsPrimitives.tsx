import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

/**
 * 内容栏宽度档位。
 *
 * 以前每个面板各写各的 `max-w-2xl` / `max-w-3xl` / `max-w-5xl` / 不写，
 * 一共 6 种写法，导致点不同二级页时内容栏会左右跳、宽度会变。
 * 收敛成三档，需要更宽的页面必须显式声明，而不是随手改 className。
 */
export type SettingsPageWidth = "default" | "wide" | "full";

const PAGE_WIDTH_CLASS: Record<SettingsPageWidth, string> = {
	/** 常规设置页：单列表单，约 45 字符行宽，最利于扫读 */
	default: "max-w-[46rem]",
	/** 表格 / 矩阵 / 多列统计（远控通道矩阵、记忆统计、使用统计） */
	wide: "max-w-[68rem]",
	/** 自带内部分栏的页面（服务商 master-detail），不加约束 */
	full: "",
};

interface SettingsPageContainerProps {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	/** 内容栏宽度档位，默认 `default`。 */
	width?: SettingsPageWidth;
}

export function SettingsPageContainer({
	children,
	className,
	contentClassName,
	width = "default",
}: SettingsPageContainerProps) {
	return (
		<div
			className={cn(
				"h-full flex-1 overflow-y-auto px-12 pb-24 pt-14 text-text-primary transition-colors duration-250",
				className,
			)}
			// 内容区用 surface（最亮的一层）而不是 bg：
			// 卡片也是 surface，两者同色后卡片只剩一条描边，不再是「浮在米色上的白块」。
			// 侧栏保持 bg（更暗一档），靠明暗自然分栏，不依赖硬边框。
			style={{ backgroundColor: "var(--t-bg-surface)" }}
		>
			<div
				className={cn(PAGE_WIDTH_CLASS[width], "space-y-10", contentClassName)}
			>
				{children}
			</div>
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
		// 不加阴影：内容区与卡片同为 surface，卡片靠一条描边界定范围即可。
		// 阴影会让每张卡都「抬起」一层，卡一多整页就碎。
		<div
			className={cn("rounded-2xl border border-border", className)}
			style={{ backgroundColor: "var(--t-bg-surface)" }}
		>
			{children}
		</div>
	);
}

/**
 * 分节标题 —— 层级第 2 级，介于页面 H1 与卡片行之间。
 *
 * 位置在**卡片外部、卡片上方**（Codex 设置页的「权限」「常规」就是这个位置）。
 * 标题留在卡外，卡片内部就只剩「行」这一种东西，一张卡 = 一组同类设置，
 * 扫读时眼睛先过标题再进卡片，层级是线性的；标题塞进卡片里则多出一道边框，
 * 变成「卡中卡」的错觉。
 *
 * 字号 15px：H1(28) → 分节(15) → 行 label(14) + 描述(12.5)，
 * 相邻两级的差要足够大才读得出递进，太近就糊成一片。
 */
interface SettingsSectionTitleProps {
	children: ReactNode;
	className?: string;
}

export function SettingsSectionTitle({
	children,
	className,
}: SettingsSectionTitleProps) {
	return (
		<h2
			className={cn(
				"mb-3.5 text-base font-semibold leading-snug tracking-[-0.01em] text-text-primary",
				className,
			)}
		>
			{children}
		</h2>
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
				"flex items-center justify-between gap-4 border-b border-border py-4 last:border-0",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium leading-snug text-text-primary">
					{label}
				</div>
				{description && (
					<div className="mt-1.5 text-xs leading-relaxed text-text-secondary">
						{description}
					</div>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-3">
				{value && <div className="text-sm text-text-secondary">{value}</div>}
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
				"focus-ring relative inline-flex h-[22px] w-[40px] items-center rounded-full transition-colors duration-150",
				checked ? "bg-primary" : "bg-warm-400/80",
				disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
				className,
			)}
		>
			<span
				className={cn(
					"inline-block h-[16px] w-[16px] transform rounded-full shadow-sm transition-transform duration-150",
					checked
						? "translate-x-[20px] bg-primary-foreground"
						: "translate-x-[3px] bg-white",
				)}
			/>
		</button>
	);
}

/**
 * 设置面板的「区段头」— 标题 + 可选副标题 + 右侧操作。
 *
 * @deprecated 新代码请用 `SettingsCardSection`，它把标题渲染在**卡片外**。
 * 标题塞进卡片会在标题与内容之间多一条边框，一张卡看起来像两个区块（「卡中卡」），
 * 页面上区块数就翻倍了。本组件保留仅为兼容尚未迁移的调用。
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
				<h3 className="text-sm font-semibold leading-snug text-text-primary">
					{title}
				</h3>
				{description && (
					<p className="mt-1 text-xs leading-relaxed text-text-muted">
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
						className="block text-sm font-medium text-text-primary"
					>
						{label}
						{required && <span className="ml-0.5 text-error">*</span>}
					</label>
					{hint && (
						<p className="mt-0.5 text-xs leading-relaxed text-text-muted">
							{hint}
						</p>
					)}
				</div>
				<div className="min-w-0 flex-1">
					{children}
					{error && (
						<p className="mt-1 text-xs leading-relaxed text-error">{error}</p>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className={cn("space-y-1.5 py-3", className)}>
			<label
				htmlFor={htmlFor}
				className="block text-sm font-medium text-text-primary"
			>
				{label}
				{required && <span className="ml-0.5 text-error">*</span>}
			</label>
			{hint && (
				<p className="text-xs leading-relaxed text-text-muted">{hint}</p>
			)}
			<div>{children}</div>
			{error && <p className="text-xs leading-relaxed text-error">{error}</p>}
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
						<h5 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
							{title}
						</h5>
					)}
					{description && (
						<p className="mt-1 text-xs leading-relaxed text-text-muted">
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
	"w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary",
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
							<div className="text-xs font-medium leading-snug text-text-primary">
								{label}
							</div>
						)}
						{hint && (
							<div className="mt-0.5 text-xs leading-relaxed text-text-muted">
								{hint}
							</div>
						)}
					</div>
					<span
						className="shrink-0 inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-mono tabular-nums text-text-primary"
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
					className="pointer-events-none absolute h-[5px] rounded-full transition-[width] duration-150"
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
				<div className="flex justify-between text-2xs tabular-nums text-text-light">
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
				"inline-flex items-center gap-1 rounded-full border border-border p-1",
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
							size === "sm" ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-xs",
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
									"text-2xs tabular-nums",
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
 * SettingsStat — 紧凑键值行（label 左、数值+提示右）
 *
 * 用于概览统计（"3 个内置 / 2 个自定义"）。多行并列时外层用
 * `rounded-2xl border border-border bg-surface px-4 divide-y divide-border/60`
 * 包成一张列表卡，替代旧版的大数字统计卡网格。
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
				"flex items-baseline justify-between gap-3 py-2.5",
				className,
			)}
		>
			<span className="shrink-0 text-xs font-medium text-text-secondary">
				{label}
			</span>
			<span className="flex min-w-0 items-baseline justify-end gap-2 text-right">
				<span className="tabular-nums text-sm font-medium text-text-primary">
					{value}
				</span>
				{hint && (
					<span className="truncate text-2xs text-text-light">{hint}</span>
				)}
			</span>
		</div>
	);
}

/**
 * SettingsCardSection — 「分节标题 + 一张卡」的组合
 *
 * 标题渲染在**卡片外部上方**（`SettingsSectionTitle` 那一级），不在卡片里。
 *
 * 以前标题在卡内 header、和内容之间还隔一条 border，一张卡就有了两个区块，
 * 读起来像「卡中卡」；把标题提到卡外之后，卡片内部只剩「行」，
 * 「标题 → 卡片 → 行」是一条直线，页面上有几组设置一眼可数。
 *
 * `headerAction` 跟着标题走，落在标题行右端。
 * `className` 作用在本组件的**根元素**上（有标题时是外层 section，无标题时是卡片本身），
 * 所以 `opacity-50` 这类「整段禁用」的样式会连标题一起生效。
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
	const hasHeading = Boolean(title || description || headerAction);

	const card = (
		<SettingsSectionCard className={hasHeading ? undefined : className}>
			<div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
		</SettingsSectionCard>
	);

	if (!hasHeading) return card;

	return (
		<section className={className}>
			<div className="mb-3.5 flex items-end justify-between gap-4">
				<div className="min-w-0">
					{title && (
						<SettingsSectionTitle className="mb-0">
							{title}
						</SettingsSectionTitle>
					)}
					{description && (
						<p className="mt-1.5 max-w-[62ch] text-xs leading-relaxed text-text-muted">
							{description}
						</p>
					)}
				</div>
				{headerAction && <div className="shrink-0">{headerAction}</div>}
			</div>
			{card}
		</section>
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
