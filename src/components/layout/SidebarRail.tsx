import {
	FolderOpen,
	MessagesSquare,
	BookMarked,
	LayoutGrid,
	SlidersHorizontal,
	Blocks,
	BookOpen,
	Palette,
	Terminal,
	PanelLeftClose,
	PanelLeftOpen,
} from "lucide-react";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import {
	layoutStore,
	useLayoutStoreSelector,
} from "../../lib/stores/layoutStore";
import {
	terminalStore,
	useTerminalStoreSelector,
} from "../../lib/stores/terminalStore";

interface SidebarRailProps {
	onOpenSettings: () => void;
}

export function SidebarRail({ onOpenSettings }: SidebarRailProps) {
	const leftSidebarView = useWorkspaceStoreSelector(
		(state) => state.leftSidebarView,
	);
	const activeMainView = useLayoutStoreSelector(
		(state) => state.activeMainView,
	);
	const leftSidebarCollapsed = useLayoutStoreSelector(
		(state) => state.leftSidebarCollapsed,
	);
	const setLeftSidebarView =
		workspaceStore.setLeftSidebarView.bind(workspaceStore);
	const setMainView = workspaceStore.setMainView.bind(workspaceStore);
	const terminalVisible = useTerminalStoreSelector((s) => s.isVisible);

	const navItems = [
		{ id: "files", label: "文件", icon: FolderOpen },
		{ id: "threads", label: "线程", icon: MessagesSquare },
		{ id: "sources", label: "资料库", icon: BookMarked },
		{ id: "cards", label: "卡片", icon: LayoutGrid },
		{ id: "wiki", label: "Wiki", icon: BookOpen },
		{ id: "skills", label: "技能", icon: Blocks },
		{ id: "design", label: "设计", icon: Palette },
	] as const;

	type NavId = (typeof navItems)[number]["id"];

	const handleNavClick = (id: NavId) => {
		if (id === "design") {
			// 进入设计中栏视图并自动折叠左栏（VSCode 式）
			setMainView("design");
			layoutStore.setLeftSidebarView("design");
			layoutStore.setLeftSidebarCollapsed(true);
			return;
		}
		setLeftSidebarView(id);
		// 如果当前停在 design 主视图，回到 editor
		if (activeMainView === "design") {
			setMainView("editor");
			layoutStore.setLeftSidebarCollapsed(false);
		}
	};

	return (
		<div className="w-16 flex-shrink-0 flex flex-col items-center py-3 bg-transparent border-r border-border">
			<button
				type="button"
				onClick={() => layoutStore.toggleLeftSidebar()}
				className="flex items-center justify-center w-12 h-10 rounded-2xl text-text-muted hover:text-text-primary hover:bg-warm-200/70 transition-[background-color,color] duration-200"
				title={leftSidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
			>
				{leftSidebarCollapsed ? (
					<PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
				) : (
					<PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} />
				)}
			</button>

			<div className="flex flex-col items-center gap-1 flex-1 mt-2">
				{navItems.map((item) => {
					const isSourceSubView = [
						"detail",
						"research",
						"websearch",
						"agent",
					].includes(leftSidebarView);
					const isActive =
						item.id === "design"
							? activeMainView === "design"
							: leftSidebarView === item.id ||
								(item.id === "sources" && isSourceSubView);

					return (
						<button
							key={item.id}
							onClick={() => handleNavClick(item.id)}
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
					onClick={() => terminalStore.toggleVisible()}
					className={[
						"flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-[background-color,color] duration-200",
						terminalVisible
							? "bg-warm-200 text-text-primary"
							: "text-text-muted hover:text-text-primary hover:bg-warm-200/70",
					].join(" ")}
					title="终端 (Ctrl+`)"
				>
					<Terminal className="w-[20px] h-[20px] mb-0.5" strokeWidth={1.5} />
					<span className="text-[9.5px] font-medium leading-tight select-none tracking-wide">
						终端
					</span>
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
