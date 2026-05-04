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
			style={{ backgroundColor: "var(--t-bg-surface)" }}
		>
			<div className={cn("space-y-8", contentClassName)}>{children}</div>
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
				"rounded-2xl border border-border shadow-bai-card transition-colors duration-300",
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
				"mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted",
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
				"flex items-center justify-between border-b border-border py-4 last:border-0",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[13.5px] font-medium leading-snug text-text-primary">
					{label}
				</div>
				{description && (
					<div className="mt-1 text-[12px] leading-relaxed text-text-muted">
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
				checked ? "bg-primary" : "bg-warm-300",
				disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
				className,
			)}
		>
			<span
				className={cn(
					"inline-block h-[16px] w-[16px] transform rounded-full shadow-sm transition-transform duration-200",
					checked
						? "translate-x-[20px] bg-primary-foreground"
						: "translate-x-[3px] bg-surface",
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
				"flex items-start justify-between gap-4 border-b border-border px-5 py-4",
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
