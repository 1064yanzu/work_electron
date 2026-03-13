/**
 * 编程工作区 - 右侧面板容器
 * 4 个精简 Tab：变更（文件变更+Git）/ 活动（工具调用）/ 上下文（记忆+上下文文件）/ 文件
 */
import { Activity, FileCode, FileSearch, Layers3 } from "lucide-react";
import { useMemo, useState, type ElementType } from "react";
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

type RightPanelTab = "changes" | "activity" | "context" | "file";

interface TabDef {
	id: RightPanelTab;
	icon: ElementType;
	label: string;
	tooltip: string;
}

const TABS: TabDef[] = [
	{ id: "changes", icon: FileCode, label: "变更", tooltip: "文件变更与 Git 状态" },
	{ id: "activity", icon: Activity, label: "活动", tooltip: "工具调用日志" },
	{ id: "context", icon: Layers3, label: "上下文", tooltip: "工作区记忆与上下文文件" },
	{ id: "file", icon: FileSearch, label: "文件", tooltip: "文件预览" },
];

export function CodingChangesPanel() {
	const activeTab = useCodingWorkspaceSelector((s) => s.layout.rightPanelTab) as RightPanelTab;
	const selectedFilePath = useCodingWorkspaceSelector((s) => s.selectedFilePath);

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
			{/* Tab 栏 */}
			<div className="flex items-center border-b border-black/[0.06] dark:border-white/[0.06] px-1">
				{TABS.map((tab) => (
					<TabButton
						key={tab.id}
						active={activeTab === tab.id}
						onClick={() => codingWorkspaceStore.setRightPanelTab(tab.id)}
						icon={tab.icon}
						label={tab.label}
						tooltip={tab.tooltip}
					/>
				))}
			</div>

			{/* Tab 内容区 */}
			<div className="flex-1 overflow-hidden">
				{activeTab === "changes" ? (
					<ChangesTabContent />
				) : activeTab === "activity" ? (
					<CodingToolActivityPanel />
				) : activeTab === "context" ? (
					<ContextTabContent />
				) : activeTab === "file" ? (
					fileViewerTab ? (
						<CodeViewerPanel tab={fileViewerTab} />
					) : (
						<EmptyState
							icon={FileSearch}
							title="选择一个文件开始浏览"
							description="左侧文件树点击文件后，会在这里展示内容"
						/>
					)
				) : null}
			</div>
		</div>
	);
}

/** 变更 Tab：文件变更 + Git 状态合并 */
function ChangesTabContent() {
	const [section, setSection] = useState<"files" | "git">("files");

	return (
		<div className="h-full flex flex-col">
			{/* 子 Tab 切换 */}
			<div className="flex items-center gap-1 px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.04]">
				<SubTabButton active={section === "files"} onClick={() => setSection("files")}>
					文件变更
				</SubTabButton>
				<SubTabButton active={section === "git"} onClick={() => setSection("git")}>
					Git 状态
				</SubTabButton>
			</div>
			<div className="flex-1 overflow-hidden">
				{section === "files" ? <CodingChangesList /> : <CodingGitPanel />}
			</div>
		</div>
	);
}

/** 上下文 Tab：上下文文件 + 工作区记忆合并 */
function ContextTabContent() {
	const [section, setSection] = useState<"context" | "memory">("context");

	return (
		<div className="h-full flex flex-col">
			{/* 子 Tab 切换 */}
			<div className="flex items-center gap-1 px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.04]">
				<SubTabButton active={section === "context"} onClick={() => setSection("context")}>
					上下文文件
				</SubTabButton>
				<SubTabButton active={section === "memory"} onClick={() => setSection("memory")}>
					工作区记忆
				</SubTabButton>
			</div>
			<div className="flex-1 overflow-hidden">
				{section === "context" ? <CodingContextPanel /> : <CodingMemoryPanel />}
			</div>
		</div>
	);
}

/** 空状态占位 */
function EmptyState({
	icon: Icon,
	title,
	description,
}: {
	icon: ElementType;
	title: string;
	description: string;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6 text-center">
			<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
				<Icon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
			</div>
			<div className="text-sm font-medium text-zinc-500 dark:text-zinc-300">{title}</div>
			<div className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500 max-w-[200px]">{description}</div>
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

/** 子 Tab 切换按钮（pill 样式） */
function SubTabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
				active
					? "bg-zinc-200/80 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
					: "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
			}`}
		>
			{children}
		</button>
	);
}
