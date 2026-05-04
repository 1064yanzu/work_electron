import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

interface SettingsPanelHeaderProps {
	icon: LucideIcon;
	title: string;
	description: string;
	actions?: ReactNode;
	className?: string;
}

export function SettingsPanelHeader({
	icon: Icon,
	title,
	description,
	actions,
	className,
}: SettingsPanelHeaderProps) {
	return (
		<div className={cn("mb-8 pb-6 border-b border-border/80", className)}>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-start gap-3.5">
					{/* 图标容器 — B.AI 风格暖描边 */}
					<div className="mt-0.5 w-9 h-9 rounded-xl bg-warm-200 border border-border flex items-center justify-center shrink-0">
						<Icon className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
					</div>
					<div>
						<h2 className="text-[1.05rem] font-semibold leading-[1.25] tracking-[-0.01em] text-text-primary dark:text-zinc-50">
							{title}
						</h2>
						<p className="mt-1 text-[12.5px] leading-relaxed text-text-muted max-w-[460px]">
							{description}
						</p>
					</div>
				</div>
				{actions && (
					<div className="flex items-center gap-2 shrink-0 mt-0.5">
						{actions}
					</div>
				)}
			</div>
		</div>
	);
}
