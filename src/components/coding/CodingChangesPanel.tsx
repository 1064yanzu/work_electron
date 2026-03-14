/**
 * 编程工作区 - 右侧面板容器
 * 2 个精准 Tab：Git 状态 / 活动日志
 */
import { GitBranch, Activity } from "lucide-react";
import { type ElementType } from "react";
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
} from "../../lib/stores/codingWorkspaceStore";
import { CodingGitPanel } from "./CodingGitPanel";
import { CodingActivityLog } from "./CodingActivityLog";

type RightPanelTab = "git" | "activity-log";

interface TabDef {
	id: RightPanelTab;
	icon: ElementType;
	label: string;
	tooltip: string;
}

const TABS: TabDef[] = [
	{ id: "git", icon: GitBranch, label: "Git", tooltip: "Git 状态与变更" },
	{ id: "activity-log", icon: Activity, label: "活动", tooltip: "AI 工具调用历史" },
];

export function CodingChangesPanel() {
	const rawTab = useCodingWorkspaceSelector(
		(s) => s.layout.rightPanelTab,
	);
	// 兼容旧 Tab 值
	const activeTab: RightPanelTab =
		rawTab === "session-changes" || rawTab === "terminal-log"
			? "activity-log"
			: (rawTab as RightPanelTab);

	return (
		<div className="h-full flex flex-col bg-[#FAFAFA] dark:bg-[#111111]">
			{/* Tab 栏 */}
			<div className="flex items-center border-b border-black/[0.06] dark:border-white/[0.06] px-1">
				{TABS.map((tab) => (
					<TabButton
						key={tab.id}
						active={activeTab === tab.id}
						onClick={() => codingWorkspaceStore.setRightPanelTab(tab.id as any)}
						icon={tab.icon}
						label={tab.label}
						tooltip={tab.tooltip}
					/>
				))}
			</div>

			{/* Tab 内容区 */}
			<div className="flex-1 overflow-hidden">
				{activeTab === "git" ? (
					<CodingGitPanel />
				) : (
					<CodingActivityLog />
				)}
			</div>
		</div>
	);
}

/** 顶层 Tab 按钮 */
function TabButton({
	active,
	onClick,
	icon: Icon,
	label,
	tooltip,
}: {
	active: boolean;
	onClick: () => void;
	icon: ElementType;
	label: string;
	tooltip: string;
}) {
	return (
		<button
			onClick={onClick}
			title={tooltip}
			className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
				active
					? "text-zinc-800 dark:text-zinc-200"
					: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
			}`}
		>
			<Icon className="w-3.5 h-3.5" />
			{label}
			{active && (
				<div className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#D96C46] rounded-full" />
			)}
		</button>
	);
}
