import {
	FolderOpen,
	MessagesSquare,
	BookMarked,
	LayoutGrid,
	SlidersHorizontal,
	Blocks,
	BookOpen,
	Terminal,
	PanelLeftClose,
	PanelLeftOpen,
	Waypoints,
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
import { shortcut } from "../../lib/platform";

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
		{ id: "harness", label: "会话", icon: Waypoints },
		{ id: "sources", label: "资料库", icon: BookMarked },
		{ id: "cards", label: "卡片", icon: LayoutGrid },
		{ id: "wiki", label: "Wiki", icon: BookOpen },
		{ id: "skills", label: "技能", icon: Blocks },
	] as const;

	type NavId = (typeof navItems)[number]["id"];

	const handleNavClick = (id: NavId) => {
		setLeftSidebarView(id);
		// 如果当前停在非 editor 主视图，回到 editor。
		// 例外：会话中枢 + AI Hub 是一对协作视图（左边选会话、中栏看 Web 站点），
		// 从会话中枢发起「发送到 Web」后需要停留在 aihub，不能被拽回 editor。
		if (
			activeMainView !== "editor" &&
			!(id === "harness" && activeMainView === "aihub")
		) {
			setMainView("editor");
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
						leftSidebarView === item.id ||
						(item.id === "sources" && isSourceSubView);

					return (
						<button
							key={item.id}
							type="button"
							onClick={() => handleNavClick(item.id)}
							aria-label={item.label}
							aria-current={isActive ? "page" : undefined}
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
					type="button"
					onClick={() => terminalStore.toggleVisible()}
					aria-label="切换终端"
					aria-pressed={terminalVisible}
					className={[
						"flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-[background-color,color] duration-200",
						terminalVisible
							? "bg-warm-200 text-text-primary"
							: "text-text-muted hover:text-text-primary hover:bg-warm-200/70",
					].join(" ")}
					title={`终端 (${shortcut("`")})`}
				>
					<Terminal className="w-[20px] h-[20px] mb-0.5" strokeWidth={1.5} />
					<span className="text-[9.5px] font-medium leading-tight select-none tracking-wide">
						终端
					</span>
				</button>
				<button
					type="button"
					onClick={onOpenSettings}
					aria-label="打开设置"
					className="flex items-center justify-center w-12 h-12 rounded-2xl text-text-muted hover:text-text-primary hover:bg-warm-200/70 transition-[background-color,color] duration-200"
					title="设置"
				>
					<SlidersHorizontal className="w-[20px] h-[20px]" strokeWidth={1.5} />
				</button>
			</div>
		</div>
	);
}
