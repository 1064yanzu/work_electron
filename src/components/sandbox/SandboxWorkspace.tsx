/**
 * SandboxWorkspace - 托管模式的沙盒工作区（解耦版）
 */

import { useCallback, useEffect, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { deleteFileSafe, moveFileSafe, revealFileSafe } from "../../lib/api";
import { useAgentStore } from "../../lib/agent/store";
import { useChatStore } from "../../lib/chat/store";
import { EVENTS, events } from "../../lib/events";
import {
	groupFilesByCategory,
	useManagedModeStore,
	type SandboxFile,
} from "../../lib/managedModeStore";
import { ExecutionGraph } from "./ExecutionGraph";
import { ManagedCenterHeader } from "./workspace/ManagedCenterHeader";
import { ManagedFileTreePanel } from "./workspace/ManagedFileTreePanel";
import { ManagedArtifactPreviewPanel } from "./workspace/ManagedArtifactPreviewPanel";
import { useAutoImageArtifactPreview } from "./workspace/useAutoImageArtifactPreview";
import { useSandboxFilesBinding } from "./workspace/useSandboxFilesBinding";

interface SandboxWorkspaceProps {
	onExitManagedMode: () => void;
}

export default function SandboxWorkspace({
	onExitManagedMode,
}: SandboxWorkspaceProps) {
	const { files, selectedFileId, ui, store } = useManagedModeStore();
	const { currentTask, taskHistory, isExecuting } = useAgentStore();

	const { activeSessionId, sessions } = useChatStore();
	const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

	const { sandboxDir, graphSource, isRefreshing, refreshFiles } =
		useSandboxFilesBinding({
			activeSessionId,
			activeSession,
			currentTask,
			taskHistory,
			isExecuting,
			store,
		});

	const fileTree = useMemo(() => groupFilesByCategory(files), [files]);

	const filteredTree = useMemo(() => {
		if (!ui.searchQuery.trim()) return fileTree;
		const query = ui.searchQuery.toLowerCase();
		const filterFiles = (arr: SandboxFile[]) =>
			arr.filter((f) => f.name.toLowerCase().includes(query));
		return {
			docs: filterFiles(fileTree.docs),
			code: filterFiles(fileTree.code),
			images: filterFiles(fileTree.images),
			data: filterFiles(fileTree.data),
			other: filterFiles(fileTree.other),
		};
	}, [fileTree, ui.searchQuery]);

	const selectedFile = useMemo(
		() => files.find((f) => f.id === selectedFileId) || null,
		[files, selectedFileId],
	);

	const categories = [
		{ key: "docs" as const, title: "文档" },
		{ key: "code" as const, title: "代码" },
		{ key: "images" as const, title: "图片" },
		{ key: "data" as const, title: "数据" },
		{ key: "other" as const, title: "其他" },
	];

	const totalFiles = files.filter((f) => f.type === "file").length;
	const headerTitle = ui.centerView === "graph" ? "运行图" : "产物预览";
	const headerMeta =
		ui.centerView === "graph"
			? graphSource
				? `工具 ${graphSource.toolCalls.length} · 产物 ${graphSource.artifacts.length}`
				: `文件 ${totalFiles}`
			: `${totalFiles} 个文件`;

	const openArtifactInPreview = useCallback(
		async (filePath: string) => {
			let fileId = store.selectFileByPath(filePath);
			if (!fileId && sandboxDir) {
				await store.scanSandboxDir(sandboxDir);
				fileId = store.selectFileByPath(filePath);
			}
			store.setCenterView("preview");
			if (fileId) await store.loadFileContent(fileId);
		},
		[sandboxDir, store],
	);

	const { markUserManualSelection, requestAutoPreview } =
		useAutoImageArtifactPreview({
			graphSource,
			sandboxDir,
			isExecuting,
			openArtifactInPreview,
		});

	useEffect(() => {
		return events.on(EVENTS.AGENT_FOCUS_TOOL_CALL, async (payload) => {
			if (!payload?.autoPreview) return;
			const artifactUrl =
				typeof payload?.artifactUrl === "string"
					? payload.artifactUrl.trim()
					: "";
			if (!artifactUrl) return;
			requestAutoPreview(artifactUrl);
		});
	}, [requestAutoPreview]);

	useEffect(() => {
		const handleShortcuts = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const isTyping =
				tag === "input" ||
				tag === "textarea" ||
				tag === "select" ||
				Boolean(target?.isContentEditable);
			if (isTyping) return;

			if (e.altKey && e.key === "1") {
				e.preventDefault();
				store.setCenterView("graph");
				return;
			}
			if (e.altKey && e.key === "2") {
				e.preventDefault();
				store.setCenterView("preview");
			}
		};
		window.addEventListener("keydown", handleShortcuts);
		return () => window.removeEventListener("keydown", handleShortcuts);
	}, [store]);

	const handleSelectFile = useCallback(
		async (id: string, source: "user" | "auto" = "user") => {
			if (source === "user") markUserManualSelection();
			store.selectFile(id);
			await store.loadFileContent(id);
		},
		[markUserManualSelection, store],
	);

	const artifactFiles = useMemo(() => {
		if (!graphSource) return [];
		const urlSet = new Set(
			graphSource.artifacts
				.map((a) => (typeof a.url === "string" ? a.url.trim() : ""))
				.filter(Boolean),
		);
		if (urlSet.size === 0) return [];
		return files.filter((f) => urlSet.has(f.path));
	}, [files, graphSource]);

	const handleCopyArtifactPath = useCallback(async (file: SandboxFile) => {
		await navigator.clipboard.writeText(file.path);
	}, []);

	const handleRevealArtifactFile = useCallback(async (file: SandboxFile) => {
		try {
			await revealFileSafe(file.path);
		} catch (error) {
			console.error("[SandboxWorkspace] reveal file failed:", error);
			window.alert(`打开失败: ${String(error)}`);
		}
	}, []);

	const handleMoveArtifactFile = useCallback(
		async (file: SandboxFile) => {
			const nextPath = window.prompt("请输入新的绝对路径", file.path);
			if (!nextPath?.trim() || nextPath.trim() === file.path) return;
			try {
				await moveFileSafe({
					src: file.path,
					dest: nextPath.trim(),
					create_dirs: true,
				});
				await refreshFiles();
			} catch (error) {
				console.error("[SandboxWorkspace] move file failed:", error);
				window.alert(`移动失败: ${String(error)}`);
			}
		},
		[refreshFiles],
	);

	const handleDeleteArtifactFile = useCallback(
		async (file: SandboxFile) => {
			const confirmed = window.confirm(
				`确定删除文件「${file.name}」吗？此操作不可撤销。`,
			);
			if (!confirmed) return;
			try {
				await deleteFileSafe(file.path);
				await refreshFiles();
			} catch (error) {
				console.error("[SandboxWorkspace] delete file failed:", error);
				window.alert(`删除失败: ${String(error)}`);
			}
		},
		[refreshFiles],
	);

	return (
		<div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
			<ManagedCenterHeader
				centerView={ui.centerView}
				headerTitle={headerTitle}
				headerMeta={headerMeta}
				isRefreshing={isRefreshing}
				onSetCenterView={(view) => store.setCenterView(view)}
				onRefresh={refreshFiles}
				onExit={onExitManagedMode}
			/>

			{ui.centerView === "graph" ? (
				<ExecutionGraph
					source={graphSource}
					onOpenArtifact={async (filePath) => {
						markUserManualSelection();
						await openArtifactInPreview(filePath);
					}}
					filter={ui.graphFilter || "all"}
					onFilterChange={(value) => store.setGraphFilter(value)}
					searchQuery={ui.graphSearch || ""}
					onSearchQueryChange={(value) => store.setGraphSearch(value)}
					pinnedInspector={Boolean(ui.pinnedInspector)}
					onPinnedInspectorChange={(value) => store.setPinnedInspector(value)}
				/>
			) : (
				<PanelGroup direction="horizontal" className="flex-1">
					<Panel defaultSize={25} minSize={15} maxSize={40}>
						<ManagedFileTreePanel
							searchQuery={ui.searchQuery}
							onSearchQueryChange={(query) => store.setSearchQuery(query)}
							totalFiles={totalFiles}
							categories={categories}
							filteredTree={filteredTree}
							expandedFolders={ui.expandedFolders}
							onToggleCategory={(key) => store.toggleFolderExpanded(key)}
							selectedFileId={selectedFileId}
							onSelectFile={(id) => void handleSelectFile(id, "user")}
							onCopyPath={handleCopyArtifactPath}
							onRevealFile={handleRevealArtifactFile}
							onMoveFile={handleMoveArtifactFile}
							onDeleteFile={handleDeleteArtifactFile}
						/>
					</Panel>

					<PanelResizeHandle className="w-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-col-resize" />

					<Panel defaultSize={75} minSize={40}>
						<ManagedArtifactPreviewPanel
							selectedFile={selectedFile}
							artifactFiles={artifactFiles}
							previewMode={ui.previewMode}
							onSetPreviewMode={(mode) => store.setPreviewMode(mode)}
							onLoadContent={async (fileId) => {
								await store.loadFileContent(fileId);
							}}
							onSelectArtifact={(id) => void handleSelectFile(id, "user")}
							onCopyPath={handleCopyArtifactPath}
							onRevealFile={handleRevealArtifactFile}
							onMoveFile={handleMoveArtifactFile}
							onDeleteFile={handleDeleteArtifactFile}
						/>
					</Panel>
				</PanelGroup>
			)}
		</div>
	);
}
