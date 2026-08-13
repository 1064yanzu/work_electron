/**
 * EmptyState — 远控面板空态薄壳
 * 复用 ui/EmptyState 的布局与入场动效，仅补远控面板的虚线卡片容器样式。
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../../lib/utils";
import { EmptyState as UiEmptyState } from "../../../ui/EmptyState";

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
				"rounded-2xl border border-dashed border-border/80 bg-warm-50/40 px-6",
				className,
			)}
		>
			<UiEmptyState
				size="sm"
				icon={<Icon className="h-5 w-5" strokeWidth={1.6} />}
				title={title}
				description={description}
				action={action}
			/>
		</div>
	);
}
