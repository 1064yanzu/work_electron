import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	designFinalizeSession,
	designListDirections,
	designListSessions,
	designUpdateSession,
	type DesignLaunchPayload,
} from "../../lib/api/design";
import {
	createSdkClient,
	type AgentSdkClient,
	type AgentSdkEventPayload,
} from "../../lib/agent/sdkClient";
import {
	designStore,
	layoutStore,
	useDesignStoreSelector,
} from "../../lib/stores";
import { toast } from "../ui/Toast";
import { DesignArtifactView } from "./DesignArtifactView";
import { DesignEmpty } from "./DesignEmpty";

/**
 * 设计模块中栏 root。
 *
 * 简化后的状态机：empty → running → preview
 *
 * - 创建项目走 NewProjectPanel（左栏常驻）→ 一次性完成 startSession +
 *   submitDiscovery → 把 launch_payload 写到 `designStore.pendingLaunch`。
 * - 本组件监听 `pendingLaunch`：拿到 payload 就 createSdkClient + start，
 *   启动后清空 pendingLaunch。SDK 报告 done → finalize → preview；
 *   error → preview（保留当前工作目录让用户检查）。
 * - 进入 design 视图时 App.tsx 已经触发了左栏折叠；本组件只负责把 stage
 *   切到对应 sub-view。
 */
export function DesignWorkspace() {
	const stage = useDesignStoreSelector((s) => s.stage);
	const currentSession = useDesignStoreSelector((s) => s.currentSession);
	const pendingLaunch = useDesignStoreSelector((s) => s.pendingLaunch);

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

	const launchSdk = useCallback(
		async (sessionId: string, payload: DesignLaunchPayload) => {
			try {
				designStore.setStarting(true);
				setProgressText("启动 Agent SDK…");
				setProgressDetail("");

				// 复用前一个 SDK 客户端会被同一组件内泄漏；先 dispose
				sdkClientRef.current?.dispose();

				const client = createSdkClient();
				sdkClientRef.current = client;

				let resolvedSdkSessionId: string | undefined;

				await client.startListening(async (ev: AgentSdkEventPayload) => {
					if (!client.isCurrentRun(ev)) return;
					switch (ev.type) {
						case "sdk_message": {
							try {
								const msg = ev.message as
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
									session_id: sessionId,
									sdk_session_id: resolvedSdkSessionId,
								});
								designStore.setCurrentSession(finalized);
								designStore.setStage("preview");
								toast.success("设计已生成");
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
							const message = ev.error || "未知错误";
							toast.error(`生成失败: ${message}`);
							try {
								await designUpdateSession({
									session_id: sessionId,
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

				await client.start(payload);
				setActiveRunId(client.getRunId());
			} catch (err) {
				console.error("[DesignWorkspace] launch failed", err);
				toast.error(
					`启动失败: ${err instanceof Error ? err.message : String(err)}`,
				);
				designStore.setStage("preview");
			} finally {
				designStore.setStarting(false);
			}
		},
		[],
	);

	// 监听 pendingLaunch：来一发就消费一发，确保只启动一次
	useEffect(() => {
		if (!pendingLaunch) return;
		const { sessionId, payload } = pendingLaunch;
		designStore.clearPendingLaunch();
		void launchSdk(sessionId, payload);
	}, [pendingLaunch, launchSdk]);

	const handleRegenerate = useCallback(() => {
		// 重启对话：清掉 current 让用户在 NewProjectPanel 重新提交
		designStore.setCurrentSession(null);
		designStore.setStage("empty");
		setProgressText("");
		setProgressDetail("");
		setActiveRunId(null);
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

	if (stage === "running") {
		return (
			<div className="h-full w-full flex items-center justify-center bg-background p-12">
				<div className="max-w-xl flex flex-col items-center gap-6 text-center">
					<div className="w-12 h-12 rounded-full bg-warm-200 flex items-center justify-center">
						<Loader2
							className="w-6 h-6 text-primary animate-spin"
							strokeWidth={1.5}
						/>
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
	return (
		<DesignArtifactView
			onRegenerate={() => handleRegenerate()}
			runId={activeRunId}
		/>
	);
}
