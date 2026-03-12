// CenterPanelTabs - 中间面板 Tab 栏
// 显示打开的文件标签页，支持切换、关闭，以及返回对话视图

import { MessageSquare, X } from "lucide-react";
import { memo, useCallback } from "react";
import { codingWorkspaceStore, useCodingWorkspaceSelector } from "../../lib/stores/codingWorkspaceStore";
import { cn } from "../../lib/utils";

function CenterPanelTabsInner() {
	const tabs = useCodingWorkspaceSelector((s) => s.centerPanelTabs);
	const activeTabId = useCodingWorkspaceSelector((s) => s.activeCenterTabId);
	const centerMode = useCodingWorkspaceSelector((s) => s.layout.centerPanelMode);

	const handleSwitchToChat = useCallback(() => {
		codingWorkspaceStore.setCenterPanelMode("chat");
	}, []);

	const handleClickTab = useCallback((tabId: string) => {
		codingWorkspaceStore.setActiveCenterTab(tabId);
	}, []);

	const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
		e.stopPropagation();
		codingWorkspaceStore.closeCenterTab(tabId);
	}, []);

	// 不显示 Tab 栏的条件：没有打开的文件 tab
	if (tabs.length === 0) return null;

	return (
		<div className="flex items-center border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#111] overflow-x-auto">
			{/* 对话 Tab */}
			<button
				type="button"
				onClick={handleSwitchToChat}
				className={cn(
					"flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium transition-colors flex-shrink-0 relative",
					centerMode === "chat"
						? "text-zinc-800 dark:text-zinc-200"
						: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300",
				)}
			>
				<MessageSquare className="h-3 w-3" />
				对话
				{centerMode === "chat" && (
					<div className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#D96C46] rounded-full" />
				)}
			</button>

			{/* 分隔线 */}
			<div className="h-4 w-px bg-zinc-200/60 dark:bg-zinc-800/60 flex-shrink-0" />

			{/* 文件 Tabs */}
			{tabs.map((tab) => {
				const isActive = centerMode === "codeViewer" && activeTabId === tab.id;
				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => handleClickTab(tab.id)}
						className={cn(
							"group flex items-center gap-1.5 pl-3 pr-1.5 py-2 text-xs font-medium transition-colors flex-shrink-0 relative max-w-[180px]",
							isActive
								? "text-zinc-800 dark:text-zinc-200"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300",
						)}
					>
						<span className="truncate">{tab.fileName}</span>
						{/* 关闭按钮 */}
						<span
							onClick={(e) => handleCloseTab(e, tab.id)}
							className={cn(
								"rounded p-0.5 transition-colors",
								isActive
									? "hover:bg-zinc-200 dark:hover:bg-zinc-700"
									: "opacity-0 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700",
							)}
						>
							<X className="h-2.5 w-2.5" />
						</span>
						{isActive && (
							<div className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#D96C46] rounded-full" />
						)}
					</button>
				);
			})}
		</div>
	);
}

export const CenterPanelTabs = memo(CenterPanelTabsInner);
