/**
 * DesignArtifactView — 生成完成后的预览 + 操作面板。
 *
 * 新结构(对标 Open Design):
 *
 *   ┌─ DesignChromeHeader (h-12)          ⟵ 标题/副文/演示/分享/完成 + 左侧返回
 *   ├─ DesignTabsBar (h-11)               ⟵ [设计文件] sticky + 已打开文件 tabs
 *   ├─ DesignViewerToolbar (h-11)         ⟵ 刷新 / 预览-源代码 / 视口 / 缩放 / 4 个 overlay 触发
 *   ├─ 主体(根据 activeTab + viewerMode 切换)
 *   │    设计文件 tab → DesignFilesPanel inline
 *   │    文件 tab + preview → DesignViewportFrame (iframe)
 *   │    文件 tab + source  → DesignSourceView (Monaco)
 *   │  + 浮动 overlays(Tweaks / Comment / Inspect / Doc)
 *   └─ (ExportDialog 仍走 modal)
 *
 * 演示模式:`presentationMode=true` 时把 Header/Tabs/Toolbar 折叠到几乎不可见,
 * 主体占满,ESC 退出。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { designFinalizeSession, designGetSession } from "../../lib/api/design";
import {
	designStore,
	layoutStore,
	useDesignStoreSelector,
	useWorkspaceStoreSelector,
} from "../../lib/stores";
import {
	designPreviewStore,
	useDesignPreviewStoreSelector,
} from "../../lib/stores/designPreviewStore";
import { convertFileSrc } from "../../lib/tauriCompat";
import { ExportDialog } from "./ExportDialog";
import { DesignChromeHeader } from "./preview/DesignChromeHeader";
import { DesignCommentOverlay } from "./preview/DesignCommentOverlay";
import { DesignFilesPanel } from "./preview/DesignFilesPanel";
import { DesignInspectOverlay } from "./preview/DesignInspectOverlay";
import { DesignSourceView } from "./preview/DesignSourceView";
import { DesignTabsBar } from "./preview/DesignTabsBar";
import { DesignTweaksOverlay } from "./preview/DesignTweaksOverlay";
import { DesignViewerToolbar } from "./preview/DesignViewerToolbar";
import {
	type DesignViewportFrameHandle,
	DesignViewportFrame,
} from "./preview/DesignViewportFrame";
import { DocSidebar } from "./preview/DocSidebar";
import { DESIGN_FILES_TAB } from "./preview/constants";

const MODE_TO_SKILL_ID: Record<string, string> = {
	"web-prototype": "ipo-web-prototype",
	"mobile-mockup": "ipo-mobile-mockup",
	"pitch-deck": "ipo-pitch-deck",
	poster: "ipo-poster",
};

interface DesignArtifactViewProps {
	onRegenerate?: () => void;
	runId?: string | null;
}

export function DesignArtifactView({ runId }: DesignArtifactViewProps) {
	const session = useDesignStoreSelector((s) => s.currentSession);
	const currentThreadPath = useWorkspaceStoreSelector(
		(s) => s.currentThreadPath,
	);
	const currentThreadTitle = useWorkspaceStoreSelector(
		(s) => s.currentThreadTitle,
	);

	const activeTab = useDesignPreviewStoreSelector((s) => s.activeTab);
	const openTabs = useDesignPreviewStoreSelector((s) => s.openTabs);
	const viewerMode = useDesignPreviewStoreSelector((s) => s.viewerMode);
	const viewport = useDesignPreviewStoreSelector((s) => s.viewport);
	const zoom = useDesignPreviewStoreSelector((s) => s.zoom);
	const overlays = useDesignPreviewStoreSelector((s) => s.overlays);
	const presentationMode = useDesignPreviewStoreSelector(
		(s) => s.presentationMode,
	);
	const refreshKey = useDesignPreviewStoreSelector((s) => s.refreshKey);

	const [exportOpen, setExportOpen] = useState(false);
	const [docOpen, setDocOpen] = useState(false);
	const finalizedRef = useRef<Set<string>>(new Set());
	const viewportFrameRef = useRef<DesignViewportFrameHandle | null>(null);

	const docTarget = useMemo<{
		kind: "system" | "skill";
		id: string;
	} | null>(() => {
		if (!session) return null;
		if (session.system_id) {
			return { kind: "system", id: session.system_id };
		}
		if (session.mode) {
			const skillId = MODE_TO_SKILL_ID[session.mode];
			if (skillId) return { kind: "skill", id: skillId };
		}
		return null;
	}, [session]);

	// session 切换时重置预览本地 UI 状态
	useEffect(() => {
		if (!session) return;
		designPreviewStore.reset({
			activeTab: DESIGN_FILES_TAB,
			openTabs: ["index.html"],
		});
	}, [session?.id]);

	// status=done 但未收纳 → finalize
	useEffect(() => {
		if (!session) return;
		if (session.status !== "done") return;
		if (session.output_asset_id) return;
		if (finalizedRef.current.has(session.id)) return;
		finalizedRef.current.add(session.id);
		void (async () => {
			try {
				const updated = await designFinalizeSession({
					session_id: session.id,
					sdk_session_id: session.sdk_session_id ?? undefined,
				});
				designStore.setCurrentSession({ ...session, ...updated });
			} catch (err) {
				console.warn("[DesignArtifactView] finalize failed", err);
			}
		})();
	}, [session]);

	// 演示模式:全局 ESC 退出
	useEffect(() => {
		if (!presentationMode) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				const snap = designPreviewStore.exitPresentation();
				layoutStore.setRightSidebarVisible(snap ?? true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [presentationMode]);

	if (!session) {
		return (
			<div className="h-full w-full flex items-center justify-center text-sm text-text-muted">
				正在加载设计会话…
			</div>
		);
	}

	// 文件预览 file:// URL (仅在 activeTab 是具体文件时计算)
	const previewSrc = (() => {
		if (!session) return "";
		const rel = activeTab === DESIGN_FILES_TAB ? "index.html" : activeTab;
		// 优先用 output_asset.storage_path(已 finalize),且仅当指向 .html
		const storagePath = session.output_asset?.storage_path;
		const isHtmlPath =
			typeof storagePath === "string" && /\.html?$/i.test(storagePath);
		const useStorage =
			isHtmlPath && (rel === "index.html" || rel === activeTab);
		const target =
			useStorage && rel === "index.html"
				? (storagePath as string)
				: `${session.work_dir}/${rel}`;
		return `${convertFileSrc(target)}?_=${refreshKey}`;
	})();

	const isFileTab = activeTab !== DESIGN_FILES_TAB;

	const handleRefresh = async () => {
		designPreviewStore.bumpRefreshKey();
		try {
			const fresh = await designGetSession(session.id);
			designStore.setCurrentSession(fresh);
		} catch (err) {
			console.warn("[DesignArtifactView] refresh failed", err);
		}
	};

	return (
		<div
			className="h-full w-full flex flex-col bg-warm-100 relative"
			data-presentation={presentationMode ? "true" : "false"}
		>
			{!presentationMode ? (
				<>
					<DesignChromeHeader
						session={session}
						currentThreadPath={currentThreadPath ?? undefined}
						currentThreadTitle={currentThreadTitle ?? undefined}
						onAdvancedExport={() => setExportOpen(true)}
						docButton={
							docTarget
								? {
										active: docOpen,
										title:
											docTarget.kind === "system"
												? "查看 DESIGN.md"
												: "查看 SKILL.md",
										onToggle: () => setDocOpen((v) => !v),
									}
								: undefined
						}
					/>
					<DesignTabsBar
						activeTab={activeTab}
						openTabs={openTabs}
						onActivate={(tab) => designPreviewStore.setActiveTab(tab)}
						onClose={(rel) => designPreviewStore.closeTab(rel)}
					/>
					<DesignViewerToolbar
						showFileControls={isFileTab}
						viewerMode={viewerMode}
						viewport={viewport}
						zoom={zoom}
						overlays={overlays}
						onRefresh={() => void handleRefresh()}
						onModeChange={(m) => designPreviewStore.setViewerMode(m)}
						onViewportChange={(v) => designPreviewStore.setViewport(v)}
						onZoomChange={(z) => designPreviewStore.setZoom(z)}
						onToggleOverlay={(k) => designPreviewStore.toggleOverlay(k)}
					/>
				</>
			) : (
				<PresentationHint />
			)}

			<div className="flex-1 min-h-0 relative bg-cream-200/40">
				{activeTab === DESIGN_FILES_TAB ? (
					<DesignFilesPanel
						sessionId={session.id}
						activePath={null}
						onOpenFile={(rel) => designPreviewStore.openTab(rel)}
						inline
					/>
				) : viewerMode === "source" ? (
					<DesignSourceView
						sessionId={session.id}
						relativePath={activeTab}
						editable={overlays.edit}
					/>
				) : previewSrc ? (
					<DesignViewportFrame
						ref={viewportFrameRef}
						src={previewSrc}
						viewport={viewport}
						zoom={zoom}
						refreshKey={refreshKey}
					/>
				) : (
					<div className="h-full flex items-center justify-center text-sm text-text-muted">
						尚未生成 HTML
					</div>
				)}

				{!presentationMode && overlays.tweaks ? (
					<DesignTweaksOverlay
						sessionId={session.id}
						runId={runId ?? null}
						mode={session.mode ?? undefined}
						onClose={() => designPreviewStore.setOverlay("tweaks", false)}
					/>
				) : null}
				{!presentationMode && overlays.comment ? (
					<DesignCommentOverlay
						sessionId={session.id}
						runId={runId ?? null}
						onClose={() => designPreviewStore.setOverlay("comment", false)}
					/>
				) : null}
				{!presentationMode && overlays.inspect && isFileTab ? (
					<DesignInspectOverlay
						frameRef={viewportFrameRef}
						onClose={() => designPreviewStore.setOverlay("inspect", false)}
					/>
				) : null}
				{!presentationMode && docOpen && docTarget ? (
					<DocSidebar
						kind={docTarget.kind}
						id={docTarget.id}
						onClose={() => setDocOpen(false)}
						floating
					/>
				) : null}
			</div>

			{exportOpen ? (
				<ExportDialog
					session={session}
					currentThreadPath={currentThreadPath ?? undefined}
					currentThreadTitle={currentThreadTitle ?? undefined}
					onClose={() => setExportOpen(false)}
				/>
			) : null}
		</div>
	);
}

function PresentationHint() {
	const [visible, setVisible] = useState(true);
	useEffect(() => {
		const t = setTimeout(() => setVisible(false), 2400);
		return () => clearTimeout(t);
	}, []);
	if (!visible) return null;
	return (
		<div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-background/95 border border-border text-[11.5px] text-text-muted shadow-bai-pop pointer-events-none animate-thumbnail-fade-in">
			演示模式 · 按 ESC 退出
		</div>
	);
}
