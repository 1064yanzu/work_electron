/**
 * SandboxWorkspace - 托管模式的沙盒工作区（解耦版）
 */

import { lazy, Suspense, useCallback, useEffect, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { deleteFileSafe, moveFileSafe, revealFileSafe } from "../../lib/api";
import { useAgentStoreSelector } from "../../lib/agent/store";
import { useChatStoreSelector } from "../../lib/chat/store";
import { getCenterUxPrefs } from "../../lib/config";
import { EVENTS, events } from "../../lib/events";
import {
	groupFilesByCategory,
	managedModeStore,
	useManagedModeStoreSelector,
	type SandboxFile,
} from "../../lib/managedModeStore";
import { ManagedCenterHeader } from "./workspace/ManagedCenterHeader";
import { ManagedFileTreePanel } from "./workspace/ManagedFileTreePanel";
import { ManagedArtifactPreviewPanel } from "./workspace/ManagedArtifactPreviewPanel";
import { useAutoImageArtifactPreview } from "./workspace/useAutoImageArtifactPreview";
import { useSandboxFilesBinding } from "./workspace/useSandboxFilesBinding";
import { confirmDialog } from "../ui/ConfirmDialog";
import { inputDialog } from "../ui/InputDialog";
import { toast } from "../ui/Toast";

const ExecutionGraph = lazy(async () => {
	const mod = await import("./ExecutionGraph");
	return { default: mod.ExecutionGraph };
});

interface SandboxWorkspaceProps {
	onExitManagedMode: () => void;
}

export default function SandboxWorkspace({
	onExitManagedMode,
}: SandboxWorkspaceProps) {
	const files = useManagedModeStoreSelector((state) => state.files);
	const selectedFileId = useManagedModeStoreSelector(
		(state) => state.selectedFileId,
	);
	const ui = useManagedModeStoreSelector((state) => state.ui);
	const currentTask = useAgentStoreSelector((state) => state.currentTask);
	const taskHistory = useAgentStoreSelector((state) => state.taskHistory);
	const isExecuting = useAgentStoreSelector((state) => state.isExecuting);

	const activeSessionId = useChatStoreSelector(
		(state) => state.activeSessionId,
	);
	const sessions = useChatStoreSelector((state) => state.sessions);
	const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

	const { sandboxDir, graphSource, isRefreshing, refreshFiles } =
		useSandboxFilesBinding({
			activeSessionId,
			activeSession,
			currentTask,
			taskHistory,
			isExecuting,
			store: managedModeStore,
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
			let fileId = managedModeStore.selectFileByPath(filePath);
			if (!fileId && sandboxDir) {
				await managedModeStore.scanSandboxDir(sandboxDir);
				fileId = managedModeStore.selectFileByPath(filePath);
			}
			managedModeStore.setCenterView("preview");
			if (fileId) await managedModeStore.loadFileContent(fileId);
		},
		[sandboxDir],
	);

	const { markUserManualSelection, requestAutoPreview } =
		useAutoImageArtifactPreview({
			graphSource,
			sandboxDir,
			isExecuting,
			openArtifactInPreview,
		});

	useEffect(() => {
		let cancelled = false;
		void getCenterUxPrefs().then((prefs) => {
			if (cancelled) return;
			managedModeStore.setCenterView(prefs.defaultView);
			managedModeStore.setGraphFollow(prefs.graphFollow);
			managedModeStore.setArtifactClickBehavior(prefs.artifactClickBehavior);
			managedModeStore.setCenterDensity(prefs.infoDensity);
		});
		return () => {
			cancelled = true;
		};
	}, []);

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
				managedModeStore.setCenterView("graph");
				return;
			}
			if (e.altKey && e.key === "2") {
				e.preventDefault();
				managedModeStore.setCenterView("preview");
			}
		};
		window.addEventListener("keydown", handleShortcuts);
		return () => window.removeEventListener("keydown", handleShortcuts);
	}, []);

	const handleSelectFile = useCallback(
		async (id: string, source: "user" | "auto" = "user") => {
			if (source === "user") markUserManualSelection();
			managedModeStore.selectFile(id);
			await managedModeStore.loadFileContent(id);
		},
		[markUserManualSelection],
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
			toast.error(
				`打开失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, []);

	const handleMoveArtifactFile = useCallback(
		async (file: SandboxFile) => {
			const nextPath = await inputDialog.show({
				title: "移动文件",
				message: "请输入新的绝对路径",
				defaultValue: file.path,
				confirmText: "移动",
				cancelText: "取消",
				validate: (value) => {
					if (!value.trim()) return "目标路径不能为空";
					return null;
				},
			});
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
				toast.error(
					`移动失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[refreshFiles],
	);

	const handleDeleteArtifactFile = useCallback(
		async (file: SandboxFile) => {
			const confirmed = await confirmDialog.danger(
				`确定删除文件「${file.name}」吗？此操作不可撤销。`,
				"删除文件",
			);
			if (!confirmed) return;
			try {
				await deleteFileSafe(file.path);
				await refreshFiles();
				toast.success(`已删除 ${file.name}`);
			} catch (error) {
				console.error("[SandboxWorkspace] delete file failed:", error);
				toast.error(
					`删除失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[refreshFiles],
	);

	const handleRevealSandboxDir = useCallback(async () => {
		if (!sandboxDir) {
			toast.info("当前会话未生成沙盒目录");
			return;
		}
		try {
			await revealFileSafe(sandboxDir);
		} catch (error) {
			console.error("[SandboxWorkspace] reveal sandbox dir failed:", error);
			toast.error(
				`打开目录失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [sandboxDir]);

	const previewPanel = (
		<ManagedArtifactPreviewPanel
			selectedFile={selectedFile}
			artifactFiles={artifactFiles}
			previewMode={ui.previewMode}
			density={ui.centerDensity || "comfortable"}
			onSetPreviewMode={(mode) => managedModeStore.setPreviewMode(mode)}
			onLoadContent={async (fileId) => {
				await managedModeStore.loadFileContent(fileId);
			}}
			onSelectArtifact={(id) => void handleSelectFile(id, "user")}
			onCopyPath={handleCopyArtifactPath}
			onRevealFile={handleRevealArtifactFile}
			onMoveFile={handleMoveArtifactFile}
			onDeleteFile={handleDeleteArtifactFile}
		/>
	);

	return (
		<div className="flex flex-col h-full bg-warm-50">
			<ManagedCenterHeader
				centerView={ui.centerView}
				headerTitle={headerTitle}
				headerMeta={headerMeta}
				density={ui.centerDensity || "comfortable"}
				isRefreshing={isRefreshing}
				onSetCenterView={(view) => managedModeStore.setCenterView(view)}
				onRefresh={refreshFiles}
				onExit={onExitManagedMode}
			/>

			{ui.centerView === "graph" ? (
				<Suspense
					fallback={
						<div className="flex-1 flex items-center justify-center text-sm text-text-muted bg-surface/70/40">
							正在加载运行图...
						</div>
					}
				>
					<ExecutionGraph
						source={graphSource}
						onOpenArtifact={async (filePath) => {
							markUserManualSelection();
							await openArtifactInPreview(filePath);
						}}
						filter={ui.graphFilter || "all"}
						onFilterChange={(value) => managedModeStore.setGraphFilter(value)}
						searchQuery={ui.graphSearch || ""}
						onSearchQueryChange={(value) =>
							managedModeStore.setGraphSearch(value)
						}
						pinnedInspector={Boolean(ui.pinnedInspector)}
						onPinnedInspectorChange={(value) =>
							managedModeStore.setPinnedInspector(value)
						}
						defaultFollow={ui.graphFollow ?? true}
						onFollowChange={(value) => managedModeStore.setGraphFollow(value)}
						artifactClickBehavior={ui.artifactClickBehavior || "select_only"}
						density={ui.centerDensity || "comfortable"}
					/>
				</Suspense>
			) : (
				<PanelGroup direction="horizontal" className="flex-1">
					<Panel defaultSize={25} minSize={15} maxSize={40}>
						<ManagedFileTreePanel
							density={ui.centerDensity || "comfortable"}
							searchQuery={ui.searchQuery}
							onSearchQueryChange={(query) =>
								managedModeStore.setSearchQuery(query)
							}
							totalFiles={totalFiles}
							categories={categories}
							filteredTree={filteredTree}
							expandedFolders={ui.expandedFolders}
							onToggleCategory={(key) =>
								managedModeStore.toggleFolderExpanded(key)
							}
							selectedFileId={selectedFileId}
							onSelectFile={(id) => void handleSelectFile(id, "user")}
							onCopyPath={handleCopyArtifactPath}
							onRevealFile={handleRevealArtifactFile}
							onMoveFile={handleMoveArtifactFile}
							onDeleteFile={handleDeleteArtifactFile}
							sandboxDir={sandboxDir || null}
							onRevealSandboxDir={handleRevealSandboxDir}
						/>
					</Panel>

					<PanelResizeHandle className="w-1 bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 transition-colors cursor-col-resize" />

					<Panel defaultSize={75} minSize={40}>
						{previewPanel}
					</Panel>
				</PanelGroup>
			)}
		</div>
	);
}
