import type * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { useMascot } from "../../lib/mascotStore";
import { Mascot } from "./Mascot";

export interface MascotDoneProps {
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
	variant?: "card" | "inline";
	fallback?: React.ReactNode;
}

/**
 * MascotDone — 任务完成态
 *
 * card 变体用于 DocCreationProposal / 大任务结束面板
 * inline 变体用于 toast / 内联反馈
 */
export function MascotDone({
	title,
	description,
	action,
	className,
	variant = "card",
	fallback,
}: MascotDoneProps) {
	const { enabled } = useMascot();
	if (!enabled) return <>{fallback}</>;

	if (variant === "inline") {
		return (
			<div className={cn("flex items-center gap-2.5", className)}>
				<Mascot slot="emotion-happy" size="sm" />
				<span className="text-sm font-medium text-text-primary">{title}</span>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-2xl bg-surface/70 ring-1 ring-zinc-900/5 dark:ring-zinc-100/10 shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-5 animate-fade-in",
				className,
			)}
		>
			<div className="flex items-center gap-4">
				<Mascot slot="state-done" size="lg" />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<Check className="w-4 h-4 text-success" strokeWidth={2.5} />
						<p className="text-sm font-semibold text-text-primary tracking-tight">
							{title}
						</p>
					</div>
					{description && (
						<p className="text-xs text-text-light mt-1 leading-relaxed">
							{description}
						</p>
					)}
					{action && <div className="mt-3">{action}</div>}
				</div>
			</div>
		</div>
	);
}
