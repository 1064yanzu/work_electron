/**
 * 编程工作区 - 右侧面板容器
 * Tab 切换 "文件变更" / "Git 状态" / "工具活动" / "工作区记忆"
 */
import { Activity, BookText, FileCode, FileSearch, GitBranch, Layers3 } from "lucide-react";
import { useMemo } from "react";
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
	type CenterPanelTab,
} from "../../lib/stores/codingWorkspaceStore";
import { CodingChangesList } from "./CodingChangesList";
import { CodingGitPanel } from "./CodingGitPanel";
import { CodingToolActivityPanel } from "./CodingToolActivityPanel";
import { CodingMemoryPanel } from "./CodingMemoryPanel";
import { CodingContextPanel } from "./CodingContextPanel";
import { CodeViewerPanel } from "./codeViewer/CodeViewerPanel";

export function CodingChangesPanel() {
	const activeTab = useCodingWorkspaceSelector((s) => s.layout.rightPanelTab);
	const selectedFilePath = useCodingWorkspaceSelector((s) => s.selectedFilePath);

	// 为右侧面板"文件" tab 构建 CodeViewerPanel 所需的 tab 对象
	const fileViewerTab = useMemo<CenterPanelTab | null>(() => {
		if (!selectedFilePath) return null;
		const fileName = selectedFilePath.split(/[\\/]/).pop() || selectedFilePath;
		const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "" : "";
		return {
			id: `right-panel-file-${selectedFilePath}`,
			filePath: selectedFilePath,
			fileName,
			language: ext,
		};
	}, [selectedFilePath]);

	return (
		<div className="h-full flex flex-col bg-[#FAFAFA] dark:bg-[#111111]">
			{/* Tab 切换 */}
			<div className="flex items-center border-b border-black/[0.04] dark:border-white/[0.04]">
				<TabButton
					active={activeTab === "changes"}
					onClick={() => codingWorkspaceStore.setRightPanelTab("changes")}
					icon={FileCode}
					label="文件变更"
				/>
				<TabButton
					active={activeTab === "git"}
					onClick={() => codingWorkspaceStore.setRightPanelTab("git")}
					icon={GitBranch}
					label="Git 状态"
				/>
				<TabButton
					active={activeTab === "activity"}
					onClick={() => codingWorkspaceStore.setRightPanelTab("activity")}
					icon={Activity}
					label="工具活动"
				/>
					<TabButton
						active={activeTab === "memory"}
						onClick={() => codingWorkspaceStore.setRightPanelTab("memory")}
						icon={BookText}
						label="记忆"
					/>
					<TabButton
						active={activeTab === "file"}
						onClick={() => codingWorkspaceStore.setRightPanelTab("file")}
						icon={FileSearch}
						label="文件"
					/>
					<TabButton
						active={activeTab === "context"}
						onClick={() => codingWorkspaceStore.setRightPanelTab("context")}
						icon={Layers3}
						label="上下文"
					/>
				</div>

			{/* Tab 内容 */}
			<div className="flex-1 overflow-hidden">
				{activeTab === "changes" ? (
					<CodingChangesList />
				) : activeTab === "git" ? (
					<CodingGitPanel />
					) : activeTab === "activity" ? (
						<CodingToolActivityPanel />
					) : activeTab === "file" ? (
						fileViewerTab ? <CodeViewerPanel tab={fileViewerTab} /> : (
							<div className="flex h-full flex-col items-center justify-center px-6 text-center">
								<FileSearch className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
								<div className="text-sm font-medium text-zinc-500 dark:text-zinc-300">选择一个文件开始浏览</div>
								<div className="mt-2 text-xs text-zinc-400">左侧文件树点击文件后，会在这里展示内容</div>
							</div>
						)
					) : activeTab === "context" ? (
						<CodingContextPanel />
					) : (
						<CodingMemoryPanel />
					)}
			</div>
		</div>
	);
}

function TabButton({
	active,
	onClick,
	icon: Icon,
	label,
}: {
	active: boolean;
	onClick: () => void;
	icon: React.ElementType;
	label: string;
}) {
	return (
		<button
			onClick={onClick}
			className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors relative ${
				active
					? "text-zinc-800 dark:text-zinc-200"
					: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
			}`}
		>
			<Icon className="w-3.5 h-3.5" />
			{label}
			{active && (
				<div className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#D96C46] rounded-full" />
			)}
		</button>
	);
}
