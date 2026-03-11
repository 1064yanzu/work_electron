import { SETTINGS_MENU } from "./constants";

interface SettingsSidebarProps {
	activeTab: string;
	onTabChange: (id: string) => void;
	onTabPrefetch?: (id: string) => void;
}

export function SettingsSidebar({
	activeTab,
	onTabChange,
	onTabPrefetch,
}: SettingsSidebarProps) {
	return (
		<aside className="w-52 bg-surface border-r border-border flex flex-col py-5 shrink-0">
			<div className="px-4 mb-5">
				<div className="text-xs font-semibold text-text-muted uppercase tracking-wider">
					设置
				</div>
			</div>
			<nav className="flex-1 space-y-1 px-3" aria-label="设置导航">
				{SETTINGS_MENU.map((item) => (
					<button
						key={item.id}
						onClick={() => onTabChange(item.id)}
						onMouseEnter={() => onTabPrefetch?.(item.id)}
						onFocus={() => onTabPrefetch?.(item.id)}
						aria-current={activeTab === item.id ? "page" : undefined}
						className={`
							w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl 
							cursor-pointer transition-colors duration-200 relative
							focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1
							${
								activeTab === item.id
									? "bg-white dark:bg-zinc-800 text-primary shadow-sm ring-1 ring-primary/10"
									: "text-text-secondary hover:bg-white/70 dark:hover:bg-zinc-800/60 hover:text-text-primary"
							}
						`}
					>
						{/* 激活指示器 - 贴紧容器左边缘 */}
						{activeTab === item.id && (
							<div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
						)}
						<item.icon
							className={`w-4 h-4 shrink-0 ${activeTab === item.id ? "text-primary" : ""}`}
						/>
						{item.label}
					</button>
				))}
			</nav>
		</aside>
	);
}
