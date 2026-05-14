import { Download, FolderOpen, RefreshCw, ExternalLink, Wand2, Sparkles, SlidersHorizontal, Image as ImageIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	designFinalizeSession,
	designGetSession,
	designRevealWorkDir,
	designRunCritique,
} from "../../lib/api/design";
import {
	designStore,
	useDesignStoreSelector,
	useWorkspaceStoreSelector,
} from "../../lib/stores";
import { convertFileSrc } from "../../lib/tauriCompat";
import { BrowserShell } from "../sandbox/preview/BrowserShell";
import { toast } from "../ui/Toast";
import { CritiqueScorecard } from "./CritiqueScorecard";
import { ExportDialog } from "./ExportDialog";
import { ExitDesignButton } from "./ExitDesignButton";
import { MediaGenerationPanel } from "./MediaGenerationPanel";
import { ModeBadge } from "./ModeBadge";
import { TweaksPanel } from "./TweaksPanel";

/**
 * DesignArtifactView — 生成完成后的预览 + 操作面板。
 *
 * 顶部工具栏：
 *   [设计标题 · 方向 · 系统] ········· [重新生成] [刷新] [打开目录] [导出 ▾] [完成 → 写代码]
 *
 * 主体：BrowserShell（src=file://<work_dir>/index.html）。
 */
interface DesignArtifactViewProps {
	onRegenerate?: () => void;
	runId?: string | null;
}

type SidebarTab = "critique" | "tweaks" | "media" | null;

