import {
	getSettingsNavItemsByGroup,
	SETTINGS_NAV_GROUPS,
	shouldExpandSettingsGroup,
} from "./settingsNavigation";
import { useSettingsExperience } from "./context/SettingsExperienceContext";
import { SettingsSidebarGroup } from "./components/SettingsSidebarGroup";
import type { SettingsTabId } from "./types";

interface SettingsSidebarProps {
	activeTab: SettingsTabId;
	onTabChange: (id: SettingsTabId) => void;
	onTabPrefetch?: (id: SettingsTabId) => void;
}

export function SettingsSidebar({
	activeTab,
	onTabChange,
	onTabPrefetch,
}: SettingsSidebarProps) {
	const { mode, technicalGroupExpanded, setTechnicalGroupExpanded } =
		useSettingsExperience();

	return (
		<aside className="w-[248px] shrink-0 border-r border-border bg-background px-4 py-6 backdrop-blur-sm transition-colors duration-300">
			<div className="mb-6 px-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-text-muted">
				设置
			</div>

			<nav
				className="flex-1 space-y-5 overflow-y-auto pr-1"
				aria-label="设置导航"
			>
				{SETTINGS_NAV_GROUPS.map((group) => (
					<SettingsSidebarGroup
						key={group.id}
						groupId={group.id}
						label={group.label}
						items={getSettingsNavItemsByGroup(group.id)}
						activeTab={activeTab}
						onTabChange={onTabChange}
						onTabPrefetch={onTabPrefetch}
						expanded={shouldExpandSettingsGroup({
							group: group.id,
							mode,
							activeTab,
							technicalGroupExpanded,
						})}
						onExpandedChange={
							group.id === "technical" ? setTechnicalGroupExpanded : undefined
						}
					/>
				))}
			</nav>
		</aside>
	);
}
