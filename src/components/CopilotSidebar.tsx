// AI 助手侧边栏 - 重构版（支持 Agent 工具调用系统）

import {
	CircleUser,
	Check,
	ChevronDown,
	FileText,
	MessageSquare,
	Plus,
	StopCircle,
	X,
} from "lucide-react";
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { type DragItem, useMouseDropZone } from "../hooks/useMouseDrag";
// webSearch 和 fetchUrlContent 现在由 Agent 工具调用
import { agentExecutor } from "../lib/agent/executor";
import {
	encodeChatMessageToAgentContentJson,
	loadAgentSessionMessagesAsChatMessages,
} from "../lib/agent/chatBridge";
import { normalizeAgentReplayMessages } from "../lib/chat/messageNormalization";
import {
	agentPersistence,
	resumePersistentSession,
} from "../lib/agent/persistence";
import { agentStore, useAgentStoreSelector } from "../lib/agent/store";
import { useAgentChatSettingsStore } from "../lib/agent/chatSettingsStore";
import {
	askUserQuestionStore,
	useAskUserQuestionStoreSelector,
} from "../lib/agent/askUserQuestionStore";
import {
	permissionStore,
	usePermissionStoreSelector,
} from "../lib/agent/permissionStore";
import { useChatStoreSelector } from "../lib/chat/store";
import type { ChatMessage as ChatMessageType } from "../lib/chat/types";
import { getPerformanceTuning } from "../lib/config";
import { EVENTS, events } from "../lib/events";
import { managedModeStore } from "../lib/managedModeStore";
import { settingsStore, useSettingsStoreSelector } from "../lib/settingsStore";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../lib/workspaceStore";
import { createMessage } from "../lib/chat/types";
import { CopilotHeader } from "./copilot/CopilotHeader";
import { CopilotStatusArea } from "./copilot/CopilotStatusArea";
import {
	chatActions,
	LazyPromptLibraryModal,
	MESSAGE_WINDOW_SIZE,
	MESSAGE_WINDOW_STEP,
} from "./copilot/copilotSidebarConstants";
import { useCopilotActions } from "./copilot/useCopilotActions";
import {
	useCopilotProposals,
	useCopilotScroll,
	useSessionTitleGeneration,
	useAgentHandler,
	useChatHandler,
} from "./copilot/hooks";
import { ChatInput } from "./chat/ChatInput";
import { CopilotMessagePane } from "./chat/CopilotMessagePane";
import type { SlashCommand } from "./chat/SlashCommand";
import { toast } from "./ui/Toast";

import { parseDocProtocolFinal } from "../lib/chat/docProtocol";
import { useDiffCapture } from "./CodeView/useDiffCapture";
import { PlanModeToggle } from "./agent/PlanModeToggle";
import {
	usePlanModeSelector,
	togglePlanMode,
} from "../lib/agent/planModeStore";
import { onPlanModifyFeedback } from "../lib/agent/planModifyEvent";

// chatActions / MESSAGE_WINDOW_* / LazyPromptLibraryModal — 见 ./copilot/copilotSidebarConstants

const respondToPermission =
	permissionStore.respondToPermission.bind(permissionStore);
const resolveAskUserQuestion =
	askUserQuestionStore.resolve.bind(askUserQuestionStore);

