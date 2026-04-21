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
				"flex-1 h-full overflow-y-auto bg-white dark:bg-zinc-950 p-8 text-text-primary",
				className,
			)}
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
				"rounded-2xl border border-zinc-200/80 bg-white ring-1 ring-black/[0.03] shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/[0.02] dark:shadow-[0_2px_12px_rgba(0,0,0,0.2)]",
				className,
			)}
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
				"mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500",
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
				"flex items-center justify-between border-b border-zinc-100/80 py-4 last:border-0 dark:border-zinc-800/80",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[13.5px] font-medium leading-snug text-zinc-800 dark:text-zinc-100">
					{label}
				</div>
				{description && (
					<div className="mt-1 text-[12px] leading-relaxed text-zinc-400 dark:text-zinc-500">
						{description}
					</div>
				)}
			</div>
			<div className="ml-4 flex items-center gap-3">
				{value && (
					<div className="text-[13px] text-zinc-500 dark:text-zinc-400">
						{value}
					</div>
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
				checked ? "bg-[#c96442]" : "bg-zinc-200 dark:bg-zinc-700",
				disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
				className,
			)}
		>
			<span
				className={cn(
					"inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow-sm transition-transform duration-200",
					checked ? "translate-x-[20px]" : "translate-x-[3px]",
				)}
			/>
		</button>
	);
}
