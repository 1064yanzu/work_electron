/**
 * 编辑器区域
 * 包含标签栏、Monaco 编辑器和底部终端 Dock 的垂直布局
 */

import { memo, useCallback, useEffect, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
	sandboxEditorStore,
	useSandboxEditorStoreSelector,
} from "../../../lib/sandboxEditorStore";
import { toast } from "../../ui/Toast";
import { EditorTabs } from "./EditorTabs";
import {
	EmptyEditorState,
	MonacoEditor,
	getMonacoLanguage,
} from "./MonacoEditor";
import { SandboxTerminalDock } from "./SandboxTerminalDock";

interface EditorAreaProps {
	/** 任务 ID */
	taskId: string;
	/** 沙盒目录路径 */
	sandboxDir: string;
	/** dev server 日志 */
	logs: string[];
	/** 清空日志回调 */
	onClearLogs?: () => void;
}

export const EditorArea = memo(function EditorArea({
	taskId,
	sandboxDir,
	logs,
	onClearLogs,
}: EditorAreaProps) {
	const openTabs = useSandboxEditorStoreSelector((s) => s.openTabs);
	const activeTabId = useSandboxEditorStoreSelector((s) => s.activeTabId);

	const activeTab = useMemo(
		() => openTabs.find((t) => t.id === activeTabId) || null,
		[openTabs, activeTabId],
	);

	const handleSelectTab = useCallback((tabId: string) => {
		sandboxEditorStore.setActiveTab(tabId);
	}, []);

	const handleCloseTab = useCallback((tabId: string) => {
		const tab = sandboxEditorStore
			.getState()
			.openTabs.find((t) => t.id === tabId);
		if (tab?.dirty) {
			toast.info(`已关闭 ${tab.name}（未保存的更改已丢弃）`);
		}
		sandboxEditorStore.closeTab(tabId);
	}, []);

	const handleChange = useCallback(
		(value: string | undefined) => {
			if (!activeTabId || value === undefined) return;
			sandboxEditorStore.updateContent(activeTabId, value);
		},
		[activeTabId],
	);

	const handleSave = useCallback(async () => {
		if (!activeTabId) return;
		const success = await sandboxEditorStore.saveTab(activeTabId);
		if (success) {
			const tab = sandboxEditorStore.getActiveTab();
			toast.success(`${tab?.name || "文件"} 已保存`);
		} else {
			toast.error("保存失败");
		}
	}, [activeTabId]);

	// 懒加载文件内容
	useEffect(() => {
		if (activeTab && activeTab.content === undefined) {
			void sandboxEditorStore.loadContent(activeTab.id, activeTab.path);
		}
	}, [activeTab?.id, activeTab?.path, activeTab?.content]);

	const tabsForBar = useMemo(
		() =>
			openTabs.map((t) => ({
				id: t.id,
				name: t.name,
				dirty: t.dirty,
				extension: t.extension,
			})),
		[openTabs],
	);

	const language = activeTab
		? getMonacoLanguage(activeTab.extension)
		: "plaintext";

	return (
		<div className="flex flex-col h-full">
			{/* 标签栏 */}
			<EditorTabs
				tabs={tabsForBar}
				activeTabId={activeTabId}
				onSelect={handleSelectTab}
				onClose={handleCloseTab}
			/>

			{/* 编辑器 + 终端 Dock */}
			<PanelGroup direction="vertical" className="flex-1">
				<Panel defaultSize={70} minSize={30}>
					{activeTab ? (
						activeTab.content !== undefined ? (
							<MonacoEditor
								value={activeTab.content}
								language={language}
								onChange={handleChange}
								onSave={handleSave}
							/>
						) : (
							<div className="flex-1 flex items-center justify-center bg-surface">
								<div className="flex items-center gap-2 text-sm text-text-muted">
									<div className="w-4 h-4 border-2 border-text-light border-t-transparent rounded-full animate-spin" />
									加载中...
								</div>
							</div>
						)
					) : (
						<EmptyEditorState />
					)}
				</Panel>

				<PanelResizeHandle className="h-1 bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 transition-colors cursor-row-resize" />

				<Panel defaultSize={30} minSize={15}>
					<SandboxTerminalDock
						taskId={taskId}
						sandboxDir={sandboxDir}
						logs={logs}
						onClearLogs={onClearLogs}
					/>
				</Panel>
			</PanelGroup>
		</div>
	);
});
