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
							isTechnical
								? "text-[#b0aea5] dark:text-[#4d4c48]"
								: "text-[#87867f] dark:text-[#5e5d59]",
						)}
					>
						{label}
					</h3>
					{isTechnical && onExpandedChange && (
						<button
							type="button"
							onClick={() => onExpandedChange(!expanded)}
							aria-expanded={expanded}
							className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-lg text-[#b0aea5] transition-colors hover:bg-[#faf9f5] hover:text-[#5e5d59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-[#30302e] dark:hover:text-[#b0aea5]"
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
								"relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
								activeTab === item.id
									? "bg-[#faf9f5] text-[#141413] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-[#30302e] dark:text-[#faf9f5]"
									: isTechnical
										? "text-[#b0aea5] hover:bg-[#faf9f5]/80 hover:text-[#5e5d59] dark:text-[#5e5d59] dark:hover:bg-[#30302e]/70 dark:hover:text-[#b0aea5]"
										: "text-[#87867f] hover:bg-[#faf9f5]/80 hover:text-[#141413] dark:text-[#87867f] dark:hover:bg-[#30302e]/60 dark:hover:text-[#faf9f5]",
							)}
						>
							{activeTab === item.id && (
								<div className="absolute -left-[14px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#c96442]" />
							)}
							<item.icon
								className={cn(
									"h-[15px] w-[15px] shrink-0",
									activeTab === item.id
										? "text-[#c96442]"
										: "text-[#b0aea5] dark:text-[#5e5d59]",
								)}
								strokeWidth={activeTab === item.id ? 2 : 1.75}
							/>
							<div className="min-w-0 flex-1 truncate">{item.label}</div>
						</button>
					))}
				</div>
			)}
		</section>
	);
}
