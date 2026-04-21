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
		<div
			className={cn(
				"mb-8 pb-6 border-b border-zinc-100 dark:border-zinc-800/80",
				className,
			)}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-start gap-3.5">
					{/* 图标容器 — 有层次感 */}
					<div className="mt-0.5 w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
						<Icon
							className="w-4 h-4 text-zinc-600 dark:text-zinc-300"
							strokeWidth={1.75}
						/>
					</div>
					<div>
						<h2 className="text-[1.05rem] font-serif font-medium leading-[1.25] tracking-[-0.01em] text-zinc-900 dark:text-zinc-50">
							{title}
						</h2>
						<p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400 dark:text-zinc-500 max-w-[460px]">
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
