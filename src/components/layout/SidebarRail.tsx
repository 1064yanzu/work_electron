import {
	FolderOpen,
	MessagesSquare,
	BookMarked,
	LayoutGrid,
	SlidersHorizontal,
	Home,
	Blocks,
	BookOpen,
} from "lucide-react";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";

interface SidebarRailProps {
	onOpenSettings: () => void;
	onNavigateHome: () => void;
}

export function SidebarRail({
	onOpenSettings,
	onNavigateHome,
}: SidebarRailProps) {
	const leftSidebarView = useWorkspaceStoreSelector(
		(state) => state.leftSidebarView,
	);
	const setLeftSidebarView =
		workspaceStore.setLeftSidebarView.bind(workspaceStore);

	const navItems = [
		{ id: "files", label: "文件", icon: FolderOpen },
		{ id: "threads", label: "线程", icon: MessagesSquare },
		{ id: "sources", label: "资料库", icon: BookMarked },
		{ id: "cards", label: "卡片", icon: LayoutGrid },
		{ id: "wiki", label: "Wiki", icon: BookOpen },
		{ id: "skills", label: "技能", icon: Blocks },
	];

	return (
		<div className="w-16 flex-shrink-0 flex flex-col items-center py-4 bg-transparent border-r border-border">
			<div className="flex flex-col items-center gap-1 flex-1">
				{navItems.map((item) => {
					const isSourceSubView = [
						"detail",
						"research",
						"websearch",
						"agent",
					].includes(leftSidebarView);
					const isActive =
						leftSidebarView === item.id ||
						(item.id === "sources" && isSourceSubView);

					return (
						<button
							key={item.id}
							onClick={() =>
								setLeftSidebarView(
									item.id as Parameters<typeof setLeftSidebarView>[0],
								)
							}
							className={[
								"flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-[background-color,color] duration-200",
								isActive
									? "bg-warm-200 text-text-primary"
									: "text-text-muted hover:text-text-primary hover:bg-warm-200/70",
							].join(" ")}
							title={item.label}
						>
							<item.icon
								className="w-[20px] h-[20px] mb-0.5"
								strokeWidth={1.5}
							/>
							<span className="text-[9.5px] font-medium leading-tight select-none tracking-wide">
								{item.label}
							</span>
						</button>
					);
				})}
			</div>

			<div className="mt-auto flex flex-col items-center gap-1 pt-4 border-t border-border w-full">
				<button
					onClick={onNavigateHome}
					className="flex items-center justify-center w-12 h-12 rounded-2xl text-text-muted hover:text-text-primary hover:bg-warm-200/70 transition-[background-color,color] duration-200"
					title="返回首页"
				>
					<Home className="w-[20px] h-[20px]" strokeWidth={1.5} />
				</button>
				<button
					onClick={onOpenSettings}
					className="flex items-center justify-center w-12 h-12 rounded-2xl text-text-muted hover:text-text-primary hover:bg-warm-200/70 transition-[background-color,color] duration-200"
					title="设置"
				>
					<SlidersHorizontal className="w-[20px] h-[20px]" strokeWidth={1.5} />
				</button>
			</div>
		</div>
	);
}
