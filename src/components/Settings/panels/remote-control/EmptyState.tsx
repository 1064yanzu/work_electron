/**
 * EmptyState — 统一空态占位
 * 图标 + 主副文案，比单薄的"暂无数据"更友好，贴合 Claude UI 语气。
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../../lib/utils";

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
}: {
	icon: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-warm-50/40 px-6 py-10 text-center/30",
				className,
			)}
		>
			<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface ring-1 ring-zinc-200/70 dark:ring-zinc-800">
				<Icon className="h-5 w-5 text-text-muted" strokeWidth={1.6} />
			</div>
			<div className="space-y-1">
				<div className="text-sm font-medium text-text-primary">{title}</div>
				{description ? (
					<p className="max-w-sm text-xs leading-relaxed text-text-muted">
						{description}
					</p>
				) : null}
			</div>
			{action}
		</div>
	);
}
