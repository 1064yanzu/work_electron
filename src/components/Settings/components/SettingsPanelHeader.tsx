import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
		<div className={className}>
			<div className="mb-6 border-b border-border pb-4">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h3 className="flex items-center gap-2 text-lg font-serif font-medium text-text-primary">
							<Icon className="h-5 w-5" />
							{title}
						</h3>
						<p className="mt-1 text-sm text-text-secondary">{description}</p>
					</div>
					{actions && <div className="flex items-center gap-2">{actions}</div>}
				</div>
			</div>
		</div>
	);
}
