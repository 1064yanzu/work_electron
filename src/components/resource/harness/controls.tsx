/**
 * 会话中枢的基础控件与空态。
 */
import { MessageSquare, RefreshCw } from "lucide-react";
import { cn } from "../../../lib/utils";

export function EmptyState({
	scanning,
	onScan,
}: {
	scanning: boolean;
	onScan: () => void;
}) {
	return (
		<div className="text-center py-16 px-6">
			<div className="w-12 h-12 bg-terracotta/8 dark:bg-terracotta/[0.12] rounded-2xl flex items-center justify-center mx-auto mb-3">
				<MessageSquare
					className="w-5 h-5 text-terracotta/70"
					strokeWidth={1.5}
				/>
			</div>
			<p className="text-[12.5px] text-text-secondary font-medium">
				还没有摄取任何会话
			</p>
			<p className="text-[11px] text-text-light mt-2 leading-relaxed">
				点击右上角刷新，从本机 Claude Code / Codex 摄取会话
			</p>
			<button
				type="button"
				onClick={onScan}
				disabled={scanning}
				className="inline-flex items-center gap-1.5 px-3 py-1.5 mt-5 rounded-lg bg-primary text-primary-foreground text-[11.5px] font-medium hover:bg-primary-hover transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
			>
				<RefreshCw className={cn("w-3 h-3", scanning && "animate-spin")} />
				{scanning ? "摄取中…" : "立即摄取"}
			</button>
		</div>
	);
}

export function RowAction({
	icon,
	label,
	onClick,
	active,
	danger,
}: {
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
	active?: boolean;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
			className={cn(
				"flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] transition duration-200",
				danger
					? "text-text-muted hover:text-error hover:bg-error/8"
					: active
						? "text-terracotta bg-terracotta/[0.12]"
						: "text-text-muted hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40",
			)}
		>
			{icon}
			{label}
		</button>
	);
}

export function HarnessChip({
	label,
	count,
	active,
	dimmed,
	disabled,
	title,
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	dimmed?: boolean;
	disabled?: boolean;
	title?: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={cn(
				"flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium shrink-0 transition duration-200",
				active
					? "bg-primary text-primary-foreground"
					: "text-text-muted hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40",
				!active && dimmed && "text-text-light/70",
				disabled && "opacity-45 cursor-not-allowed hover:bg-transparent",
			)}
		>
			<span>{label}</span>
			<span
				className={cn(
					"text-[10px] tabular-nums",
					active ? "text-primary-foreground/70" : "text-text-light/80",
				)}
			>
				{count}
			</span>
		</button>
	);
}

export function IconButton({
	children,
	onClick,
	disabled,
	title,
}: {
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className="p-1.5 rounded-lg text-text-light hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{children}
		</button>
	);
}
