/**
 * CodeWorkspace - 三栏 IDE 布局主组件
 * 左侧：文件树侧边栏 | 右侧：编辑器标签 + Monaco 编辑器 + 终端 Dock
 */

import { useCallback, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { sandboxEditorStore } from "../../../lib/sandboxEditorStore";
import { EditorArea } from "./EditorArea";
import { FileTreeSidebar } from "./FileTreeSidebar";

interface CodeWorkspaceProps {
	/** 任务 ID */
	taskId: string;
	/** 沙盒目录路径 */
	sandboxDir: string;
	/** 沙盒文件列表（从 managedModeStore 传入） */
	files: SandboxFile[];
	/** 当前选中的文件 ID */
	selectedFileId: string | null;
	/** 选择文件回调 */
	onSelectFile: (id: string) => void;
	/** dev server 日志 */
	logs: string[];
	/** 清空日志回调 */
	onClearLogs?: () => void;
}

export function CodeWorkspace({
	taskId,
	sandboxDir,
	files,
	selectedFileId,
	onSelectFile,
	logs,
	onClearLogs,
}: CodeWorkspaceProps) {
	const [treeSearch, setTreeSearch] = useState("");

	// 从文件列表中筛选出文件类型（排除文件夹）
	const fileOnly = useMemo(
		() => files.filter((f) => f.type === "file"),
		[files],
	);

	// 当文件被选中时，在编辑器中打开
	const handleSelectFile = useCallback(
		(file: SandboxFile) => {
			onSelectFile(file.id);

			// 计算相对路径
			let relPath = file.path;
			if (sandboxDir && file.path.startsWith(sandboxDir)) {
				relPath = file.path.slice(sandboxDir.length).replace(/^\//, "");
			}

			// 打开到编辑器
			sandboxEditorStore.openFile(
				file.id,
				file.path,
				relPath,
				file.name,
				file.extension,
				file.content,
			);
		},
		[onSelectFile, sandboxDir],
	);

	return (
		<PanelGroup direction="horizontal" className="flex-1 h-full">
			{/* 左侧文件树 */}
			<Panel defaultSize={22} minSize={15} maxSize={35}>
				<FileTreeSidebar
					files={fileOnly}
					selectedFileId={selectedFileId}
					searchQuery={treeSearch}
					onSearchQueryChange={setTreeSearch}
					onSelectFile={handleSelectFile}
					totalFiles={fileOnly.length}
				/>
			</Panel>

			<PanelResizeHandle className="w-1 bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 transition-colors cursor-col-resize" />

			{/* 右侧编辑器 + 终端 */}
			<Panel defaultSize={78} minSize={40}>
				<EditorArea
					taskId={taskId}
					sandboxDir={sandboxDir}
					logs={logs}
					onClearLogs={onClearLogs}
				/>
			</Panel>
		</PanelGroup>
	);
}
