import {
	Folder,
	MessageSquare,
	Library,
	LayoutTemplate,
	Settings,
	Home,
	Zap,
} from "lucide-react";
import { useWorkspaceStoreSelector, workspaceStore } from "../../lib/workspaceStore";

interface SidebarRailProps {
	onOpenSettings: () => void;
	onNavigateHome: () => void;
}

export function SidebarRail({ onOpenSettings, onNavigateHome }: SidebarRailProps) {
	const leftSidebarView = useWorkspaceStoreSelector(
		(state) => state.leftSidebarView,
	);
	const setLeftSidebarView =
		workspaceStore.setLeftSidebarView.bind(workspaceStore);

	const navItems = [
		{ id: "files", label: "文件", icon: Folder },
		{ id: "threads", label: "线程", icon: MessageSquare },
		{ id: "sources", label: "资料库", icon: Library },
		{ id: "cards", label: "卡片", icon: LayoutTemplate },
		{ id: "skills", label: "技能", icon: Zap },
	];

	return (
		<div className="w-16 flex-shrink-0 flex flex-col items-center py-4 bg-transparent border-r border-black/[0.06] dark:border-white/[0.06]">
			<div className="flex flex-col items-center gap-4 flex-1">
				{navItems.map((item) => {
					// We treat sub-views of materials (e.g. detail, research, websearch, agent) as belonging to 'sources' in the rail
					const isSourceSubView = ["detail", "research", "websearch", "agent"].includes(leftSidebarView);
					const isActive =
						leftSidebarView === item.id || (item.id === "sources" && isSourceSubView);

					return (
						<button
							key={item.id}
							onClick={() => setLeftSidebarView(item.id as any)}
							className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ${
								isActive
									? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground"
									: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
							}`}
							title={item.label}
						>
							<item.icon className="w-5 h-5 mb-0.5" strokeWidth={isActive ? 2.5 : 2} />
							<span className="text-[10px] font-medium leading-tight select-none">
								{item.label}
							</span>
						</button>
					);
				})}
			</div>

			<div className="mt-auto flex flex-col items-center gap-2">
				<button
					onClick={onNavigateHome}
					className="flex items-center justify-center w-12 h-12 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-300"
					title="返回首页"
				>
					<Home className="w-5 h-5" strokeWidth={2} />
				</button>
				<button
					onClick={onOpenSettings}
					className="flex items-center justify-center w-12 h-12 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-300"
					title="设置"
				>
					<Settings className="w-5 h-5" strokeWidth={2} />
				</button>
			</div>
		</div>
	);
}
