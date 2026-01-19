import { SETTINGS_MENU } from "./constants";

interface SettingsSidebarProps {
	activeTab: string;
	onTabChange: (id: string) => void;
}

export function SettingsSidebar({
	activeTab,
	onTabChange,
}: SettingsSidebarProps) {
	return (
		<aside className="w-48 bg-surface border-r border-border flex flex-col py-4 shrink-0">
			<div className="px-4 mb-4">
				<div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
					设置
				</div>
			</div>
			<nav className="flex-1 space-y-0.5 px-2">
				{SETTINGS_MENU.map((item) => (
					<button
						key={item.id}
						onClick={() => onTabChange(item.id)}
						className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
							activeTab === item.id
								? "bg-white text-primary shadow-sm"
								: "text-text-secondary hover:bg-white/50 hover:text-text-primary"
						}`}
					>
						<item.icon className="w-4 h-4" />
						{item.label}
					</button>
				))}
			</nav>
		</aside>
	);
}
