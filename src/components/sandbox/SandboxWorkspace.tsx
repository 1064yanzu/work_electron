/**
 * SandboxWorkspace - 托管模式的沙盒工作区（解耦版）
 */

import { lazy, Suspense, useCallback, useEffect, useMemo } from "react";
import { deleteFileSafe, moveFileSafe, revealFileSafe } from "../../lib/api";
import { useAgentStoreSelector } from "../../lib/agent/store";
import { useChatStoreSelector } from "../../lib/chat/store";
import { workspaceStore } from "../../lib/workspaceStore";
import { getCenterUxPrefs } from "../../lib/config";
import { EVENTS, events } from "../../lib/events";
import {
	managedModeStore,
	useManagedModeStoreSelector,
	type SandboxFile,
} from "../../lib/managedModeStore";
import { sandboxEditorStore } from "../../lib/sandboxEditorStore";
import type { GraphFilter } from "./graph/types";
import { ManagedArtifactPreviewPanel } from "./workspace/ManagedArtifactPreviewPanel";
import { useAutoImageArtifactPreview } from "./workspace/useAutoImageArtifactPreview";
import { useSandboxFilesBinding } from "./workspace/useSandboxFilesBinding";
import { confirmDialog } from "../ui/ConfirmDialog";
import { inputDialog } from "../ui/InputDialog";
import { toast } from "../ui/Toast";
import { ViewTransition } from "../ui/ViewTransition";

const ExecutionGraph = lazy(async () => {
	const mod = await import("./ExecutionGraph");
	return { default: mod.ExecutionGraph };
});

