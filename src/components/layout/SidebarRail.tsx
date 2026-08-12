import {
	FolderOpen,
	MessagesSquare,
	Library,
	SlidersHorizontal,
	Blocks,
	Terminal,
	PanelLeftClose,
	PanelLeftOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import {
	getLastKnowledgeTab,
	isKnowledgeSectionView,
} from "../resource/knowledgeSection";
import { shortcut } from "../../lib/platform";
import { Tooltip } from "../ui/Tooltip";

interface SidebarRailProps {
	onOpenSettings: () => void;
}

/**
 * 导航项分两段：
 * - 「工作」= 当下正在做的事（文件 / 对话）
 * - 「积累」= 沉淀下来的东西（知识 / 技能）
 * 中间一条极淡分隔线，让 4 个入口读起来是 2+2 而不是一长串 4。
 *
 * 刻意不在这里的入口：
 * - 「资料库 / 卡片 / Wiki」合并进「知识」，由面板顶部的 tab 条切换（见 knowledgeSection.ts）
 * - 跨入口会话与接力属于中栏的「AI Hub」标签页，不在左栏重复开一个入口
 *   （⌘K →「打开 AI Hub」）
 */
const NAV_SECTIONS = [
	[
		{ id: "files", label: "文件", icon: FolderOpen },
		{ id: "threads", label: "对话", icon: MessagesSquare },
	],
	[
		{ id: "knowledge", label: "知识", icon: Library },
		{ id: "skills", label: "技能", icon: Blocks },
	],
] as const satisfies ReadonlyArray<
	ReadonlyArray<{ id: string; label: string; icon: LucideIcon }>
>;

type NavId = (typeof NAV_SECTIONS)[number][number]["id"];

/** 所有格子共用的尺寸与状态样式，保证 rail 上下完全同一套节奏 */
const CELL_BASE =
	"flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors duration-150";
const CELL_IDLE =
	"text-text-muted hover:bg-warm-200/70 hover:text-text-primary dark:hover:bg-white/[0.06]";
const CELL_ACTIVE = "bg-warm-200 text-text-primary dark:bg-white/[0.09]";

export function SidebarRail({ onOpenSettings }: SidebarRailProps) {
	const leftSidebarView = useWorkspaceStoreSelector(
		(state) => state.leftSidebarView,
	);
	const leftSidebarCollapsed = useLayoutStoreSelector(
		(state) => state.leftSidebarCollapsed,
	);
	const setLeftSidebarView =
		workspaceStore.setLeftSidebarView.bind(workspaceStore);
	const terminalVisible = useTerminalStoreSelector((s) => s.isVisible);

	// 只切左栏视图，**不动中栏标签**。
	// 中栏改成自由标签页后，这条边栏就是 VSCode 的活动栏：它决定左边看什么，
	// 不该替用户决定中间看什么。真正需要把中栏拉回工作区的动作（点开文件、
	// Wiki 在编辑器中打开…）自己会调 centerTabsStore.openSandboxView。
	//
	// 「知识」是个聚合入口：本身不是一个 leftSidebarView 取值，
	// 点它等于回到上次看的那个知识 tab（资料库 / 卡片 / Wiki）。
	const handleNavClick = (id: NavId) => {
		// 折叠状态下点任意导航 = 先展开面板再切视图（VSCode 活动栏行为），
		// 否则视图切了面板还藏着，用户会以为点了没反应
		if (layoutStore.getState().leftSidebarCollapsed) {
			layoutStore.setLeftSidebarCollapsed(false);
		}
		setLeftSidebarView(id === "knowledge" ? getLastKnowledgeTab() : id);
	};

	return (
		<div className="flex w-[52px] flex-shrink-0 flex-col items-center border-r border-border bg-transparent py-2.5">
			<Tooltip
				content={leftSidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
				placement="right"
			>
				<button
					type="button"
					onClick={() => layoutStore.toggleLeftSidebar()}
					className={`${CELL_BASE} ${CELL_IDLE}`}
					aria-label={leftSidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
				>
					{leftSidebarCollapsed ? (
						<PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.5} />
					) : (
						<PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.5} />
					)}
				</button>
			</Tooltip>

			<div className="mt-2 flex flex-1 flex-col items-center">
				{NAV_SECTIONS.map((section, sectionIndex) => (
					<div
						key={section[0].id}
						className="flex flex-col items-center gap-0.5"
					>
						{sectionIndex > 0 && (
							<span aria-hidden="true" className="my-1.5 h-px w-5 bg-border" />
						)}
						{section.map((item) => {
							const isActive =
								item.id === "knowledge"
									? isKnowledgeSectionView(leftSidebarView)
									: leftSidebarView === item.id;
							return (
								<Tooltip key={item.id} content={item.label} placement="right">
									<button
										type="button"
										onClick={() => handleNavClick(item.id)}
										aria-label={item.label}
										aria-current={isActive ? "page" : undefined}
										className={`${CELL_BASE} ${
											isActive ? CELL_ACTIVE : CELL_IDLE
										}`}
									>
										<item.icon
											className="h-[18px] w-[18px]"
											strokeWidth={1.5}
										/>
									</button>
								</Tooltip>
							);
						})}
					</div>
				))}
			</div>

			<div className="mt-auto flex w-full flex-col items-center gap-0.5 border-t border-border pt-2.5">
				<Tooltip content={`终端 (${shortcut("`")})`} placement="right">
					<button
						type="button"
						onClick={() => terminalStore.toggleVisible()}
						aria-label="切换终端"
						aria-pressed={terminalVisible}
						className={`${CELL_BASE} ${
							terminalVisible ? CELL_ACTIVE : CELL_IDLE
						}`}
					>
						<Terminal className="h-[18px] w-[18px]" strokeWidth={1.5} />
					</button>
				</Tooltip>
				<Tooltip content="设置" placement="right">
					<button
						type="button"
						onClick={onOpenSettings}
						aria-label="打开设置"
						className={`${CELL_BASE} ${CELL_IDLE}`}
					>
						<SlidersHorizontal
							className="h-[18px] w-[18px]"
							strokeWidth={1.5}
						/>
					</button>
				</Tooltip>
			</div>
		</div>
	);
}