export function DesignArtifactView({ onRegenerate, runId }: DesignArtifactViewProps) {
	const session = useDesignStoreSelector((s) => s.currentSession);
	const currentThreadPath = useWorkspaceStoreSelector(
		(state) => state.currentThreadPath,
	);
	const currentThreadTitle = useWorkspaceStoreSelector(
		(state) => state.currentThreadTitle,
	);
	const [exportOpen, setExportOpen] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	const [sidebarTab, setSidebarTab] = useState<SidebarTab>("critique");
	const [critiqueRunning, setCritiqueRunning] = useState(false);
	const finalizedRef = useRef<Set<string>>(new Set());
	const critiqueRanRef = useRef<Set<string>>(new Set());

	// 主交付物 file:// URL
	const previewUrl = useMemo(() => {
		if (!session) return undefined;
		// 优先用 output_asset.storage_path（已 finalize），否则用 work_dir/index.html
		// convertFileSrc 跨平台处理盘符 + encodeURI，避免手拼 file:// 在 Windows
		// 上漏掉根斜杠或没编码空格的问题。
		const storagePath = session.output_asset?.storage_path;
		const target = storagePath ?? `${session.work_dir}/index.html`;
		return `${convertFileSrc(target)}?_=${refreshKey}`;
	}, [session, refreshKey]);

	// 当 status=done 但还没收纳为 output_asset 时尝试 finalize
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
				designStore.setCurrentSession({
					...session,
					...updated,
				});
			} catch (err) {
				console.warn("[DesignArtifactView] finalize failed", err);
			}
		})();
	}, [session]);

	// 自动跑一次 5 维自检（如果还没跑过）
	useEffect(() => {
		if (!session) return;
		if (session.status !== "done") return;
		if (session.critique_scores) return;
		if (critiqueRanRef.current.has(session.id)) return;
		critiqueRanRef.current.add(session.id);
		void (async () => {
			try {
				setCritiqueRunning(true);
				const gateMode =
					(typeof window !== "undefined" &&
						(localStorage.getItem("design.gateMode") === "1" ||
							localStorage.getItem("design.gateMode") === "true")) ||
					false;
				const model =
					(typeof window !== "undefined" &&
						localStorage.getItem("design.critiqueModel")) ||
					undefined;
				const scores = await designRunCritique({
					session_id: session.id,
					gate_mode: gateMode,
					model: model || undefined,
				});
				designStore.setCurrentSession({
					...session,
					critique_scores: scores,
				});
			} catch (err) {
				console.warn("[DesignArtifactView] critique failed", err);
			} finally {
				setCritiqueRunning(false);
			}
		})();
	}, [session]);

	const handleRunCritique = async () => {
		if (!session) return;
		try {
			setCritiqueRunning(true);
			const gateMode =
				(typeof window !== "undefined" &&
					(localStorage.getItem("design.gateMode") === "1" ||
						localStorage.getItem("design.gateMode") === "true")) ||
				false;
			const model =
				(typeof window !== "undefined" &&
					localStorage.getItem("design.critiqueModel")) ||
				undefined;
			const scores = await designRunCritique({
				session_id: session.id,
				gate_mode: gateMode,
				model: model || undefined,
			});
			designStore.setCurrentSession({
				...session,
				critique_scores: scores,
			});
			toast.success("已重新评分");
		} catch (err) {
			toast.error(`评分失败: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setCritiqueRunning(false);
		}
	};

	if (!session) {
		return (
			<div className="h-full w-full flex items-center justify-center text-sm text-text-muted">
				正在加载设计会话…
			</div>
		);
	}

	const handleRefresh = async () => {
		setRefreshKey((k) => k + 1);
		try {
			const fresh = await designGetSession(session.id);
			designStore.setCurrentSession(fresh);
		} catch (err) {
			console.warn("[DesignArtifactView] refresh failed", err);
		}
	};

	const handleReveal = async () => {
		try {
			await designRevealWorkDir(session.id);
		} catch (err) {
			toast.error(`打开目录失败: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const handleRegenerate = () => {
		if (onRegenerate) onRegenerate();
	};

	return (
		<div className="h-full w-full flex flex-col bg-background">
			<header className="px-4 py-2.5 flex items-center gap-3 border-b border-border bg-bg-surface">
				<div className="flex flex-col min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium text-text-primary truncate">
							{session.title}
						</span>
						<ModeBadge mode={session.mode ?? undefined} />
					</div>
					<div className="text-[11px] text-text-muted flex items-center gap-1.5">
						{session.direction_id ? (
							<span>{session.direction_id}</span>
						) : null}
						{session.system_id ? (
							<>
								<span>·</span>
								<span>{session.system_id}</span>
							</>
						) : null}
						{session.status ? (
							<>
								<span>·</span>
								<span className="capitalize">{session.status}</span>
							</>
						) : null}
					</div>
				</div>

				<div className="flex-1" />

				<button
					type="button"
					onClick={() => void handleRunCritique()}
					disabled={critiqueRunning}
					className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg transition-colors disabled:opacity-50"
					title="重新跑 5 维自检"
				>
					<Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
					{critiqueRunning ? "评分中..." : "评分"}
				</button>
				<button
					type="button"
					onClick={handleRegenerate}
					className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg transition-colors"
					title="重新做答卷生成"
				>
					<Wand2 className="w-3.5 h-3.5" strokeWidth={1.5} />
					重做
				</button>
				<button
					type="button"
					onClick={() => void handleRefresh()}
					className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg transition-colors"
					title="刷新预览"
				>
					<RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
					刷新
				</button>
				<button
					type="button"
					onClick={() => void handleReveal()}
					className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg transition-colors"
					title="在 Finder 打开工作目录"
				>
					<FolderOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
					目录
				</button>
				<button
					type="button"
					onClick={() => setExportOpen(true)}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-primary border border-border bg-bg-surface rounded-lg hover:bg-warm-200/60 transition-colors"
				>
					<Download className="w-3.5 h-3.5" strokeWidth={1.5} />
					导出
				</button>
				<ExitDesignButton
					session={session}
					threadPath={currentThreadPath ?? undefined}
					threadTitle={currentThreadTitle ?? undefined}
				/>
				{previewUrl ? (
					<a
						href={previewUrl}
						target="_blank"
						rel="noreferrer noopener"
						className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg transition-colors"
						title="在新窗口打开"
					>
						<ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
					</a>
				) : null}
			</header>

			<div className="flex-1 min-h-0 flex bg-warm-200/30">
				<div className="flex-1 min-w-0 p-3">
					{previewUrl ? (
						<BrowserShell
							src={previewUrl}
							taskId={`design-${session.id}`}
							title={session.title}
							className="h-full"
						/>
					) : (
						<div className="h-full flex items-center justify-center text-sm text-text-muted">
							尚未生成 HTML
						</div>
					)}
				</div>
				<aside className="w-9 shrink-0 border-l border-border bg-background flex flex-col items-center py-2 gap-1">
					<button
						type="button"
						onClick={() => setSidebarTab(sidebarTab === "critique" ? null : "critique")}
						className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
							sidebarTab === "critique"
								? "bg-primary/10 text-primary"
								: "text-text-muted hover:bg-warm-200/60 hover:text-text-primary"
						}`}
						title="评分"
					>
						<Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
					</button>
					<button
						type="button"
						onClick={() => setSidebarTab(sidebarTab === "tweaks" ? null : "tweaks")}
						className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
							sidebarTab === "tweaks"
								? "bg-primary/10 text-primary"
								: "text-text-muted hover:bg-warm-200/60 hover:text-text-primary"
						}`}
						title="Tweaks"
					>
						<SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
					</button>
					<button
						type="button"
						onClick={() => setSidebarTab(sidebarTab === "media" ? null : "media")}
						className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
							sidebarTab === "media"
								? "bg-primary/10 text-primary"
								: "text-text-muted hover:bg-warm-200/60 hover:text-text-primary"
						}`}
						title="媒体生成"
					>
						<ImageIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
					</button>
				</aside>
				{sidebarTab ? (
					<aside className="w-72 shrink-0 border-l border-border bg-background overflow-y-auto">
						{sidebarTab === "critique" ? (
							session.critique_scores ? (
								<div className="p-3">
									<CritiqueScorecard
										scores={session.critique_scores.scores ?? session.critique_scores}
										total={session.critique_scores.total}
										notes={session.critique_scores.notes}
										fixes={session.critique_scores.fixes}
										passed={session.critique_scores.passed}
										lowestDim={session.critique_scores.lowest_dim}
										regenerateReason={session.critique_scores.regenerate_reason}
										onClose={() => setSidebarTab(null)}
										onRegenerate={onRegenerate}
									/>
								</div>
							) : (
								<div className="p-6 text-center text-xs text-text-muted">
									{critiqueRunning ? "评分中…" : "尚无评分，点击顶部「评分」"}
								</div>
							)
						) : null}
						{sidebarTab === "tweaks" ? (
							<TweaksPanel
								sessionId={session.id}
								runId={runId ?? null}
								mode={session.mode ?? undefined}
								onClose={() => setSidebarTab(null)}
							/>
						) : null}
						{sidebarTab === "media" ? (
							<MediaGenerationPanel sessionId={session.id} />
						) : null}
					</aside>
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