export default function SandboxWorkspace({
	view,
}: {
	/**
	 * 强制渲染某个视图，覆盖 `managedModeStore.ui.centerView`。
	 *
	 * 中栏支持分屏后，「运行图」和「预览」可能被拖到两个不同的分屏里同时显示。
	 * 这时全局的 centerView 只能表达其中一个，两块会渲染成同一个视图。
	 * 由标签自己声明要渲染什么，才能各归各位。不传时保持旧行为（跟随 store）。
	 */
	view?: "graph" | "preview";
} = {}) {
	const files = useManagedModeStoreSelector((state) => state.files);
	const selectedFileId = useManagedModeStoreSelector(
		(state) => state.selectedFileId,
	);
	const ui = useManagedModeStoreSelector((state) => state.ui);
	const currentTask = useAgentStoreSelector((state) => state.currentTask);
	const taskHistory = useAgentStoreSelector((state) => state.taskHistory);
	const isExecuting = useAgentStoreSelector((state) => state.isExecuting);

	const taskId = currentTask?.id;

	// 只订阅原始值：流式期间 sessions 数组每 ~16ms 换引用，
	// 这里不再整体订阅 sessions / activeSession 对象（细粒度派生在 useSandboxFilesBinding 内完成）
	const activeSessionId = useChatStoreSelector(
		(state) => state.activeSessionId,
	);

	const { sandboxDir, sessionTitle, graphSource, isRefreshing, refreshFiles } =
		useSandboxFilesBinding({
			activeSessionId,
			currentTask,
			taskHistory,
			isExecuting,
			store: managedModeStore,
		});

	const selectedFile = useMemo(
		() => files.find((f) => f.id === selectedFileId) || null,
		[files, selectedFileId],
	);

	/** 本实例实际渲染的视图：标签显式指定优先，否则跟随全局状态。 */
	const centerView = view ?? ui.centerView;

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

	// ExecutionGraph 已被 React.memo 包裹：以下回调必须引用稳定，
	// 否则 memo 短路失效（graphSource 引用未变时不应重渲染整图）。
	const handleOpenArtifactFromGraph = useCallback(
		async (filePath: string) => {
			markUserManualSelection();
			await openArtifactInPreview(filePath);
		},
		[markUserManualSelection, openArtifactInPreview],
	);
	const handleGraphFilterChange = useCallback(
		(value: GraphFilter) => managedModeStore.setGraphFilter(value),
		[],
	);
	const handleGraphSearchChange = useCallback(
		(value: string) => managedModeStore.setGraphSearch(value),
		[],
	);
	const handlePinnedInspectorChange = useCallback(
		(value: boolean) => managedModeStore.setPinnedInspector(value),
		[],
	);
	const handleGraphFollowChange = useCallback(
		(value: boolean) => managedModeStore.setGraphFollow(value),
		[],
	);

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

	// 当托管工作区解析出活跃线程的 sandbox 目录时，把它同步到 workspaceStore，
	// 让左侧 FILES 面板（ProjectFilesView）能跟随当前线程而不是停留在"无工作路径"。
	useEffect(() => {
		if (!sandboxDir) return;
		workspaceStore.setCurrentThreadScope(sandboxDir, sessionTitle || null);
	}, [sandboxDir, sessionTitle]);

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

	// Alt+1/2 切换运行图/预览已上移到中间栏标签条（CenterTabBar 注册 Alt+1..9）。
	// 放在这里会随本组件卸载而失效——切到浏览器/Web AI 标签后就按不动了。

	const handleSelectFile = useCallback(
		async (id: string, source: "user" | "auto" = "user") => {
			if (source === "user") markUserManualSelection();
			if (!id) {
				managedModeStore.selectFile(null);
				return;
			}
			managedModeStore.selectFile(id);
			await managedModeStore.loadFileContent(id);
			// 同步打开为可编辑标签页
			const file = managedModeStore.getState().files.find((f) => f.id === id);
			if (file && file.type === "file") {
				let relPath = file.path;
				if (sandboxDir && file.path.startsWith(sandboxDir)) {
					relPath = file.path.slice(sandboxDir.length).replace(/^\//, "");
				}
				sandboxEditorStore.openFile(
					file.id,
					file.path,
					relPath,
					file.name,
					file.extension,
					file.content,
				);
			}
		},
		[markUserManualSelection, sandboxDir],
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

	const previewPanel = (
		<ManagedArtifactPreviewPanel
			selectedFile={selectedFile}
			artifactFiles={artifactFiles}
			taskId={taskId}
			sandboxDir={sandboxDir || undefined}
			previewMode={ui.previewMode}
			terminalDockCollapsed={ui.terminalDockCollapsed ?? true}
			onSetPreviewMode={(mode) => managedModeStore.setPreviewMode(mode)}
			onLoadContent={async (fileId) => {
				await managedModeStore.loadFileContent(fileId);
			}}
			onSelectArtifact={(id) => void handleSelectFile(id, "user")}
			onCopyPath={handleCopyArtifactPath}
			onRevealFile={handleRevealArtifactFile}
			onMoveFile={handleMoveArtifactFile}
			onDeleteFile={handleDeleteArtifactFile}
			onSetTerminalDockCollapsed={(collapsed) =>
				managedModeStore.setTerminalDockCollapsed(collapsed)
			}
			onRefreshFiles={refreshFiles}
			isRefreshingFiles={isRefreshing}
			devLogs={[]}
		/>
	);

	return (
		// 中栏内容头（ManagedCenterHeader）已裁撤：标题与 CenterTabBar 的标签重复，
		// 属于双层 chrome；刷新入口移入预览面板 Tab 栏右端
		<div className="flex flex-col h-full bg-warm-50">
			<ViewTransition
				viewKey={centerView === "graph" ? "graph" : "preview"}
				className="min-h-0 flex-1 flex flex-col"
			>
				{centerView === "graph" ? (
					<Suspense
						fallback={
							<div className="flex-1 flex items-center justify-center bg-warm-50 text-xs text-text-muted">
								正在加载运行图...
							</div>
						}
					>
						<ExecutionGraph
							source={graphSource}
							onOpenArtifact={handleOpenArtifactFromGraph}
							filter={ui.graphFilter || "all"}
							onFilterChange={handleGraphFilterChange}
							searchQuery={ui.graphSearch || ""}
							onSearchQueryChange={handleGraphSearchChange}
							pinnedInspector={Boolean(ui.pinnedInspector)}
							onPinnedInspectorChange={handlePinnedInspectorChange}
							defaultFollow={ui.graphFollow ?? true}
							onFollowChange={handleGraphFollowChange}
							artifactClickBehavior={ui.artifactClickBehavior || "select_only"}
							density={ui.centerDensity || "comfortable"}
						/>
					</Suspense>
				) : (
					<div className="flex-1 min-h-0">{previewPanel}</div>
				)}
			</ViewTransition>
		</div>
	);
}
