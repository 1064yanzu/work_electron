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
				"flex-1 h-full overflow-y-auto bg-background p-8 text-text-primary dark:bg-zinc-950",
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
				"rounded-2xl border border-zinc-200/70 bg-white ring-1 ring-black/[0.03] shadow-[0_2px_8px_rgb(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/[0.02]",
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
				"mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500",
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
				"flex items-center justify-between border-b border-zinc-100 py-4 last:border-0 dark:border-zinc-800",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
					{label}
				</div>
				{description && (
					<div className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">
						{description}
					</div>
				)}
			</div>
			<div className="ml-4 flex items-center gap-3">
				{value && (
					<div className="text-sm text-zinc-500 dark:text-zinc-400">
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
				"focus-ring relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
				checked ? "bg-primary" : "bg-zinc-200 dark:bg-zinc-700",
				disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
				className,
			)}
		>
			<span
				className={cn(
					"inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
					checked ? "translate-x-6" : "translate-x-1",
				)}
			/>
		</button>
	);
}
