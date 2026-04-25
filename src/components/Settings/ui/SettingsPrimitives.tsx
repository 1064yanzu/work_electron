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
				"rounded-2xl border border-border ring-1 ring-black/[0.03] shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-colors duration-300",
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
