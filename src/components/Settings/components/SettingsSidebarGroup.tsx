import { ChevronDown } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { SettingsNavItem } from "../settingsNavigation";
import type { SettingsNavGroup, SettingsTabId } from "../types";

interface SettingsSidebarGroupProps {
	groupId: SettingsNavGroup;
	label: string;
	items: SettingsNavItem[];
	activeTab: SettingsTabId;
	onTabChange: (id: SettingsTabId) => void;
	onTabPrefetch?: (id: SettingsTabId) => void;
	expanded: boolean;
	onExpandedChange?: (expanded: boolean) => void;
}

export function SettingsSidebarGroup({
	groupId,
	label,
	items,
	activeTab,
	onTabChange,
	onTabPrefetch,
	expanded,
	onExpandedChange,
}: SettingsSidebarGroupProps) {
	const isTechnical = groupId === "technical";

	return (
		<section className="space-y-1.5">
			<div className="px-2 mb-1">
				<div className="flex items-center justify-between gap-2">
					<h3
						className={cn(
							"text-[10px] font-semibold uppercase tracking-[0.2em]",
							isTechnical ? "text-text-light" : "text-text-muted",
						)}
					>
						{label}
					</h3>
					{isTechnical && onExpandedChange && (
						<button
							type="button"
							onClick={() => onExpandedChange(!expanded)}
							aria-expanded={expanded}
							className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-lg text-text-light transition-colors hover:bg-surface hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						>
							<ChevronDown
								className={cn(
									"h-3.5 w-3.5 transition-transform duration-200",
									expanded ? "rotate-0" : "-rotate-90",
								)}
							/>
						</button>
					)}
				</div>
			</div>

			{expanded && (
				<div className="space-y-0.5">
					{items.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => onTabChange(item.id)}
							onMouseEnter={() => onTabPrefetch?.(item.id)}
							onFocus={() => onTabPrefetch?.(item.id)}
							aria-current={activeTab === item.id ? "page" : undefined}
							className={cn(
								"relative flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-400/40 focus-visible:ring-offset-1",
								activeTab === item.id
									? "bg-cream-300 dark:bg-cream-700 text-text-primary"
									: isTechnical
										? "text-text-light hover:bg-cream-200/60 dark:hover:bg-cream-700/60 hover:text-text-secondary/70"
										: "text-text-muted hover:bg-cream-200/60 dark:hover:bg-cream-700/60 hover:text-text-primary/80",
							)}
						>
							{activeTab === item.id && (
								<div className="absolute -left-[14px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-cream-900 dark:bg-cream-100" />
							)}
							<item.icon
								className={cn(
									"h-[15px] w-[15px] shrink-0",
									activeTab === item.id
										? "text-text-primary"
										: "text-text-muted",
								)}
								strokeWidth={1.5}
							/>
							<div className="min-w-0 flex-1 truncate">{item.label}</div>
						</button>
					))}
				</div>
			)}
		</section>
	);
}
