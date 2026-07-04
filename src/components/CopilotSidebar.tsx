// AI 助手侧边栏 - 重构后薄壳版
// 主要职责：
//   - 聚合各 Store 订阅与本地 UI 状态
//   - 通过 useCopilotSession / useCopilotMessage 等 hook 分离逻辑
//   - 通过 memo 化的子组件（CopilotInputArea / CopilotStatusBar）隔离重渲染

import { Plus } from "lucide-react";
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { type DragItem, useMouseDropZone } from "../hooks/useMouseDrag";
import {
	askUserQuestionStore,
	useAskUserQuestionStoreSelector,
} from "../lib/agent/askUserQuestionStore";
import { useAgentChatSettingsStore } from "../lib/agent/chatSettingsStore";
import {
	permissionStore,
	usePermissionStoreSelector,
} from "../lib/agent/permissionStore";
import {
	togglePlanMode,
	usePlanModeSelector,
} from "../lib/agent/planModeStore";
import { useAgentStoreSelector } from "../lib/agent/store";
import { getPerformanceTuning } from "../lib/config";
import { EVENTS, events } from "../lib/events";
import { managedModeStore } from "../lib/managedModeStore";
import { settingsStore, useSettingsStoreSelector } from "../lib/settingsStore";
import { useRegisterShortcuts } from "../lib/shortcuts";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../lib/workspaceStore";
import { useDiffCapture } from "./CodeView/useDiffCapture";
import { CopilotMessagePane } from "./chat/CopilotMessagePane";
import { CopilotHeader } from "./copilot/CopilotHeader";
import { CopilotInputArea } from "./copilot/CopilotInputArea";
import { CopilotStatusArea } from "./copilot/CopilotStatusArea";
import { CopilotStatusBar } from "./copilot/CopilotStatusBar";
import {
	LazyPromptLibraryModal,
	MESSAGE_WINDOW_SIZE,
	MESSAGE_WINDOW_STEP,
} from "./copilot/copilotSidebarConstants";
import {
	useCopilotMessage,
	useCopilotScroll,
	useCopilotSession,
} from "./copilot/hooks";
import { useCopilotActions } from "./copilot/useCopilotActions";

const respondToPermission =
	permissionStore.respondToPermission.bind(permissionStore);
const resolveAskUserQuestion =
	askUserQuestionStore.resolve.bind(askUserQuestionStore);