export default function CopilotSidebar() {
	const providers = useSettingsStoreSelector((state) => state.providers);
	const activeModel = useSettingsStoreSelector((state) => state.activeModel);
	const sessions = useChatStoreSelector((state) => state.sessions);
	const activeSessionId = useChatStoreSelector(
		(state) => state.activeSessionId,
	);
	const status = useChatStoreSelector((state) => state.status);
	const activeSession = useChatStoreSelector((state) => {
		if (!state.activeSessionId) return null;
		return (
			state.sessions.find((session) => session.id === state.activeSessionId) ||
			null
		);
	});
	const chatStore = useMemo(
		() => ({
			sessions,
			activeSessionId,
			activeSession,
			status,
			...chatActions,
		}),
		[sessions, activeSessionId, activeSession, status],
	);
	const { settings: chatSettings } = useAgentChatSettingsStore();
	const currentResearch = useWorkspaceStoreSelector(
		(state) => state.currentResearch,
	);
	// Agent 状态
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

	const [chatMode, setChatMode] = useState<"chat" | "agent">("agent");
	// 自动捕获文件操作的 diff 数据
	useDiffCapture();

	// 初始化时同步 managedModeStore（默认托管模式）
	useEffect(() => {
		managedModeStore.enableManagedMode();
	}, []);
	// Plan Mode 状态
	const planModeEnabled = usePlanModeSelector((s) => s.enabled);
	const [abortController, setAbortController] =
		useState<AbortController | null>(null);
	const {
		pendingCreateProposals,
		setActiveProposalId,
		isProposalMenuOpen,
		setIsProposalMenuOpen,
		queueCreateProposal,
		removeCreateProposal,
		activeCreateProposal,
		acceptActiveCreateProposal,
	} = useCopilotProposals();
	const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
	const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
	const [messageRenderStart, setMessageRenderStart] = useState(0);
	const [uiDebugLogsEnabled, setUiDebugLogsEnabled] = useState(false);
	const activeRestoredAgentSessionIdRef = useRef<string | null>(null);
	const replayedAgentSessionIdsRef = useRef<Set<string>>(new Set());

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

	// 鼠标拖拽 drop zone (替代 HTML5 拖拽，因为 Tauri 不支持)
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

	// 显示拖拽提示（当有拖拽进行中且鼠标在此区域）
	const showDropIndicator = isMouseDragging;

	// 如果出现权限请求，尽量让用户第一时间看到
	useEffect(() => {
		if (pendingRequests.size > 0) {
			scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [pendingRequests.size]);
	useEffect(() => {
		if (pendingAskUserQuestions.size > 0) {
			scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [pendingAskUserQuestions.size]);

	const handleAllowAskUserQuestion = useCallback(
		(requestId: string, updatedInput: Record<string, unknown>) => {
			resolveAskUserQuestion(requestId, {
				behavior: "allow",
				updatedInput,
			});
		},
		[resolveAskUserQuestion],
	);

	const handleDenyAskUserQuestion = useCallback(
		(requestId: string, message?: string) => {
			resolveAskUserQuestion(requestId, {
				behavior: "deny",
				message: message || "User denied",
			});
		},
		[resolveAskUserQuestion],
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

	// 监听添加上下文事件
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

	// 确保有活跃会话
	useEffect(() => {
		if (!chatStore.activeSession && chatStore.sessions.length === 0) {
			chatStore.createNewSession();
		} else if (!chatStore.activeSession && chatStore.sessions.length > 0) {
			chatStore.setActiveSession(chatStore.sessions[0].id);
		}
	}, [chatStore]);

	useEffect(() => {
		const s = chatStore.activeSession;
		const agentSessionId = s?.agentSessionId;
		if (!agentSessionId) {
			activeRestoredAgentSessionIdRef.current = null;
			return;
		}
		if (agentSessionId.startsWith("local-")) {
			activeRestoredAgentSessionIdRef.current = agentSessionId;
			return;
		}

		const shouldResume =
			activeRestoredAgentSessionIdRef.current !== agentSessionId;
		const shouldReplay =
			chatSettings.replayEnabled &&
			!replayedAgentSessionIdsRef.current.has(agentSessionId);
		if (!shouldResume && !shouldReplay) return;

		(async () => {
			try {
				if (shouldResume) {
					activeRestoredAgentSessionIdRef.current = agentSessionId;
					agentPersistence.setCurrentSessionId(agentSessionId);
					await resumePersistentSession(agentSessionId);
				}

				if (shouldReplay) {
					replayedAgentSessionIdsRef.current.add(agentSessionId);
					const replayMessages = await loadAgentSessionMessagesAsChatMessages(
						agentSessionId,
						{
							limit:
								chatSettings.replayLimit > 0
									? chatSettings.replayLimit
									: undefined,
						},
					);
					if (replayMessages.length > 0 && s) {
						const mergedById = new Map<string, ChatMessageType>();
						for (const m of s.messages || []) mergedById.set(m.id, m);
						for (const m of replayMessages) {
							if (!mergedById.has(m.id)) mergedById.set(m.id, m);
						}
						const merged = normalizeAgentReplayMessages(
							Array.from(mergedById.values()).sort(
								(a, b) => a.timestamp - b.timestamp,
							),
						);
						chatStore.replaceSessionMessages(s.id, merged);
					}
				}
			} catch (e) {
				console.warn(
					"[CopilotSidebar] 自动恢复 Agent Session 失败（可忽略，将使用本地状态）",
					e,
				);
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		chatStore.activeSessionId,
		chatSettings.replayEnabled,
		chatSettings.replayLimit,
	]);

	// 滚动管理
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

	// 中间栏运行图 -> 右侧栏定位：滚动到对应 ToolCall
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

			// Subtle focus flash (avoid Tailwind dynamic class issues)
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
	}, []);

	// 获取可用模型
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

	// 会话标题自动生成
	const { generateSessionTitle } = useSessionTitleGeneration({
		chatStore,
		enabledModels,
		debugLog,
	});

	// 执行深度研究（使用新的 Agent 系统）
	const performDeepResearch = async (query: string) => {
		if (!activeModel) {
			toast.warning("请先在设置中配置并选择一个模型");
			return;
		}

		const session = chatStore.activeSession;
		if (!session) return;

		// 添加用户消息到聊天
		const shouldGenerateTitle = session.messages.length === 0;
		const userMessage = createMessage("user", `[深度研究] ${query}`);
		chatStore.addMessage(session.id, userMessage);
		if (shouldGenerateTitle) {
			void generateSessionTitle(
				session.id,
				query,
				session.model || activeModel,
			);
		}
		chatStore.setStatus("streaming");

		// 创建 abort controller
		const controller = new AbortController();
		setAbortController(controller);

		let detachAgentEvent: (() => void) | null = null;
		detachAgentEvent = agentStore.onEvent((event) => {
			if (event.type === "task_started") {
				const traceMsg = createMessage("trace", "", {
					metadata: { trace: { type: "agent_task", taskId: event.task.id } },
				});
				traceMsg.metadata = {
					...traceMsg.metadata,
					blocks: encodeChatMessageToAgentContentJson(traceMsg).blocks,
				};
				chatStore.addMessage(session.id, traceMsg);
				return;
			}
		});

		try {
			// 使用新的 Agent 执行器
			await agentExecutor.executeResearchTask(query);

			// 获取最终结果
			const finalState = agentStore.getState();

			const rawResultText = finalState.currentTask?.result
				? finalState.currentTask.result
				: "研究任务已完成，请在左侧 Agent 面板查看详细结果。";

			const protocol = parseDocProtocolFinal(rawResultText, {
				activeDocContent: workspaceStore.getActiveDocContent() || "",
				hasActiveDoc: Boolean(workspaceStore.getState().activeDocId),
				prompt: query.slice(0, 50),
			});

			const resultText = protocol.displayContent;

			const assistantMessage = createMessage("assistant", resultText, {
				isStreaming: false,
				model: activeModel,
				metadata:
					protocol.kind === "create" || protocol.kind === "update"
						? { fileUpdates: [protocol.fileUpdate] }
						: undefined,
			});
			chatStore.addMessage(session.id, assistantMessage);
			if (protocol.kind === "update") {
				events.emit(EVENTS.AI_DOC_UPDATE_END, protocol.eventPayload);
			} else if (protocol.kind === "create") {
				queueCreateProposal(protocol.eventPayload);
			}
			chatStore.setStatus("idle");
			setAbortController(null);
		} catch (error) {
			console.error("Agent 研究任务失败:", error);
			const rawErrorText = `⚠️ 研究任务失败: ${error instanceof Error ? error.message : "未知错误"}`;
			const protocol = parseDocProtocolFinal(rawErrorText, {
				activeDocContent: workspaceStore.getActiveDocContent() || "",
				hasActiveDoc: Boolean(workspaceStore.getState().activeDocId),
				prompt: query.slice(0, 50),
			});

			const assistantMessage = createMessage(
				"assistant",
				protocol.displayContent,
				{
					isStreaming: false,
					model: activeModel,
					metadata:
						protocol.kind === "create" || protocol.kind === "update"
							? { fileUpdates: [protocol.fileUpdate] }
							: undefined,
				},
			);
			chatStore.addMessage(session.id, assistantMessage);
			if (protocol.kind === "update") {
				events.emit(EVENTS.AI_DOC_UPDATE_END, protocol.eventPayload);
			} else if (protocol.kind === "create") {
				queueCreateProposal(protocol.eventPayload);
			}
			chatStore.setStatus(
				"error",
				error instanceof Error ? error.message : "未知错误",
			);
			setAbortController(null);
		} finally {
			if (detachAgentEvent) {
				detachAgentEvent();
				detachAgentEvent = null;
			}
		}
	};

	// Agent 模式消息处理
	const { handleAgentModeMessage } = useAgentHandler({
		chatStore,
		activeModel,
		chatSettings,
		debugLog,
		debugWarn,
		onFirstUserMessage: (sessionId, firstMessage, fallbackModel) => {
			void generateSessionTitle(sessionId, firstMessage, fallbackModel);
		},
		queueCreateProposal,
		setAbortController,
	});

	// Chat 模式消息处理
	const { handleChatModeMessage } = useChatHandler({
		chatStore,
		activeModel,
		debugLog,
		onFirstUserMessage: (sessionId, firstMessage, fallbackModel) => {
			void generateSessionTitle(sessionId, firstMessage, fallbackModel);
		},
		queueCreateProposal,
		setAbortController,
	});

	// 处理发送消息
	const handleSendMessage = async (
		content: string,
		submitOptions?: {
			command?: SlashCommand;
			chips?: Array<{ type: string; command: SlashCommand }>;
			forcedSkillId?: string;
			skipUserMessage?: boolean; // 用于重新生成时跳过添加用户消息
			forceForkSession?: boolean;
			parentSdkSessionId?: string;
		},
	) => {
		// 从 submitOptions 提取参数
		const command = submitOptions?.command;
		const forcedSkillId = submitOptions?.forcedSkillId;
		const skipUserMessage = submitOptions?.skipUserMessage;
		const forceForkSession = submitOptions?.forceForkSession === true;
		const parentSdkSessionIdForRun = submitOptions?.parentSdkSessionId;

		if (!activeModel) {
			toast.warning("请先在设置中配置并选择一个模型");
			return;
		}

		// 检查是否是深度研究命令
		if (
			command?.id === "web" ||
			content.toLowerCase().includes("深度研究") ||
			content.toLowerCase().includes("研究一下")
		) {
			const query =
				content.replace(/^.*?(深度研究|研究一下)/, "").trim() || content;
			await performDeepResearch(query);
			return;
		}

		const session = chatStore.activeSession;
		if (!session) return;

		const currentContexts = workspaceStore.getState().contexts;
		const attachedFileTitles = currentContexts
			.filter((c) => c.type === "file")
			.map((c) => c.title)
			.filter(Boolean);
		const attachmentFooter =
			attachedFileTitles.length > 0
				? `\n\n[附加文件]\n${attachedFileTitles.map((t) => `- ${t}`).join("\n")}`
				: "";

		const skillInfo = forcedSkillId ? `\n[Skill: $${forcedSkillId}]` : "";
		const userTextForChat =
			(command ? `[${command.name}] ${content}` : content) +
			attachmentFooter +
			skillInfo;

		if (chatMode === "agent") {
			await handleAgentModeMessage(
				content,
				session,
				userTextForChat,
				command,
				forcedSkillId,
				skipUserMessage,
				forceForkSession,
				parentSdkSessionIdForRun,
			);
		} else {
			await handleChatModeMessage(
				content,
				session,
				userTextForChat,
				command,
				skipUserMessage,
			);
		}
	};

	const { handleNewSession } = useCopilotActions({
		chatStore,
	});

	// 重新生成消息
	const handleRegenerateMessage = useCallback(
		(messageId: string) => {
			const session = chatStore.activeSession;
			if (!session) return;

			// 找到该消息在列表中的位置
			const messageIndex = session.messages.findIndex(
				(m) => m.id === messageId,
			);
			if (messageIndex === -1) return;

			const targetMessage = session.messages[messageIndex];

			// 只允许重新生成 assistant 消息
			if (targetMessage.role !== "assistant") return;

			// 找到该消息之前最近的用户消息
			let userMessageContent: string | null = null;
			for (let i = messageIndex - 1; i >= 0; i--) {
				const msg = session.messages[i];
				if (msg.role === "user") {
					userMessageContent = msg.content;
					break;
				}
			}

			if (!userMessageContent) {
				console.warn("[CopilotSidebar] 无法找到对应的用户消息");
				return;
			}

			// 删除该 AI 消息（保留用户消息）
			chatStore.deleteMessage(session.id, messageId);

			// 重新生成，传递 skipUserMessage 避免重复添加用户消息
			handleSendMessage(userMessageContent, {
				skipUserMessage: true,
				forceForkSession: true,
				parentSdkSessionId: session.sdkSessionId,
			});
		},
		[chatStore.activeSession, handleSendMessage],
	);

	// 监听计划修改事件：用户在 PlanCard 中提交 feedback 后触发新一轮 Agent 请求
	useEffect(() => {
		return onPlanModifyFeedback((feedback) => {
			const prefixed = `请根据以下反馈修改计划：\n\n${feedback}`;
			handleSendMessage(prefixed);
		});
	}, [handleSendMessage]);

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
	}, [messages.length, maxMessageWindowStart]);

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
				agentTaskType={agentCurrentTask?.type}
				isMoreMenuOpen={isMoreMenuOpen}
				onToggleMoreMenu={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
				onCloseMoreMenu={() => setIsMoreMenuOpen(false)}
				onOpenPromptLibrary={() => {
					setIsPromptLibraryOpen(true);
					setIsMoreMenuOpen(false);
				}}
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
				pendingAskUserRequests={pendingAskUserRequests}
				onScroll={updateAutoScrollState}
				onLoadOlderMessages={handleLoadOlderMessages}
				onRegenerateMessage={handleRegenerateMessage}
				onOpenResearch={handleOpenResearch}
				onAllowAskUserQuestion={handleAllowAskUserQuestion}
				onDenyAskUserQuestion={handleDenyAskUserQuestion}
			/>

			{/* Input */}
			<div className="p-4 pt-2 relative">
				{/* 停止按钮 */}
				{(isStreaming || isAgentExecuting) && (
					<div className="mb-2 flex items-center justify-center">
						<button
							onClick={() => {
								if (chatMode === "agent") {
									agentExecutor.cancel();
								}
								if (abortController) {
									abortController.abort();
									setAbortController(null);
								}
								chatStore.setStatus("idle");
							}}
							aria-label="停止响应"
							className="flex items-center gap-2 px-4 py-2 bg-[rgba(181,51,51,0.08)] dark:bg-red-900/20 text-error dark:text-error hover:bg-[rgba(181,51,51,0.16)] dark:hover:bg-red-900/30 rounded-xl transition-colors text-sm font-medium cursor-pointer"
						>
							<StopCircle className="w-4 h-4" />
							停止响应
						</button>
					</div>
				)}

				{pendingCreateProposals.length > 0 && activeCreateProposal && (
					<div className="mb-2 relative">
						<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface/90 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] px-3 py-2.5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
							<button
								type="button"
								onClick={() => setIsProposalMenuOpen((v) => !v)}
								className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
							>
								<div className="w-9 h-9 rounded-xl bg-warm-200 flex items-center justify-center ring-1 ring-zinc-200/80 dark:ring-zinc-700/50 shrink-0 shadow-sm">
									<FileText className="w-4.5 h-4.5 text-text-secondary" />
								</div>
								<div className="min-w-0 flex-1 text-left">
									<div className="flex items-center gap-1.5 min-w-0">
										<span className="text-sm font-semibold text-text-primary">
											{pendingCreateProposals.length} 个文件待审查
										</span>
										{pendingCreateProposals.length > 1 && (
											<span className="px-1.5 py-0.5 rounded-md bg-dark-surface text-[10px] font-semibold text-white">
												+{pendingCreateProposals.length - 1}
											</span>
										)}
									</div>
									<div className="text-xs text-text-secondary truncate mt-0.5">
										{activeCreateProposal.title}
										{activeCreateProposal.summary && (
											<span className="text-text-light">
												{" "}
												· {activeCreateProposal.summary}
											</span>
										)}
									</div>
								</div>
								<ChevronDown className="w-4 h-4 text-text-light shrink-0" />
							</button>

							<div className="flex items-center gap-1.5">
								<button
									type="button"
									onClick={() => removeCreateProposal(activeCreateProposal.id)}
									className="h-10 w-10 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary dark:hover:text-zinc-200 hover:bg-surface/60 transition-all cursor-pointer"
									title="忽略"
									aria-label="忽略建议"
								>
									<X className="w-3.5 h-3.5" />
								</button>
								<button
									type="button"
									onClick={() => void acceptActiveCreateProposal()}
									className="h-8 px-3 rounded-lg flex items-center gap-1.5 bg-dark-muted text-white hover:bg-dark-surface dark:hover:bg-surface transition-all shadow-sm hover:shadow font-medium text-xs"
									title="创建并打开"
								>
									<Check className="w-3.5 h-3.5" />
									<span>保留</span>
								</button>
							</div>
						</div>

						{isProposalMenuOpen && (
							<div className="absolute z-50 mt-2 left-0 right-0 rounded-2xl border border-border bg-surface backdrop-blur shadow-bai-pop overflow-hidden">
								<div className="max-h-56 overflow-auto">
									{pendingCreateProposals.map((p) => (
										<button
											type="button"
											key={p.id}
											onClick={() => {
												setActiveProposalId(p.id);
												setIsProposalMenuOpen(false);
											}}
											className={`w-full px-4 py-3 text-left hover:bg-warm-50/60 transition-colors ${
												p.id === activeCreateProposal.id ? "bg-warm-50/40" : ""
											}`}
										>
											<div className="text-sm font-medium text-text-primary truncate">
												{p.title || "新文档"}
											</div>
											{p.summary ? (
												<div className="text-xs text-text-muted truncate mt-0.5">
													{p.summary}
												</div>
											) : null}
										</button>
									))}
								</div>
								<div className="px-4 py-2 border-t border-border/60 flex items-center justify-between">
									<div className="text-[11px] text-text-light">
										点击选择要处理的文档
									</div>
									<button
										type="button"
										onClick={() => setIsProposalMenuOpen(false)}
										aria-label="关闭文档列表"
										className="text-xs text-text-muted hover:text-text-primary dark:hover:text-zinc-200 cursor-pointer"
									>
										关闭
									</button>
								</div>
							</div>
						)}
					</div>
				)}

				<div className="mb-2 flex items-center justify-between">
					<div className="inline-flex items-center bg-warm-200/70 rounded-2xl p-1 ring-1 ring-black/5 dark:ring-white/5 shadow-sm">
						<button
							onClick={() => {
								setChatMode("chat");
								managedModeStore.disableManagedMode();
							}}
							className={`px-3.5 py-2 text-xs font-medium rounded-xl transition-colors duration-200 cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
								chatMode === "chat"
									? "bg-warm-200 text-text-primary"
									: "text-text-muted hover:text-text-primary hover:bg-warm-200/60"
							}`}
						>
							<MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
							对话
						</button>
						<button
							onClick={() => {
								setChatMode("agent");
								managedModeStore.enableManagedMode();
							}}
							className={`px-3.5 py-2 text-xs font-medium rounded-xl transition-colors duration-200 cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
								chatMode === "agent"
									? "bg-primary text-primary-foreground"
									: "text-text-muted hover:text-text-primary hover:bg-warm-200/60"
							}`}
						>
							<CircleUser className="w-3.5 h-3.5" strokeWidth={1.5} />
							托管
						</button>
					</div>

					<div
						className={`flex items-center gap-1.5 text-[11px] transition-colors duration-300 ${chatMode === "agent" ? "text-text-secondary" : "text-text-light"}`}
					>
						{chatMode === "agent" ? (
							<>
								<span className="w-1.5 h-1.5 rounded-full animate-pulse bg-success" />
								Agent 模式
							</>
						) : (
							"普通对话"
						)}
					</div>
				</div>

				{/* Plan Mode 切换器 - 仅 agent 模式下显示 */}
				{chatMode === "agent" && (
					<div className="px-0 pb-1.5">
						<PlanModeToggle
							planMode={planModeEnabled}
							onToggle={() => togglePlanMode()}
							disabled={isStreaming || isAgentExecuting}
						/>
					</div>
				)}

				<ChatInput
					onSubmit={handleSendMessage}
					disabled={isStreaming || isAgentExecuting}
					placeholder={
						isAgentExecuting
							? agentCurrentTask?.type === "research"
								? "研究进行中..."
								: "Agent 执行中..."
							: chatMode === "agent"
								? "描述你的需求，Agent 会自动完成..."
								: "输入消息，或用 / 唤起命令..."
					}
					model={activeModel || undefined}
					models={enabledModels}
					onModelSelect={handleSelectModel}
					onOpenPromptLibrary={() => setIsPromptLibraryOpen(true)}
					isAgentExecuting={isAgentExecuting}
				/>
			</div>

			{/* 提示词仓库弹窗 */}
			{isPromptLibraryOpen ? (
				<Suspense fallback={null}>
					<LazyPromptLibraryModal
						isOpen={isPromptLibraryOpen}
						onClose={() => setIsPromptLibraryOpen(false)}
					/>
				</Suspense>
			) : null}
		</aside>
	);
}
