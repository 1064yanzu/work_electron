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
		<aside className="w-[248px] shrink-0 border-r border-border bg-surface/90 px-4 py-5 backdrop-blur-sm">
			<div className="mb-5 px-1 text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
				设置
			</div>

			<nav className="flex-1 space-y-5 overflow-y-auto pr-1" aria-label="设置导航">
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
