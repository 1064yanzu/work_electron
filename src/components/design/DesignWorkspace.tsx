import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	designFinalizeSession,
	designListDirections,
	designListSessions,
	designSubmitDiscovery,
	designUpdateSession,
} from "../../lib/api/design";
import { getActiveModel } from "../../lib/api/providers";
import {
	createSdkClient,
	type AgentSdkClient,
	type AgentSdkEventPayload,
} from "../../lib/agent/sdkClient";
import {
	designStore,
	useDesignStoreSelector,
	layoutStore,
} from "../../lib/stores";
import { toast } from "../ui/Toast";
import { DesignArtifactView } from "./DesignArtifactView";
import { DesignEmpty } from "./DesignEmpty";
import { DirectionPicker } from "./DirectionPicker";
import { DiscoveryForm } from "./DiscoveryForm";
import { SystemPicker } from "./SystemPicker";

/**
 * 设计模块中栏 root。状态机：empty → discovery → direction-pick → running → preview
 *
 * 进入 design 视图时，App.tsx 已经触发了左栏折叠；本组件只负责把 stage 切到对应 sub-view。
 */
export function DesignWorkspace() {
	const stage = useDesignStoreSelector((s) => s.stage);
	const draft = useDesignStoreSelector((s) => s.draftAnswers);
	const currentSession = useDesignStoreSelector((s) => s.currentSession);

	const sdkClientRef = useRef<AgentSdkClient | null>(null);
	const [progressText, setProgressText] = useState<string>("");
	const [progressDetail, setProgressDetail] = useState<string>("");
	const [activeRunId, setActiveRunId] = useState<string | null>(null);

	// 进入设计视图时确保有最小数据
	useEffect(() => {
		void (async () => {
			try {
				const [directions, list] = await Promise.all([
					designListDirections(),
					designListSessions({ limit: 50 }),
				]);
				designStore.setDirections(directions);
				designStore.setSessionsList(list);
			} catch (err) {
				console.warn("[DesignWorkspace] init data failed", err);
			}
		})();
	}, []);

	// 卸载时清理 sdk client 监听
	useEffect(() => {
		return () => {
			sdkClientRef.current?.dispose();
			sdkClientRef.current = null;
		};
	}, []);

	const handleCancelDiscovery = useCallback(() => {
		designStore.setStage("empty");
		designStore.setCurrentSession(null);
		designStore.resetDraft();
	}, []);

	const handleAdvanceFromDiscovery = useCallback(() => {
		designStore.setStage("direction-pick");
	}, []);

	const handleBackToDiscovery = useCallback(() => {
		designStore.setStage("discovery");
	}, []);

	const handleSubmitFinal = useCallback(async () => {
		if (!currentSession) return;
		const directionId =
			draft.direction_id ||
			(typeof draft.answers.tone === "string"
				? String(draft.answers.tone)
				: "modern-minimal");

		try {
			designStore.setStarting(true);
			designStore.setStage("running");
			setProgressText("正在拼装 system prompt…");
			setProgressDetail("");

			const activeModel = await getActiveModel().catch(() => null);
			const model = activeModel || "claude-sonnet-4-5";

			const result = await designSubmitDiscovery({
				session_id: currentSession.id,
				answers: draft.answers,
				direction_id: directionId,
				system_id: draft.system_id,
				mode: draft.mode,
				skills: [],
				model,
			});

			setProgressText("启动 Agent SDK…");

			const client = createSdkClient();
			sdkClientRef.current = client;

			let resolvedSdkSessionId: string | undefined;

			await client.startListening(async (payload: AgentSdkEventPayload) => {
				if (!client.isCurrentRun(payload)) return;
				switch (payload.type) {
					case "sdk_message": {
						try {
							const msg = payload.message as
								| {
										type?: string;
										session_id?: string;
										message?: {
											content?: Array<{ type?: string; text?: string }>;
										};
								  }
								| undefined;
							if (msg?.session_id && !resolvedSdkSessionId) {
								resolvedSdkSessionId = msg.session_id;
							}
							if (msg?.type === "assistant" && msg.message?.content) {
								const text = msg.message.content
									.filter((b) => b && b.type === "text")
									.map((b) => b.text || "")
									.join("\n")
									.trim();
								if (text) {
									setProgressDetail(text.slice(-280));
								}
							}
						} catch {
							// ignore
						}
						setProgressText("Agent 正在生成 HTML…");
						break;
					}
					case "stderr":
						// 静默；CopilotSidebar 也不会收到这次 run
						break;
					case "done": {
						try {
							setProgressText("收纳为输出资产…");
							const finalized = await designFinalizeSession({
								session_id: currentSession.id,
								sdk_session_id: resolvedSdkSessionId,
							});
							designStore.setCurrentSession(finalized);
							designStore.setStage("preview");
							toast.success("设计已生成");
							// 顺手刷新会话列表
							const list = await designListSessions({ limit: 50 });
							designStore.setSessionsList(list);
						} catch (err) {
							console.error("[DesignWorkspace] finalize failed", err);
							toast.error(
								`收纳失败: ${err instanceof Error ? err.message : String(err)}`,
							);
							designStore.setStage("preview");
						}
						break;
					}
					case "error": {
						const message = payload.error || "未知错误";
						toast.error(`生成失败: ${message}`);
						try {
							await designUpdateSession({
								session_id: currentSession.id,
								status: "error",
							});
						} catch {
							// silent
						}
						designStore.setStage("preview");
						break;
					}
					default:
						break;
				}
			});

			await client.start(result.launch_payload);
			setActiveRunId(client.getRunId());
		} catch (err) {
			console.error("[DesignWorkspace] submit failed", err);
			toast.error(`提交失败: ${err instanceof Error ? err.message : String(err)}`);
			designStore.setStage("direction-pick");
		} finally {
			designStore.setStarting(false);
		}
	}, [currentSession, draft]);

	const handleRegenerate = useCallback(async () => {
		// 重启对话：基于现有 session 直接进 discovery
		designStore.setStage("discovery");
	}, []);

	const handleAbort = useCallback(async () => {
		try {
			await sdkClientRef.current?.abort();
		} catch (err) {
			console.warn("[DesignWorkspace] abort failed", err);
		}
		designStore.setStage("preview");
	}, []);

	// 关闭设计模式（回到 editor）的快捷出口
	const handleExitDesign = useCallback(() => {
		layoutStore.setMainView("editor");
		layoutStore.setLeftSidebarCollapsed(false);
	}, []);

	if (stage === "empty" || !currentSession) {
		return <DesignEmpty />;
	}

	if (stage === "discovery") {
		return (
			<DiscoveryForm
				onCancel={handleCancelDiscovery}
				onSubmit={handleAdvanceFromDiscovery}
			/>
		);
	}

	if (stage === "direction-pick") {
		const brand = draft.answers.brand;
		if (brand === "brand-spec") {
			return (
				<SystemPicker
					onBack={handleBackToDiscovery}
					onConfirm={() => void handleSubmitFinal()}
				/>
			);
		}
		return (
			<DirectionPicker
				onBack={handleBackToDiscovery}
				onConfirm={() => void handleSubmitFinal()}
			/>
		);
	}

	if (stage === "running") {
		return (
			<div className="h-full w-full flex items-center justify-center bg-background p-12">
				<div className="max-w-xl flex flex-col items-center gap-6 text-center">
					<div className="w-12 h-12 rounded-full bg-warm-200 flex items-center justify-center">
						<Loader2 className="w-6 h-6 text-primary animate-spin" strokeWidth={1.5} />
					</div>
					<div className="flex flex-col gap-1">
						<div className="text-base font-medium text-text-primary">
							{progressText || "正在生成设计稿…"}
						</div>
						<div className="text-xs text-text-muted">
							工作目录：{currentSession.work_dir}
						</div>
					</div>
					{progressDetail ? (
						<div className="w-full max-h-40 overflow-y-auto rounded-lg bg-bg-surface border border-border p-3 text-xs text-text-muted leading-relaxed whitespace-pre-wrap text-left">
							{progressDetail}
						</div>
					) : null}
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => void handleAbort()}
							className="px-4 py-1.5 rounded-full text-xs text-text-muted hover:text-text-primary border border-border bg-bg-surface hover:bg-warm-200/60 transition-colors inline-flex items-center gap-1.5"
						>
							<X className="w-3.5 h-3.5" strokeWidth={1.5} />
							中止
						</button>
						<button
							type="button"
							onClick={handleExitDesign}
							className="text-xs text-text-muted hover:text-text-primary"
						>
							先回去编辑器
						</button>
					</div>
				</div>
			</div>
		);
	}

	// preview
	return <DesignArtifactView onRegenerate={() => void handleRegenerate()} runId={activeRunId} />;
}