export default function CopilotSidebar() {
	// === Store 订阅 ===
	const providers = useSettingsStoreSelector((state) => state.providers);
	const activeModel = useSettingsStoreSelector((state) => state.activeModel);
	const { settings: chatSettings } = useAgentChatSettingsStore();
	const currentResearch = useWorkspaceStoreSelector(
		(state) => state.currentResearch,
	);
	const isAgentExecuting = useAgentStoreSelector((state) => state.isExecuting);
	const agentCurrentTask = useAgentStoreSelector((state) => state.currentTask);
	const isWaitingForLLM = useAgentStoreSelector(
		(state) => state.isWaitingForLLM,
	);
	const pendingRequests = usePermissionStoreSelector(
		(state) => state.pendingRequests,
	);
	const pendingAskUserQuestions = useAskUserQuestionStoreSelector(
		(state) => state.pending,
	);
	const planModeEnabled = usePlanModeSelector((s) => s.enabled);

	// === 本地 UI 状态 ===
	const [chatMode] = useState<"chat" | "agent">("agent");
	const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
	const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
	const [messageRenderStart, setMessageRenderStart] = useState(0);
	const [uiDebugLogsEnabled, setUiDebugLogsEnabled] = useState(false);

	useDiffCapture();

	// 默认进入托管模式
	useEffect(() => {
		managedModeStore.enableManagedMode();
	}, []);

	// === Debug logs 开关 ===
	useEffect(() => {
		let cancelled = false;
		void getPerformanceTuning()
			.then((settings) => {
				if (cancelled) return;
				setUiDebugLogsEnabled(settings.enableUiDebugLogs);
			})
			.catch((error) => {
				console.error("加载性能设置失败:", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const debugLog = useCallback(
		(...args: unknown[]) => {
			if (!uiDebugLogsEnabled) return;
			console.log(...args);
		},
		[uiDebugLogsEnabled],
	);
	const debugWarn = useCallback(
		(...args: unknown[]) => {
			if (!uiDebugLogsEnabled) return;
			console.warn(...args);
		},
		[uiDebugLogsEnabled],
	);

	// === 鼠标拖拽 drop zone（Tauri 不支持 HTML5 拖拽）===
	const handleMouseDrop = useCallback(
		(item: DragItem) => {
			if (item.type === "source" && item.sourceData) {
				debugLog("[CopilotDrag] 资料拖入 AI 对话:", item.sourceData.title);
				events.emit(EVENTS.ADD_TO_CONTEXT, { source: item.sourceData });
			}
		},
		[debugLog],
	);
	const {
		isOver: isMouseDragOver,
		isDragging: isMouseDragging,
		dropZoneProps,
	} = useMouseDropZone(handleMouseDrop);
	const showDropIndicator = isMouseDragging;

	// === 可用模型 ===
	const enabledModels = useMemo(
		() =>
			providers
				.filter((provider) => provider.isEnabled)
				.flatMap((provider) =>
					provider.models.map((modelId) => ({
						id: modelId,
						provider: provider.name,
					})),
				)
				.sort((a, b) => a.id.localeCompare(b.id)),
		[providers],
	);

	// === 会话管理 ===
	const { chatStore } = useCopilotSession({
		replayEnabled: chatSettings.replayEnabled,
		replayLimit: chatSettings.replayLimit,
	});

	// === 消息发送 / 取消 ===
	const {
		handleSendMessage,
		handleRegenerateMessage,
		handleEditUserMessage,
		handleDeleteMessage,
		stop,
	} = useCopilotMessage({
		chatStore,
		activeModel,
		chatSettings,
		chatMode,
		enabledModels,
		debugLog,
		debugWarn,
	});

	// ⌘. 停止响应 — 仅在流式/Agent 执行中生效；输入框聚焦时也可触发
	const canStopRef = useRef(false);
	canStopRef.current =
		chatStore.status === "streaming" || isAgentExecuting || isWaitingForLLM;
	useRegisterShortcuts(
		() => [
			{
				id: "chat.stop-response",
				keys: "mod+.",
				label: "停止响应",
				description: "中止正在进行的回复或 Agent 执行",
				group: "对话",
				scope: "chat",
				allowInInput: true,
				when: () => canStopRef.current,
				handler: () => stop(),
			},
		],
		[stop],
	);

	// === 滚动管理 ===
	const {
		scrollContainerRef,
		messagesEndRef,
		updateAutoScrollState,
		shouldAutoScrollRef,
	} = useCopilotScroll({
		isStreaming: chatStore.status === "streaming",
		isAgentExecuting,
		activeSessionId: chatStore.activeSessionId,
		messagesDep: chatStore.activeSession?.messages,
	});

	// 权限/AskUser 出现时滚到顶部
	useEffect(() => {
		if (pendingRequests.size > 0) {
			scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [pendingRequests.size, scrollContainerRef]);
	useEffect(() => {
		if (pendingAskUserQuestions.size > 0) {
			scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [pendingAskUserQuestions.size, scrollContainerRef]);

	// === ADD_TO_CONTEXT 事件 ===
	useEffect(() => {
		const unsubscribe = events.on(
			EVENTS.ADD_TO_CONTEXT,
			(data: { source?: any; text?: string; title?: string }) => {
				if (data.source) {
					workspaceStore.addSourceToContext(data.source);
				} else if (data.text) {
					workspaceStore.addSelectionToContext(data.text, data.title);
				}
			},
		);
		return unsubscribe;
	}, []);

	// === 中间栏运行图 → 滚动到对应 ToolCall ===
	useEffect(() => {
		const escapeSelector = (value: string) => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const anyCss = (window as any)?.CSS;
				if (anyCss && typeof anyCss.escape === "function")
					return anyCss.escape(value);
			} catch {}
			return value.replace(/["\\]/g, "\\$&");
		};

		return events.on(EVENTS.AGENT_FOCUS_TOOL_CALL, (payload) => {
			if (payload?.source === "sidebar") return;
			const toolCallId =
				typeof payload?.toolCallId === "string" ? payload.toolCallId : "";
			if (!toolCallId) return;
			const container = scrollContainerRef.current;
			if (!container) return;
			const selector = `[data-agent-tool-call-id="${escapeSelector(toolCallId)}"]`;
			const el = container.querySelector(selector) as HTMLElement | null;
			if (!el) return;

			el.scrollIntoView({ behavior: "smooth", block: "center" });

			const prevShadow = el.style.boxShadow;
			const prevRadius = el.style.borderRadius;
			el.style.borderRadius = prevRadius || "16px";
			el.style.boxShadow =
				"0 0 0 2px rgba(99,102,241,0.45), 0 18px 60px -35px rgba(99,102,241,0.45)";
			window.setTimeout(() => {
				el.style.boxShadow = prevShadow;
				el.style.borderRadius = prevRadius;
			}, 1200);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// === Actions ===
	const { handleNewSession } = useCopilotActions({ chatStore });

	const handleAllowAskUserQuestion = useCallback(
		(requestId: string, updatedInput: Record<string, unknown>) => {
			resolveAskUserQuestion(requestId, {
				behavior: "allow",
				updatedInput,
			});
		},
		[],
	);
	const handleDenyAskUserQuestion = useCallback(
		(requestId: string, message?: string) => {
			resolveAskUserQuestion(requestId, {
				behavior: "deny",
				message: message || "User denied",
			});
		},
		[],
	);
	const handleLoadOlderMessages = useCallback(() => {
		setMessageRenderStart((previous) =>
			Math.max(0, previous - MESSAGE_WINDOW_STEP),
		);
	}, []);
	const handleOpenResearch = useCallback(() => {
		workspaceStore.setLeftSidebarView("research");
	}, []);
	const handleSelectModel = useCallback((id: string) => {
		void settingsStore.setActiveModel(id);
	}, []);
	const handleOpenPromptLibrary = useCallback(() => {
		setIsPromptLibraryOpen(true);
	}, []);
	const handleClosePromptLibrary = useCallback(() => {
		setIsPromptLibraryOpen(false);
	}, []);
	const handleToggleMoreMenu = useCallback(() => {
		setIsMoreMenuOpen((prev) => !prev);
	}, []);
	const handleCloseMoreMenu = useCallback(() => {
		setIsMoreMenuOpen(false);
	}, []);
	const handleOpenPromptLibraryFromHeader = useCallback(() => {
		setIsPromptLibraryOpen(true);
		setIsMoreMenuOpen(false);
	}, []);

	// === 派生数据 ===
	const messages = chatStore.activeSession?.messages || [];
	const maxMessageWindowStart = Math.max(
		0,
		messages.length - MESSAGE_WINDOW_SIZE,
	);
	const effectiveMessageRenderStart = Math.min(
		messageRenderStart,
		maxMessageWindowStart,
	);
	const hiddenMessageCount = effectiveMessageRenderStart;
	const visibleMessages = useMemo(
		() => messages.slice(effectiveMessageRenderStart),
		[messages, effectiveMessageRenderStart],
	);
	const pendingAskUserRequests = useMemo(
		() =>
			Array.from(pendingAskUserQuestions.values()).map((item) => item.request),
		[pendingAskUserQuestions],
	);
	const pendingPermissionRequests = useMemo(
		() => Array.from(pendingRequests.values()).map((item) => item.request),
		[pendingRequests],
	);
	const isStreaming = chatStore.status === "streaming";

	useEffect(() => {
		setMessageRenderStart(maxMessageWindowStart);
	}, [chatStore.activeSessionId, maxMessageWindowStart]);

	useEffect(() => {
		setMessageRenderStart((previous) => {
			if (messages.length <= MESSAGE_WINDOW_SIZE) return 0;
			if (shouldAutoScrollRef.current) return maxMessageWindowStart;
			return Math.min(previous, maxMessageWindowStart);
		});
	}, [messages.length, maxMessageWindowStart, shouldAutoScrollRef]);

	const agentTaskType = agentCurrentTask?.type;

	return (
		<aside
			data-copilot-sidebar
			className="flex flex-col h-full font-sans relative bg-transparent"
			{...dropZoneProps}
		>
			{/* 拖拽资料到 AI 对话的视觉提示 */}
			{showDropIndicator && (
				<div
					className={`absolute inset-0 z-[100] pointer-events-none flex items-center justify-center border-2 border-dashed rounded-xl backdrop-blur-[1px] transition-colors ${isMouseDragOver ? "bg-primary/10 border-primary" : "bg-warm-500/5 border-cream-400"}`}
				>
					<div className="bg-surface px-4 py-3 rounded-xl shadow-bai-pop border border-border flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-warm-200 border border-border flex items-center justify-center">
							<Plus className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
						</div>
						<div>
							<p className="text-sm font-medium text-text-primary">
								添加到 AI 上下文
							</p>
							<p className="text-xs text-text-muted">
								{isMouseDragOver
									? "松开鼠标将资料添加到对话"
									: "将资料拖拽到此处"}
							</p>
						</div>
					</div>
				</div>
			)}

			<CopilotHeader
				isAgentExecuting={isAgentExecuting}
				agentTaskType={agentTaskType}
				isMoreMenuOpen={isMoreMenuOpen}
				onToggleMoreMenu={handleToggleMoreMenu}
				onCloseMoreMenu={handleCloseMoreMenu}
				onOpenPromptLibrary={handleOpenPromptLibraryFromHeader}
				onNewSession={handleNewSession}
			/>

			<CopilotStatusArea
				requests={pendingPermissionRequests}
				onRespond={respondToPermission}
			/>

			<CopilotMessagePane
				scrollContainerRef={scrollContainerRef}
				messagesEndRef={messagesEndRef}
				messages={visibleMessages}
				hiddenMessageCount={hiddenMessageCount}
				currentResearch={currentResearch}
				isStreaming={isStreaming}
				isAgentExecuting={isAgentExecuting}
				isWaitingForLLM={isWaitingForLLM}
				chatMode={chatMode}
				preferBlocks={chatSettings.blocksFirstEnabled}
				sessionHasError={chatStore.status === "error"}
				pendingAskUserRequests={pendingAskUserRequests}
				shouldAutoScrollRef={shouldAutoScrollRef}
				onScroll={updateAutoScrollState}
				onLoadOlderMessages={handleLoadOlderMessages}
				onRegenerateMessage={handleRegenerateMessage}
				onEditMessage={handleEditUserMessage}
				onDeleteMessage={handleDeleteMessage}
				onOpenResearch={handleOpenResearch}
				onAllowAskUserQuestion={handleAllowAskUserQuestion}
				onDenyAskUserQuestion={handleDenyAskUserQuestion}
			/>

			<div className="p-4 pt-2 relative">
				<CopilotStatusBar
					isStreaming={isStreaming}
					isAgentExecuting={isAgentExecuting}
					onStop={stop}
				/>
				<CopilotInputArea
					isStreaming={isStreaming}
					isAgentExecuting={isAgentExecuting}
					agentTaskType={agentTaskType}
					chatMode={chatMode}
					activeModel={activeModel}
					enabledModels={enabledModels}
					planModeEnabled={planModeEnabled}
					onTogglePlanMode={togglePlanMode}
					onSendMessage={handleSendMessage}
					onSelectModel={handleSelectModel}
					onOpenPromptLibrary={handleOpenPromptLibrary}
				/>
			</div>

			{/* 提示词仓库弹窗 */}
			{isPromptLibraryOpen ? (
				<Suspense fallback={null}>
					<LazyPromptLibraryModal
						isOpen={isPromptLibraryOpen}
						onClose={handleClosePromptLibrary}
					/>
				</Suspense>
			) : null}
		</aside>
	);
}
