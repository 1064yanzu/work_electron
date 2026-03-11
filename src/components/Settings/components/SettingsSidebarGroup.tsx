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
		<section className="space-y-2">
			<div className="px-1">
				<div className="flex items-center justify-between gap-2">
					<h3
						className={cn(
							"text-[11px] font-semibold uppercase tracking-[0.18em]",
							isTechnical
								? "text-zinc-400 dark:text-zinc-500"
								: "text-zinc-500 dark:text-zinc-400",
						)}
					>
						{label}
					</h3>
					{isTechnical && onExpandedChange && (
						<button
							type="button"
							onClick={() => onExpandedChange(!expanded)}
							aria-expanded={expanded}
							className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
						>
							<ChevronDown
								className={cn(
									"h-4 w-4 transition-transform duration-200",
									expanded ? "rotate-0" : "-rotate-90",
								)}
							/>
						</button>
					)}
				</div>
			</div>

			{expanded && (
				<div className="space-y-1">
					{items.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => onTabChange(item.id)}
							onMouseEnter={() => onTabPrefetch?.(item.id)}
							onFocus={() => onTabPrefetch?.(item.id)}
							aria-current={activeTab === item.id ? "page" : undefined}
							className={cn(
								"relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
								activeTab === item.id
									? "bg-white text-primary shadow-sm ring-1 ring-primary/10 dark:bg-zinc-800"
									: isTechnical
										? "text-zinc-500 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
										: "text-text-secondary hover:bg-white/70 hover:text-text-primary dark:hover:bg-zinc-800/60",
							)}
						>
							{activeTab === item.id && (
								<div className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
							)}
							<item.icon
								className={cn(
									"h-4 w-4 shrink-0",
									activeTab === item.id ? "text-primary" : "",
								)}
							/>
							<div className="min-w-0 flex-1 truncate">{item.label}</div>
						</button>
					))}
				</div>
			)}
		</section>
	);
}
