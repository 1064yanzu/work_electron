import { Loader2, Sparkles, X } from "lucide-react";
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
	appendCopilotMirror,
	beginCopilotMirror,
	cancelCopilotMirror,
	completeCopilotMirror,
	failCopilotMirror,
	hasCopilotMirror,
	switchToDesignChat,
} from "../../lib/design/copilotMirror";
import { chatStore } from "../../lib/chat/store";
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
	const draftLaunch = useDesignStoreSelector((s) => s.draftLaunch);

	const sdkClientRef = useRef<AgentSdkClient | null>(null);
	const prevChatSessionIdRef = useRef<string | null>(null);
	const [progressText, setProgressText] = useState<string>("");
	const [progressDetail, setProgressDetail] = useState<string>("");
	const [activeRunId, setActiveRunId] = useState<string | null>(null);

	// 进入 design 视图时记录原 chat session id；卸载时恢复（让用户回到 Sandbox 模式
	// 还能看到原来的 Copilot 会话流）。如果 design 流程中创建了新的 chat session，
	// 那条会被 chatStore.setSessionDesignId 标记，下次再进 design 自动切回它。
	useEffect(() => {
		prevChatSessionIdRef.current = chatStore.getState().activeSessionId;
		return () => {
			const prev = prevChatSessionIdRef.current;
			if (prev && chatStore.getState().activeSessionId !== prev) {
				chatStore.setActiveSession(prev);
			}
		};
	}, []);

	// currentSession 变化时把右栏 chat 切到对应绑定的 chat session；
	// 第一次进入（还没绑）则不动，等首次 beginCopilotMirror 再 create + 绑定。
	useEffect(() => {
		if (!currentSession) return;
		switchToDesignChat(currentSession.id);
	}, [currentSession?.id]);

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
			if (hasCopilotMirror()) {
				cancelCopilotMirror("");
			}
		};
	}, []);

	const launchSdk = useCallback(
		async (sessionId: string, payload: DesignLaunchPayload) => {
			// 多条 assistant message 的累积：按 message.id 去重 + 维持顺序
			// （SDK 在不同回合可能发送多条独立 message，旧版直接 `accumulatedText = text`
			//  会让后到的 message 覆盖前面所有过程，用户最后只看到一条总结）。
			const assistantTexts = new Map<string, string>();
			const assistantOrder: string[] = [];
			let accumulatedText = "";
			const updateAssistantText = (id: string, text: string) => {
				if (!assistantTexts.has(id)) assistantOrder.push(id);
				assistantTexts.set(id, text);
				accumulatedText = assistantOrder
					.map((mid) => assistantTexts.get(mid) ?? "")
					.filter(Boolean)
					.join("\n\n");
			};
			try {
				designStore.setStarting(true);
				setProgressText("启动 Agent SDK…");
				setProgressDetail("");

				// 复用前一个 SDK 客户端会被同一组件内泄漏；先 dispose
				sdkClientRef.current?.dispose();

				const client = createSdkClient();
				sdkClientRef.current = client;

				// 兜底：万一 caller 没在 stage 切换前调 beginCopilotMirror（例如
				// 外部直接 setPendingLaunch 触发本组件），这里补一次。正常流程
				// 由 handleStartFromDraft / useCopilotMessage 的 design 拦截在
				// consumeDraftLaunch 之前就已经做过了，此处会因 mirrorState 已存在
				// 被覆盖——视觉上看不出差异。
				if (!hasCopilotMirror()) {
					const designSession = designStore.getState().currentSession;
					// 不要用 payload.prompt（那是后端模板「请按上述发现答卷…」），
					// 用 design session 标题作为右栏的用户意图占位。
					beginCopilotMirror(
						designSession?.title || "开始生成设计稿",
						sessionId,
						designSession?.title ?? undefined,
					);
				}

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
												id?: string;
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
										const id =
											msg.message.id ?? `auto-${assistantOrder.length}`;
										updateAssistantText(id, text);
										setProgressDetail(text.slice(-280));
										appendCopilotMirror(accumulatedText);
									}
								}
							} catch {
								// ignore
							}
							setProgressText("Agent 正在生成 HTML…");
							break;
						}
						case "stderr":
							// 静默
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
								completeCopilotMirror(accumulatedText);
								toast.success("设计已生成");
								const list = await designListSessions({ limit: 50 });
								designStore.setSessionsList(list);
							} catch (err) {
								console.error("[DesignWorkspace] finalize failed", err);
								const message =
									err instanceof Error ? err.message : String(err);
								failCopilotMirror(message, accumulatedText);
								toast.error(`收纳失败: ${message}`);
								designStore.setStage("preview");
							}
							break;
						}
						case "error": {
							const message = ev.error || "未知错误";
							failCopilotMirror(message, accumulatedText);
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
				const message = err instanceof Error ? err.message : String(err);
				failCopilotMirror(message, accumulatedText);
				toast.error(`启动失败: ${message}`);
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
		if (hasCopilotMirror()) {
			cancelCopilotMirror("");
		}
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
		cancelCopilotMirror(progressDetail);
		designStore.setStage("preview");
	}, [progressDetail]);

	// 关闭设计模式（回到 editor）的快捷出口
	const handleExitDesign = useCallback(() => {
		layoutStore.setMainView("editor");
		layoutStore.setLeftSidebarCollapsed(false);
	}, []);

	const handleStartFromDraft = useCallback(() => {
		// 用户点中栏「开始生成」：直接用 draftLaunch.payload（初始 prompt）启动。
		// 关键时序：必须先 beginCopilotMirror 把 user 消息写进右栏 chatStore，
		// 再 consumeDraftLaunch + setStage("running") 让 launchSdk useEffect 跑。
		// 如果反过来，pendingLaunch 的 useEffect 异步链可能比镜像更快推进，
		// 用户就会看到中栏已 running 但右栏还是空欢迎屏（复发症）。
		const state = designStore.getState();
		const draft = state.draftLaunch;
		const designSession = state.currentSession;
		const userText = draft?.payload.prompt || draft?.initialPrompt || "";
		if (!designSession) return;
		beginCopilotMirror(userText, designSession.id, designSession.title);
		designStore.consumeDraftLaunch();
		designStore.setStage("running");
	}, []);

	const handleCancelDraft = useCallback(() => {
		designStore.clearDraftLaunch();
		designStore.setCurrentSession(null);
		designStore.setStage("empty");
	}, []);

	if (stage === "empty" || !currentSession) {
		return <DesignEmpty />;
	}

	if (stage === "draft") {
		const hint = draftLaunch?.initialPrompt?.trim() ?? "";
		return (
			<div className="h-full w-full flex items-center justify-center bg-background p-12">
				<div className="max-w-xl flex flex-col items-center gap-6 text-center">
					<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D96C46]/20 to-[#D96C46]/5 border border-[#D96C46]/15 text-[#D96C46] flex items-center justify-center shadow-sm">
						<Sparkles className="w-5 h-5" strokeWidth={1.6} />
					</div>
					<div className="flex flex-col gap-2">
						<div className="text-base font-medium text-text-primary">
							简介已准备好
						</div>
						<div className="text-[13px] text-text-muted leading-relaxed max-w-md">
							在右侧 AI 助手里继续描述细节，按发送即可启动 Agent。<br />
							也可以直接用现在的简介开始。
						</div>
					</div>
					{hint ? (
						<div className="w-full rounded-xl border border-cream-200 dark:border-cream-700/40 bg-bg-surface px-4 py-3 text-[12.5px] text-text-secondary leading-relaxed text-left whitespace-pre-wrap">
							{hint}
						</div>
					) : null}
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={handleStartFromDraft}
							className="px-4 py-2 rounded-full text-xs font-medium text-white bg-[#D96C46] hover:bg-[#C45B36] shadow-sm transition-colors inline-flex items-center gap-1.5"
						>
							<Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
							用当前简介开始
						</button>
						<button
							type="button"
							onClick={handleCancelDraft}
							className="text-xs text-text-muted hover:text-text-primary"
						>
							返回修改
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (stage === "running") {
		return (
			<div className="h-full w-full flex flex-col bg-background">
				<div className="px-4 py-2 flex items-center gap-2.5 border-b border-border bg-bg-surface/80 backdrop-blur-sm">
					<Loader2
						className="w-3.5 h-3.5 text-primary animate-spin shrink-0"
						strokeWidth={1.6}
					/>
					<span className="text-[12px] font-medium text-text-primary shrink-0">
						{progressText || "正在生成设计稿…"}
					</span>
					<span
						className="text-[11px] text-text-muted truncate flex-1"
						title={currentSession.work_dir}
					>
						· {currentSession.work_dir}
					</span>
					<button
						type="button"
						onClick={() => void handleAbort()}
						className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-primary hover:bg-warm-200/60 transition-colors"
					>
						<X className="w-3 h-3" strokeWidth={1.6} />
						中止
					</button>
					<button
						type="button"
						onClick={handleExitDesign}
						className="text-[11px] text-text-muted hover:text-text-primary"
					>
						先回去
					</button>
				</div>
				<div className="flex-1 flex items-center justify-center px-8">
					<div className="flex flex-col items-center gap-4 opacity-60 select-none text-center">
						<div className="w-14 h-14 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
							<Sparkles
								className="w-5 h-5 text-text-muted"
								strokeWidth={1.4}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<div className="text-[13px] font-medium text-text-primary">
								画布生成中
							</div>
							<div className="text-[11.5px] text-text-muted leading-relaxed max-w-xs">
								在右侧 AI 助手实时查看 Agent 的思考与动作；
								<br />
								首页文件就绪后会自动切到预览。
							</div>
						</div>
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
