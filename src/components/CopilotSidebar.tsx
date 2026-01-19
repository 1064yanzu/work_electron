// AI 助手侧边栏 - 重构版（支持 Agent 工具调用系统）

import { diffLines } from "diff";
import {
	BookOpen,
	Bot,
	History,
	Loader2,
	Plus,
	Search,
	Sparkles,
	StopCircle,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DragItem, useMouseDropZone } from "../hooks/useMouseDrag";
// webSearch 和 fetchUrlContent 现在由 Agent 工具调用
import {
	agentExecutor,
	agentPersistence,
	agentStore,
	initializeAgent,
	resumePersistentSession,
	startPersistentSession,
	useAgentStore,
} from "../lib/agent";
import {
	encodeChatMessageToAgentContentJson,
	loadAgentSessionMessagesAsChatMessages,
	persistChatMessageToAgentSession,
} from "../lib/agent/chatBridge";
import { useAgentChatSettingsStore } from "../lib/agent/chatSettingsStore";
import type { ThinkingStep } from "../lib/agent/core/intelligentAgent";
import { usePermissionStore } from "../lib/agent/permissionStore";
import {
	createMessage,
	chatStore as globalChatStore,
	invokeLlm,
	invokeLlmWithCallback,
	useChatStore,
} from "../lib/chat";
import type {
	ChatMessageBlock,
	ChatMessage as ChatMessageType,
} from "../lib/chat/types";
import { getConfig } from "../lib/config";
import { EVENTS, events } from "../lib/events";
import { getChatSystemPrompt, getTitleGenerationPrompt } from "../lib/prompts";
import { useSettingsStore } from "../lib/settingsStore";
import { useWorkspaceStore, workspaceStore } from "../lib/workspaceStore";
import { PermissionList, ThinkingProcessCompact } from "./agent";
import {
	ChatHistory,
	ChatInput,
	ChatMessage as ChatMessageComponent,
	ModelSelector,
	type SlashCommand,
} from "./chat";

// AI 写作标记
const WRITE_START_MARKER = "<<<WRITE>>>";
const WRITE_END_MARKER = "<<<END>>>";

// 解析 AI 响应中的写入内容
function parseWriteContent(content: string): {
	displayContent: string;
	writeContent: string | null;
} {
	const startIdx = content.indexOf(WRITE_START_MARKER);
	const endIdx = content.indexOf(WRITE_END_MARKER);

	if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
		const writeContent = content
			.slice(startIdx + WRITE_START_MARKER.length, endIdx)
			.trim();
		const displayContent =
			content.slice(0, startIdx) +
			content.slice(endIdx + WRITE_END_MARKER.length);
		return { displayContent: displayContent.trim(), writeContent };
	}

	return { displayContent: content, writeContent: null };
}

function parseDocProtocolFinal(
	full: string,
	options: {
		activeDocContent?: string;
		prompt: string;
	},
):
	| { kind: "none"; displayContent: string }
	| {
			kind: "update";
			displayContent: string;
			suggestedContent: string;
			fileUpdate: {
				fileName: string;
				type: "update";
				additions: number;
				deletions: number;
			};
			eventPayload: {
				originalContent: string;
				suggestedContent: string;
				prompt: string;
			};
	  }
	| {
			kind: "create";
			displayContent: string;
			title: string;
			summary: string;
			content: string;
			fileUpdate: {
				fileName: string;
				type: "create";
				additions: number;
				deletions: number;
			};
			eventPayload: {
				title: string;
				summary: string;
				content: string;
				prompt: string;
			};
	  } {
	const updateMatch = full.match(/:::update-doc([\s\S]*?):::/);
	if (updateMatch) {
		const suggestedContent = (updateMatch[1] || "").trim();
		const originalContent = options.activeDocContent ?? "";
		const changes = diffLines(originalContent, suggestedContent);
		let additions = 0;
		let deletions = 0;
		changes.forEach((part) => {
			if (part.added) additions += part.count || 0;
			if (part.removed) deletions += part.count || 0;
		});

		return {
			kind: "update",
			displayContent: full.replace(updateMatch[0], "\n<<<AI_UPDATE_DONE>>>\n"),
			suggestedContent,
			fileUpdate: {
				fileName: "当前文档",
				type: "update",
				additions,
				deletions,
			},
			eventPayload: {
				originalContent,
				suggestedContent,
				prompt: options.prompt,
			},
		};
	}

	const createMatch = full.match(/:::create-doc([\s\S]*?):::/);
	if (createMatch) {
		const docContentBuffer = (createMatch[1] || "").trim();
		const lines = docContentBuffer.split("\n");
		let title = "新文档";
		let summary = "";
		let docContent = docContentBuffer;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith("标题:") || line.startsWith("标题：")) {
				title = line.replace(/^标题[:：]\s*/, "");
			} else if (line.startsWith("摘要:") || line.startsWith("摘要：")) {
				summary = line.replace(/^摘要[:：]\s*/, "");
			} else if (line.startsWith("内容:") || line.startsWith("内容：")) {
				docContent = lines
					.slice(i + 1)
					.join("\n")
					.trim();
				break;
			}
		}

		const changes = diffLines("", docContent);
		let additions = 0;
		changes.forEach((part) => {
			if (part.added) additions += part.count || 0;
		});

		return {
			kind: "create",
			displayContent: full.replace(createMatch[0], "\n<<<AI_CREATE_DONE>>>\n"),
			title,
			summary,
			content: docContent,
			fileUpdate: {
				fileName: title,
				type: "create",
				additions,
				deletions: 0,
			},
			eventPayload: {
				title,
				summary,
				content: docContent,
				prompt: options.prompt,
			},
		};
	}

	return { kind: "none", displayContent: full };
}

function tokenizeForRecall(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[\u200b\u200c\u200d\ufeff]/g, "")
		.split(/[^\p{L}\p{N}]+/u)
		.map((s) => s.trim())
		.filter((s) => s.length >= 2)
		.slice(0, 10);
}

function buildAgentConversationContext(
	messages: ChatMessageType[],
	currentQuery: string,
	options?: { maxLines?: number; tailKeep?: number; headRelevant?: number },
): string[] {
	const maxLines = options?.maxLines ?? 12;
	const tailKeep = options?.tailKeep ?? 8;
	const headRelevant = options?.headRelevant ?? 4;

	const filtered = messages
		.filter(
			(m) =>
				(m.role === "user" || m.role === "assistant") &&
				typeof m.content === "string" &&
				m.content.trim().length > 0,
		)
		.map((m) => ({
			id: m.id,
			role: m.role,
			content: m.content,
			timestamp: m.timestamp || 0,
		}));

	if (filtered.length === 0) return [];

	const tail = filtered.slice(-tailKeep);
	const tokens = tokenizeForRecall(currentQuery);

	const tailIds = new Set(tail.map((m) => m.id));
	const scored = filtered
		.filter((m) => !tailIds.has(m.id))
		.map((m) => {
			const text = m.content.toLowerCase();
			const score = tokens.reduce(
				(acc, t) => acc + (text.includes(t) ? 1 : 0),
				0,
			);
			return { ...m, score };
		})
		.filter((m) => m.score > 0)
		.sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
		.slice(0, headRelevant)
		.sort((a, b) => a.timestamp - b.timestamp);

	const picked = [...scored, ...tail]
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(-maxLines);
	// 限制每条消息的长度，避免对话历史过长
	return picked.map((m) => {
		const truncated =
			m.content.length > 500 ? m.content.slice(0, 500) + "..." : m.content;
		return `${m.role === "user" ? "用户" : "AI"}: ${truncated}`;
	});
}

function guessFallbackSearchQuery(messages: ChatMessageType[]): string | null {
	const isGeneric = (t: string) => {
		const s = t.trim();
		if (!s) return true;
		return (
			s === "请你搜索" ||
			s === "再次搜索" ||
			s === "不对" ||
			s === "不对，再次搜索" ||
			s === "继续" ||
			s === "再来一次" ||
			s === "重试"
		);
	};

	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role !== "user") continue;
		const text = typeof m.content === "string" ? m.content : "";
		if (!isGeneric(text)) return text.trim();
	}
	return null;
}

// 快捷操作按钮
interface QuickAction {
	id: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	prompt: string;
	isResearch?: boolean;
}

const quickActions: QuickAction[] = [
	{
		id: "research",
		label: "深度研究",
		icon: Search,
		prompt: "请帮我深度研究以下主题：",
		isResearch: true,
	},
	{
		id: "summarize",
		label: "总结资料",
		icon: BookOpen,
		prompt: "请帮我总结当前上下文中的资料要点",
	},
	{
		id: "write",
		label: "帮我写作",
		icon: Sparkles,
		prompt: "请帮我撰写一篇关于以下主题的文章：",
	},
	{
		id: "brainstorm",
		label: "头脑风暴",
		icon: Zap,
		prompt: "请帮我进行头脑风暴，主题是：",
	},
];

export default function CopilotSidebar() {
	const { providers, activeModel, settingsStore } = useSettingsStore();
	const chatStore = useChatStore();
	const { settings: chatSettings } = useAgentChatSettingsStore();
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const { currentResearch } = useWorkspaceStore();
	// Agent 状态
	const {
		isExecuting: isAgentExecuting,
		currentTask: agentCurrentTask,
		isWaitingForLLM,
	} = useAgentStore();
	const { pendingRequests, respondToPermission } = usePermissionStore();

	// 智能Agent思考步骤
	const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);

	// 监听智能Agent思考事件
	useEffect(() => {
		const unsubscribe = events.on(
			"agent:thinking_step",
			(data: { step: ThinkingStep; allSteps: ThinkingStep[] }) => {
				setThinkingSteps(data.allSteps);
			},
		);
		return () => unsubscribe();
	}, []);

	// Agent任务结束时清空思考步骤
	useEffect(() => {
		if (!isAgentExecuting) {
			// 延迟清空，让用户看到最终状态
			const timer = setTimeout(() => {
				setThinkingSteps([]);
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [isAgentExecuting]);

	const [chatMode, setChatMode] = useState<"chat" | "agent">("chat");
	const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
	const [abortController, setAbortController] =
		useState<AbortController | null>(null);
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);
	const restoredAgentSessionIdsRef = useRef<Set<string>>(new Set());
	const replayedAgentSessionIdsRef = useRef<Set<string>>(new Set());

	// 鼠标拖拽 drop zone (替代 HTML5 拖拽，因为 Tauri 不支持)
	const handleMouseDrop = useCallback((item: DragItem) => {
		if (item.type === "source" && item.sourceData) {
			console.log("[CopilotDrag] 资料拖入 AI 对话:", item.sourceData.title);
			events.emit(EVENTS.ADD_TO_CONTEXT, { source: item.sourceData });
		}
	}, []);

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

	// 初始化 Agent 系统
	useEffect(() => {
		initializeAgent();
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
		if (!agentSessionId) return;
		if (agentSessionId.startsWith("local-")) return;

		const shouldResume =
			!restoredAgentSessionIdsRef.current.has(agentSessionId);
		const shouldReplay =
			chatSettings.replayEnabled &&
			!replayedAgentSessionIdsRef.current.has(agentSessionId);
		if (!shouldResume && !shouldReplay) return;

		(async () => {
			try {
				if (shouldResume) {
					restoredAgentSessionIdsRef.current.add(agentSessionId);
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
						const merged = Array.from(mergedById.values()).sort(
							(a, b) => a.timestamp - b.timestamp,
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

	// 滚动到底部
	const scrollToBottom = () => {
		const el = scrollContainerRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
			return;
		}

		const behavior: ScrollBehavior =
			chatStore.status === "streaming" || isAgentExecuting ? "auto" : "smooth";
		messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
	};

	const shouldAutoScrollRef = useRef(true);

	const updateAutoScrollState = () => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		shouldAutoScrollRef.current = distanceToBottom < 120;
	};

	useEffect(() => {
		if (shouldAutoScrollRef.current) {
			scrollToBottom();
		}
	}, [chatStore.activeSession?.messages]);

	useEffect(() => {
		// 切换会话/首次渲染时刷新一次“是否在底部附近”的判断，避免错误触发自动滚动
		updateAutoScrollState();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chatStore.activeSessionId]);

	// 获取可用模型
	const enabledModels = providers
		.filter((provider) => provider.isEnabled)
		.flatMap((provider) =>
			provider.models.map((modelId) => ({
				id: modelId,
				provider: provider.name,
			})),
		)
		.sort((a, b) => a.id.localeCompare(b.id));

	// 正在生成标题的会话集合，防止重复处理
	const generatingRef = useRef<Set<string>>(new Set());

	// 生成会话标题
	const generateSessionTitle = async (
		sessionId: string,
		firstMessage: string,
		fallbackModel?: string,
	) => {
		if (generatingRef.current.has(sessionId)) return;

		try {
			generatingRef.current.add(sessionId);

			// 1. 获取配置的生成模型
			const configModel = await getConfig("title_generation_model");
			const modelToUse =
				configModel || fallbackModel || enabledModels[0]?.id || "gpt-4o-mini";

			console.log(
				`[CopilotSidebar] 开始为会话 ${sessionId.slice(0, 6)}... 生成标题，使用模型: ${modelToUse}`,
			);

			// 2. 调用 LLM 生成标题（使用可配置的提示词）
			const prompt = await getTitleGenerationPrompt(firstMessage);

			// invokeLlm 返回 Promise<string>
			const content = await invokeLlm({
				model: modelToUse,
				prompt,
				temperature: 0.3,
			});

			let title = content?.trim();

			// 3. 校验结果
			if (title) {
				title = title.replace(/^["'《]|^标题[:：]\s*|["'》]$/g, "").trim();
				if (title.length > 20) {
					title = title.slice(0, 20);
				}

				console.log(`[CopilotSidebar] 标题生成成功: "${title}"`);
				chatStore.updateSessionTitle(sessionId, title);
			} else {
				throw new Error("AI 返回内容为空");
			}
		} catch (error) {
			console.error("[CopilotSidebar] 生成会话标题失败:", error);
			const currentSession = chatStore.sessions.find((s) => s.id === sessionId);
			if (currentSession?.title === "新对话") {
				chatStore.updateSessionTitle(sessionId, firstMessage.slice(0, 15));
			}
		} finally {
			generatingRef.current.delete(sessionId);
		}
	};

	// 自动补全历史会话标题
	useEffect(() => {
		const backfillTitles = async () => {
			// 延迟执行
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const sessions = chatStore.sessions;
			for (const session of sessions) {
				if (session.messages.length > 0) {
					const firstMsg = session.messages[0].content;
					const defaultTruncated = firstMsg.slice(0, 15);

					const needsGeneration =
						!session.title ||
						session.title === "新对话" ||
						(session.title === defaultTruncated && firstMsg.length > 15) ||
						/^对话 \d{1,2}月\d{1,2}日/.test(session.title);

					if (needsGeneration) {
						await generateSessionTitle(
							session.id,
							firstMsg,
							session.model || activeModel,
						);
						await new Promise((resolve) => setTimeout(resolve, 500));
					}
				}
			}
		};

		backfillTitles();
	}, [chatStore.sessions.length]);

	// 执行深度研究（使用新的 Agent 系统）
	const performDeepResearch = async (query: string) => {
		if (!activeModel) {
			alert("请先在设置中配置并选择一个模型");
			return;
		}

		const session = chatStore.activeSession;
		if (!session) return;

		// 如果是第一条消息，生成标题
		if (session.messages.length === 0) {
			generateSessionTitle(session.id, query, activeModel);
		}

		// 添加用户消息到聊天
		const userMessage = createMessage("user", `[深度研究] ${query}`);
		chatStore.addMessage(session.id, userMessage);
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
				events.emit(EVENTS.AI_DOC_CREATE_END, protocol.eventPayload);
			}
			chatStore.setStatus("idle");
			setAbortController(null);
		} catch (error) {
			console.error("Agent 研究任务失败:", error);
			const rawErrorText = `⚠️ 研究任务失败: ${error instanceof Error ? error.message : "未知错误"}`;
			const protocol = parseDocProtocolFinal(rawErrorText, {
				activeDocContent: workspaceStore.getActiveDocContent() || "",
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
				events.emit(EVENTS.AI_DOC_CREATE_END, protocol.eventPayload);
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

	// 处理发送消息
	const handleSendMessage = async (
		content: string,
		command?: SlashCommand,
		options?: { skipUserMessage?: boolean },
	) => {
		if (!activeModel) {
			alert("请先在设置中配置并选择一个模型");
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

		if (chatMode === "agent") {
			// 绑定/创建后端 Agent Session（用于持久化与回放）
			let boundAgentSessionId: string | undefined = session.agentSessionId;
			try {
				if (boundAgentSessionId) {
					agentPersistence.setCurrentSessionId(boundAgentSessionId);
					await resumePersistentSession(boundAgentSessionId);
				} else {
					const agentSessionId = await startPersistentSession(session.title);
					chatStore.setSessionAgentSessionId(session.id, agentSessionId);
					boundAgentSessionId = agentSessionId;
				}
			} catch (e) {
				// 后端不可用时自动降级（仍可跑前端内存态 Agent）
				console.warn(
					"[CopilotSidebar] Agent Session 持久化初始化失败，将降级为本地执行",
					e,
				);
			}

			// 创建或获取用户消息
			let userMessage: ChatMessageType;
			if (!options?.skipUserMessage) {
				// 正常情况：创建新的用户消息
				userMessage = createMessage("user", content);
				chatStore.addMessage(session.id, userMessage);
				if (
					chatSettings.persistEnabled &&
					boundAgentSessionId &&
					!boundAgentSessionId.startsWith("local-")
				) {
					void persistChatMessageToAgentSession(
						boundAgentSessionId,
						userMessage,
					).then((record) => {
						if (record?.id) {
							chatStore.updateMessage(session.id, userMessage.id, {
								metadata: { agentMessageId: record.id },
							});
						}
					});
				}
			} else {
				// 重新生成：使用现有的最后一条用户消息
				const existingUserMsg = session.messages
					.filter((m) => m.role === "user")
					.pop();
				if (!existingUserMsg) {
					console.error("[CopilotSidebar] 重新生成时找不到用户消息");
					return;
				}
				userMessage = existingUserMsg;
			}
			chatStore.setStatus("streaming");

			let detachAgentEvent: (() => void) | null = null;
			let currentTaskId: string | null = null;
			const insertedToolCallIds = new Set<string>();
			let insertedTaskList = false;
			let lastThought = "";

			// Track which message contains which tool call, so we can update it later
			const toolCallMessageMap = new Map<string, string>(); // toolCallId -> messageId

			const persistTraceMessageIfNeeded = (message: ChatMessageType) => {
				if (
					!(
						chatSettings.persistEnabled &&
						chatSettings.persistTraceEnabled &&
						boundAgentSessionId &&
						!boundAgentSessionId.startsWith("local-")
					)
				) {
					return;
				}
				void persistChatMessageToAgentSession(
					boundAgentSessionId,
					message,
				).then((record) => {
					if (record?.id) {
						chatStore.updateMessage(session.id, message.id, {
							metadata: { agentMessageId: record.id },
						});
					}
				});
			};

			const pushTraceBlocks = (blocks: ChatMessageBlock[]) => {
				const traceMsg = createMessage("trace", "", {
					metadata: { blocks },
				});

				// Track tool calls for future updates
				blocks.forEach((b) => {
					if (b.type === "tool_call") {
						toolCallMessageMap.set(b.toolCallId, traceMsg.id);
					}
				});

				chatStore.addMessage(session.id, traceMsg);
				persistTraceMessageIfNeeded(traceMsg);
			};

			const ensureTaskListVisible = (taskId: string) => {
				if (insertedTaskList) return;
				const steps = agentStore.getState().currentTask?.steps || [];
				if (!steps || steps.length === 0) return;
				pushTraceBlocks([{ type: "task_list", taskId }]);
				insertedTaskList = true;
			};

			detachAgentEvent = agentStore.onEvent((event) => {
				if (event.type === "task_started") {
					currentTaskId = event.task.id;
					if (!chatSettings.inlineTraceEnabled) {
						const traceMsg = createMessage("trace", "", {
							metadata: {
								trace: { type: "agent_task", taskId: event.task.id },
							},
						});
						traceMsg.metadata = {
							...traceMsg.metadata,
							blocks: encodeChatMessageToAgentContentJson(traceMsg).blocks,
						};
						chatStore.addMessage(session.id, traceMsg);
						persistTraceMessageIfNeeded(traceMsg);
						return;
					}
					return;
				}

				if (!chatSettings.inlineTraceEnabled) return;

				if (event.type === "task_updated") {
					if (event.taskId) ensureTaskListVisible(event.taskId);
					return;
				}

				if (event.type === "thought") {
					ensureTaskListVisible(event.taskId);
					const content = event.thought?.content || "";
					if (!content.trim() || content === lastThought) return;
					lastThought = content;
					pushTraceBlocks([
						{
							type: "thought",
							title: "思考",
							content,
							phase: event.thought.type,
						},
					]);
					return;
				}

				if (event.type === "tool_started") {
					console.log("[CopilotSidebar] Received tool_started event:", {
						taskId: event.taskId,
						toolCallId: event.toolCall?.id,
						toolName: event.toolCall?.name,
						inlineTraceEnabled: chatSettings.inlineTraceEnabled,
					});
					ensureTaskListVisible(event.taskId);
					const toolCallId = event.toolCall?.id;
					if (!toolCallId || insertedToolCallIds.has(toolCallId)) return;
					insertedToolCallIds.add(toolCallId);
					pushTraceBlocks([
						{
							type: "tool_call",
							taskId: event.taskId,
							toolCallId,
							name: event.toolCall?.name,
							status: event.toolCall?.status,
							// Initial/Pending tool call doesn't have output/error yet
						},
					]);
					return;
				}

				// Handle tool completion/error to update the UI
				if (event.type === "tool_completed" || event.type === "tool_error") {
					const toolCallId = event.toolCallId;
					const msgId = toolCallMessageMap.get(toolCallId);

					if (msgId) {
						// Use globalChatStore to get the latest state during async execution
						const s = globalChatStore.getActiveSession();
						const m = s?.messages.find((x) => x.id === msgId);

						if (m && m.metadata?.blocks) {
							const newBlocks = m.metadata.blocks.map((b) => {
								if (b.type === "tool_call" && b.toolCallId === toolCallId) {
									if (event.type === "tool_completed") {
										return {
											...b,
											status: "completed" as const,
											output: event.result.data,
										};
									} else {
										return {
											...b,
											status: "error" as const,
											error: event.error,
										};
									}
								}
								return b;
							});

							chatStore.updateMessage(session.id, msgId, {
								metadata: { ...m.metadata, blocks: newBlocks },
							});
						}
					}
				}
			});

			try {
				let systemPrompt = await getChatSystemPrompt(
					workspaceStore.getActiveDocContent() || "",
				);
				systemPrompt += `\n\n注意：当前是对话任务。即使文档为空，只要用户在询问信息/要求搜索，也应优先完成检索与回答；不要因为“空文档”而拒绝执行。`;
				// 强制使用中文回复
				systemPrompt += `\n\n【重要】请始终使用中文回复用户。所有的思考、分析、总结和输出都必须使用中文。`;
				const conversationContext = buildAgentConversationContext(
					[...session.messages, userMessage],
					content,
				);
				const fallbackSearchQuery = guessFallbackSearchQuery([
					...session.messages,
					userMessage,
				]);
				// 获取用户附加的上下文（文档、资料等）
				// 如果有 sourceId 但 content 为空，尝试重新加载
				const contexts = workspaceStore.getState().contexts;
				const attachedContexts: Array<{ title: string; content: string }> = [];
				const attachedFiles: Array<{ title: string; path: string }> = []; // 临时文件路径

				for (const ctx of contexts) {
					let content = ctx.content;

					// 如果资料内容为空，尝试加载
					if (!content && ctx.sourceId) {
						try {
							const { getSourceDetail } = await import("../lib/api");
							const detail = await getSourceDetail(ctx.sourceId);
							content = detail.note?.content || detail.source.description || "";
							console.log(
								"[CopilotSidebar] 加载资料内容:",
								ctx.title,
								content.slice(0, 100),
							);
						} catch (err) {
							console.error("[CopilotSidebar] 加载资料内容失败:", err);
						}
					}

					if (content) {
						// 如果内容较大（超过2000字符），保存为临时文件
						if (content.length > 2000) {
							try {
								const { saveTempFile } = await import("../lib/api");
								const fileResult = await saveTempFile({
									content,
									extension: "txt",
									prefix: ctx.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20),
								});
								attachedFiles.push({
									title: ctx.title,
									path: fileResult.path,
								});
								console.log(
									"[CopilotSidebar] 文档已保存为临时文件:",
									fileResult.path,
								);
							} catch (err) {
								console.error(
									"[CopilotSidebar] 保存临时文件失败，回退到直接传递内容:",
									err,
								);
								attachedContexts.push({
									title: ctx.title,
									content,
								});
							}
						} else {
							attachedContexts.push({
								title: ctx.title,
								content,
							});
						}
					}
				}

				// 为 Skill 执行创建流式消息（在 executeCustomTask 之前）
				let streamingMsgId: string | null = null;
				let accumulatedSkillContent = "";
				let lastUpdateTime = 0;
				let pendingUpdate = false;

				const buildSkillBlocks = () => {
					const blocks: any[] = [];
					if (accumulatedSkillContent.trim()) {
						blocks.push({ type: "text", text: accumulatedSkillContent });
					}
					const currentSkill = agentStore.getState().currentSkill;
					if (currentSkill) {
						blocks.push({
							type: "skill_execution",
							skillName: currentSkill.skillName,
							skillPath: currentSkill.skillPath,
							status: currentSkill.status,
							steps: currentSkill.steps,
							loadedFiles: currentSkill.loadedFiles,
							detectedScene: currentSkill.detectedScene,
						});
					}
					return blocks;
				};

				const updateStreamingMessage = () => {
					if (streamingMsgId) {
						chatStore.updateMessage(session.id, streamingMsgId, {
							content: accumulatedSkillContent,
							metadata: {
								blocks: buildSkillBlocks(),
							},
						});
					}
					pendingUpdate = false;
				};

				const onChunk = (chunk: string) => {
					accumulatedSkillContent += chunk;
					if (!streamingMsgId) {
						// 第一个 chunk 时创建消息
						const streamingMsg = createMessage(
							"assistant",
							accumulatedSkillContent,
							{
								isStreaming: true,
								model: activeModel,
								metadata: {
									blocks: buildSkillBlocks(),
								},
							},
						);
						streamingMsgId = streamingMsg.id;
						chatStore.addMessage(session.id, streamingMsg);
						lastUpdateTime = Date.now();
					} else {
						// 节流更新：每 100ms 最多更新一次
						const now = Date.now();
						if (now - lastUpdateTime >= 100) {
							updateStreamingMessage();
							lastUpdateTime = now;
						} else if (!pendingUpdate) {
							pendingUpdate = true;
							setTimeout(
								() => {
									if (pendingUpdate) {
										updateStreamingMessage();
										lastUpdateTime = Date.now();
									}
								},
								100 - (now - lastUpdateTime),
							);
						}
					}
				};

				await agentExecutor.executeCustomTask(
					content,
					systemPrompt,
					undefined,
					{
						conversationContext,
						fallbackSearchQuery,
						activeDocContent: workspaceStore.getActiveDocContent() || "",
						attachedContexts,
						attachedFiles, // 传递文件路径
						onChunk, // 流式输出回调
					},
				);

				// 如果有流式消息，更新最终内容并标记为完成
				if (streamingMsgId) {
					// 确保最终内容完整显示
					chatStore.updateMessage(session.id, streamingMsgId, {
						content: accumulatedSkillContent,
						isStreaming: false,
						metadata: {
							blocks: buildSkillBlocks(),
						},
					});
				}

				const finalState = agentStore.getState();

				// 检查任务是否失败（LLM API 错误等会导致 failTask 被调用）
				if (finalState.currentTask?.status === "error") {
					const taskError = finalState.currentTask.error || "任务执行失败";
					throw new Error(taskError);
				}

				const rawResult =
					finalState.currentTask?.result || "任务已完成，但未能生成结果";
				const protocol = parseDocProtocolFinal(rawResult, {
					activeDocContent: workspaceStore.getActiveDocContent() || "",
					prompt: command?.name || content.slice(0, 50),
				});
				const result = protocol.displayContent;

				// 任务完成后尝试把最终摘要写回后端 task
				try {
					const currentTask = finalState.currentTask;
					const backendTaskId = (currentTask?.metadata as any)?.backendTaskId as
						| string
						| undefined;
					if (backendTaskId && boundAgentSessionId) {
						await (await import("../lib/agent/api")).updateAgentTask(
							backendTaskId,
							{
								status: "succeeded",
								result_summary: result,
							},
						);
					}
				} catch (e) {
					console.warn("[CopilotSidebar] 更新后端 Agent task 结果失败", e);
				}

				// 如果是 Skill 执行（已通过 onChunk 创建了流式消息），跳过创建新消息
				if (!streamingMsgId) {
					const assistantMessage = createMessage("assistant", result, {
						isStreaming: false,
						model: activeModel,
						metadata:
							protocol.kind === "create" || protocol.kind === "update"
								? { fileUpdates: [protocol.fileUpdate] }
								: undefined,
					});

					const finalSkillState = agentStore.getState().currentSkill;
					const skillBlocks = finalSkillState
						? [
								{
									type: "skill_execution" as const,
									skillName: finalSkillState.skillName,
									skillPath: finalSkillState.skillPath,
									status: finalSkillState.status,
									steps: finalSkillState.steps,
									loadedFiles: finalSkillState.loadedFiles,
									detectedScene: finalSkillState.detectedScene,
								},
							]
						: [];

					const baseBlocks: any[] = [
						...(assistantMessage.content.trim()
							? [{ type: "text" as const, text: assistantMessage.content }]
							: []),
						...skillBlocks,
					];

					// 成功时也把工具调用轨迹挂到消息 blocks，方便用户端直接看到 code_execute 等执行情况
					if (currentTaskId) {
						const toolCalls = finalState.currentTask?.toolCalls || [];
						const toolCallBlocks = toolCalls.map((tc) => ({
							type: "tool_call" as const,
							taskId: currentTaskId,
							toolCallId: tc.id,
							name: tc.name,
							status: tc.status,
						}));

						const imageBlocks = toolCalls
							.flatMap((tc) => {
								const output = tc.output as any;
								const paths = Array.isArray(output?.image_paths)
									? (output.image_paths as string[])
									: [];
								return paths
									.filter((p) => typeof p === "string" && p.trim().length > 0)
									.map((p) => ({
										type: "image" as const,
										path: p,
										title: tc.name || "图片",
									}));
							})
							.filter((b) => !!b.path);

						// 去重，避免多次收集同一张图
						const uniqueImageBlocks: typeof imageBlocks = [];
						const seenImg = new Set<string>();
						for (const b of imageBlocks) {
							if (seenImg.has(b.path)) continue;
							seenImg.add(b.path);
							uniqueImageBlocks.push(b);
						}
						const fileUpdateBlocks = Array.isArray(
							(assistantMessage.metadata as any)?.fileUpdates,
						)
							? (assistantMessage.metadata as any).fileUpdates.map(
									(update: any) => ({ type: "file_update" as const, update }),
								)
							: [];
						assistantMessage.metadata = {
							...(assistantMessage.metadata || {}),
							...(chatSettings.inlineTraceEnabled
								? {}
								: { trace: { type: "agent_task", taskId: currentTaskId } }),
							blocks: [
								...baseBlocks,
								...uniqueImageBlocks,
								...(chatSettings.inlineTraceEnabled ? [] : toolCallBlocks),
								...fileUpdateBlocks,
							],
						};
					} else if (baseBlocks.length > 0) {
						assistantMessage.metadata = {
							...(assistantMessage.metadata || {}),
							blocks: baseBlocks,
						};
					}
					chatStore.addMessage(session.id, assistantMessage);
					if (protocol.kind === "update") {
						events.emit(EVENTS.AI_DOC_UPDATE_END, protocol.eventPayload);
					} else if (protocol.kind === "create") {
						events.emit(EVENTS.AI_DOC_CREATE_END, protocol.eventPayload);
					}
					if (
						chatSettings.persistEnabled &&
						boundAgentSessionId &&
						!boundAgentSessionId.startsWith("local-")
					) {
						void persistChatMessageToAgentSession(
							boundAgentSessionId,
							assistantMessage,
						).then((record) => {
							if (record?.id) {
								chatStore.updateMessage(session.id, assistantMessage.id, {
									metadata: { agentMessageId: record.id },
								});
							}
						});
					}
				}
				chatStore.setStatus("idle");
				// 任务完成后清除附件
				workspaceStore.clearContexts();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "未知错误";
				const taskId = currentTaskId || null;
				const errorState = agentStore.getState();
				const assistantMessage = createMessage(
					"assistant",
					`⚠️ Agent 执行失败: ${errorMessage}`,
					{
						isStreaming: false,
						model: activeModel,
						metadata:
							taskId && !chatSettings.inlineTraceEnabled
								? { trace: { type: "agent_task", taskId } }
								: undefined,
					},
				);
				if (taskId && chatSettings.inlineTraceEnabled) {
					const fileUpdateBlocks = Array.isArray(
						(assistantMessage.metadata as any)?.fileUpdates,
					)
						? (assistantMessage.metadata as any).fileUpdates.map(
								(update: any) => ({ type: "file_update" as const, update }),
							)
						: [];
					assistantMessage.metadata = {
						...(assistantMessage.metadata || {}),
						blocks: [
							...(assistantMessage.content.trim()
								? [{ type: "text" as const, text: assistantMessage.content }]
								: []),
							...fileUpdateBlocks,
						],
					};
				}
				if (assistantMessage.metadata) {
					const trace = assistantMessage.metadata.trace;
					const taskIdForBlocks =
						trace?.type === "agent_task" ? trace.taskId : undefined;
					if (taskIdForBlocks) {
						const toolCalls = errorState.currentTask?.toolCalls || [];
						const toolCallBlocks = toolCalls.map((tc) => ({
							type: "tool_call" as const,
							taskId: taskIdForBlocks,
							toolCallId: tc.id,
							name: tc.name,
							status: tc.status,
						}));
						const fileUpdateBlocks = Array.isArray(
							assistantMessage.metadata.fileUpdates,
						)
							? assistantMessage.metadata.fileUpdates.map((update) => ({
									type: "file_update" as const,
									update,
								}))
							: [];
						assistantMessage.metadata = {
							...assistantMessage.metadata,
							blocks: [
								...(assistantMessage.content.trim()
									? [{ type: "text" as const, text: assistantMessage.content }]
									: []),
								...toolCallBlocks,
								...fileUpdateBlocks,
							],
						};
					} else {
						assistantMessage.metadata = {
							...assistantMessage.metadata,
							blocks:
								encodeChatMessageToAgentContentJson(assistantMessage).blocks,
						};
					}
				}
				chatStore.addMessage(session.id, assistantMessage);
				if (
					chatSettings.persistEnabled &&
					boundAgentSessionId &&
					!boundAgentSessionId.startsWith("local-")
				) {
					void persistChatMessageToAgentSession(
						boundAgentSessionId,
						assistantMessage,
					).then((record) => {
						if (record?.id) {
							chatStore.updateMessage(session.id, assistantMessage.id, {
								metadata: { agentMessageId: record.id },
							});
						}
					});
				}
				chatStore.setStatus("error", errorMessage);
			} finally {
				if (detachAgentEvent) {
					detachAgentEvent();
					detachAgentEvent = null;
				}
			}

			return;
		}

		// 构建系统提示词 - 使用可配置的提示词
		let systemPrompt = await getChatSystemPrompt(
			workspaceStore.getActiveDocContent() || "",
		);

		const isWriteMode = command?.category === "skill";
		if (isWriteMode) {
			systemPrompt += `\n\n用户请求你帮助写作或编辑内容，请优先考虑使用上述协议格式输出。`;
		}

		// 添加用户消息（只有在非重新生成时）
		if (!options?.skipUserMessage) {
			const userMessage = createMessage(
				"user",
				command ? `[${command.name}] ${content}` : content,
			);
			chatStore.addMessage(session.id, userMessage);
		}

		// 创建 AI 消息
		const assistantMessage = createMessage("assistant", "", {
			isStreaming: true,
			model: activeModel,
		});
		chatStore.addMessage(session.id, assistantMessage);
		chatStore.setStatus("streaming");

		// 创建 abort controller
		const controller = new AbortController();
		setAbortController(controller);

		let accumulatedContent = "";
		let isUpdatingDoc = false;
		let isCreatingDoc = false;
		let docContentBuffer = "";

		// 组装最近消息上下文（最多取最近 8 条用户/助手消息）
		const recentMessages = session.messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.slice(-8)
			.map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`)
			.filter(Boolean);

		const contextTexts = [
			...recentMessages,
			...workspaceStore.getContextText(),
		];

		await invokeLlmWithCallback({
			model: activeModel,
			prompt: content,
			systemPrompt,
			context: contextTexts,
			onChunk: (chunk: string) => {
				accumulatedContent += chunk;

				// 检测 AI 协议标记
				if (!isUpdatingDoc && !isCreatingDoc) {
					if (accumulatedContent.includes(":::update-doc")) {
						isUpdatingDoc = true;
						events.emit(EVENTS.AI_DOC_UPDATE_START, {});
						console.log("[CopilotSidebar] AI 开始修改文档");
					} else if (accumulatedContent.includes(":::create-doc")) {
						isCreatingDoc = true;
						events.emit(EVENTS.AI_DOC_CREATE_START, {});
						console.log("[CopilotSidebar] AI 开始创建新文档");
					}
				}

				// 收集文档内容
				if (isUpdatingDoc || isCreatingDoc) {
					// 提取标记之间的内容
					const startMarker = isUpdatingDoc ? ":::update-doc" : ":::create-doc";
					const startIndex = accumulatedContent.indexOf(startMarker);
					if (startIndex !== -1) {
						const contentAfterMarker = accumulatedContent.slice(
							startIndex + startMarker.length,
						);
						const endIndex = contentAfterMarker.indexOf(":::");
						if (endIndex !== -1) {
							// 找到结束标记
							docContentBuffer = contentAfterMarker.slice(0, endIndex).trim();

							// 触发完成事件
							if (isUpdatingDoc) {
								// 计算 Diff 统计
								const originalContent =
									workspaceStore.getActiveDocContent() || "";
								const changes = diffLines(originalContent, docContentBuffer);
								let additions = 0;
								let deletions = 0;
								changes.forEach((part) => {
									if (part.added) additions += part.count || 0;
									if (part.removed) deletions += part.count || 0;
								});

								// 获取文档标题
								const state = workspaceStore.getState();
								const docTitle =
									(state.activeDocId &&
										state.docCache[state.activeDocId]?.title) ||
									"当前文档";

								// 更新消息 metadata
								chatStore.updateMessage(session.id, assistantMessage.id, {
									metadata: {
										fileUpdates: [
											{
												fileName: docTitle,
												type: "update",
												additions,
												deletions,
											},
										],
									},
								});

								events.emit(EVENTS.AI_DOC_UPDATE_END, {
									originalContent: workspaceStore.getActiveDocContent(),
									suggestedContent: docContentBuffer,
									prompt: command?.name || content.slice(0, 50),
								});
								console.log("[CopilotSidebar] AI 完成文档修改");
							} else if (isCreatingDoc) {
								// 解析 create-doc 内容
								const lines = docContentBuffer.split("\n");
								let title = "新文档";
								let summary = "";
								let docContent = docContentBuffer;

								for (let i = 0; i < lines.length; i++) {
									const line = lines[i].trim();
									if (line.startsWith("标题:") || line.startsWith("标题：")) {
										title = line.replace(/^标题[:：]\s*/, "");
									} else if (
										line.startsWith("摘要:") ||
										line.startsWith("摘要：")
									) {
										summary = line.replace(/^摘要[:：]\s*/, "");
									} else if (
										line.startsWith("内容:") ||
										line.startsWith("内容：")
									) {
										docContent = lines
											.slice(i + 1)
											.join("\n")
											.trim();
										break;
									}
								}

								// 计算 Diff (全部新增)
								const changes = diffLines("", docContent);
								let additions = 0;
								changes.forEach((part) => {
									if (part.added) additions += part.count || 0;
								});

								// 更新消息 metadata
								chatStore.updateMessage(session.id, assistantMessage.id, {
									metadata: {
										fileUpdates: [
											{
												fileName: title,
												type: "create",
												additions,
												deletions: 0,
											},
										],
									},
								});

								events.emit(EVENTS.AI_DOC_CREATE_END, {
									title,
									summary,
									content: docContent,
									prompt: command?.name || content.slice(0, 50),
								});
								console.log("[CopilotSidebar] AI 完成新文档创建");
							}

							isUpdatingDoc = false;
							isCreatingDoc = false;
						} else {
							// 还没有结束标记，继续收集
							docContentBuffer = contentAfterMarker.trim();
							if (isUpdatingDoc) {
								events.emit(EVENTS.AI_DOC_UPDATE_STREAM, docContentBuffer);
							}
						}
					}
				}

				// 更新聊天消息（隐藏协议标记，使用特殊占位符）
				let displayContent = accumulatedContent;

				// 处理 update-doc 协议
				// 1. 如果正在更新，显示 PENDING
				if (isUpdatingDoc) {
					const startIdx = accumulatedContent.indexOf(":::update-doc");
					if (startIdx !== -1) {
						// 保留协议前的内容 + 正在修改的占位符
						displayContent =
							accumulatedContent.slice(0, startIdx) +
							"\n<<<AI_UPDATE_PENDING>>>";
					}
				}
				// 2. 如果正在创建，显示 PENDING
				else if (isCreatingDoc) {
					const startIdx = accumulatedContent.indexOf(":::create-doc");
					if (startIdx !== -1) {
						// 保留协议前的内容 + 正在创建的占位符
						displayContent =
							accumulatedContent.slice(0, startIdx) +
							"\n<<<AI_CREATE_PENDING>>>";
					}
				}
				// 3. 如果协议已完成，将协议块替换为 DONE 占位符（保留前后文本）
				else {
					displayContent = displayContent
						.replace(/:::update-doc[\s\S]*?:::/g, "\n<<<AI_UPDATE_DONE>>>\n")
						.replace(/:::create-doc[\s\S]*?:::/g, "\n<<<AI_CREATE_DONE>>>\n");

					// 清理可能的残留
					if (
						displayContent.includes(":::update-doc") ||
						displayContent.includes(":::create-doc")
					) {
						displayContent = displayContent
							.replace(/:::update-doc[\s\S]*/g, "\n<<<AI_UPDATE_PENDING>>>")
							.replace(/:::create-doc[\s\S]*/g, "\n<<<AI_CREATE_PENDING>>>");
					}
				}

				chatStore.updateMessage(session.id, assistantMessage.id, {
					content: displayContent,
				});
			},
			onComplete: () => {
				setAbortController(null);
				// 兜底处理：如果流结束时仍在修改/创建文档状态（例如结束标记不完整）
				if (isUpdatingDoc || isCreatingDoc) {
					console.log(
						"[CopilotSidebar] 流结束但状态仍为 processing，执行兜底处理",
					);

					// 尝试提取内容
					const startMarker = isUpdatingDoc ? ":::update-doc" : ":::create-doc";
					const startIdx = accumulatedContent.indexOf(startMarker);

					if (startIdx !== -1) {
						// 截取从标记开始到末尾的内容
						let content = accumulatedContent.slice(
							startIdx + startMarker.length,
						);
						// 去除末尾可能的未完成标记 (如 ":" 或 "::")
						content = content.replace(/(:+)$/, "").trim();
						docContentBuffer = content;

						// 执行完成逻辑
						if (isUpdatingDoc) {
							// ... (保持原有的 diff 和 metadata 逻辑) ...
							const originalContent =
								workspaceStore.getActiveDocContent() || "";
							const changes = diffLines(originalContent, docContentBuffer);
							let additions = 0;
							let deletions = 0;
							changes.forEach((part) => {
								if (part.added) additions += part.count || 0;
								if (part.removed) deletions += part.count || 0;
							});

							const state = workspaceStore.getState();
							const docTitle =
								(state.activeDocId &&
									state.docCache[state.activeDocId]?.title) ||
								"当前文档";

							chatStore.updateMessage(session.id, assistantMessage.id, {
								metadata: {
									fileUpdates: [
										{
											fileName: docTitle,
											type: "update",
											additions,
											deletions,
										},
									],
								},
							});

							events.emit(EVENTS.AI_DOC_UPDATE_END, {
								originalContent: workspaceStore.getActiveDocContent(),
								suggestedContent: docContentBuffer,
								prompt: command?.name || content.slice(0, 50),
							});
						} else if (isCreatingDoc) {
							// ... (保持原有的 create 逻辑) ...
							const lines = docContentBuffer.split("\n");
							let title = "新文档";
							let summary = "";
							let docContent = docContentBuffer;

							for (let i = 0; i < lines.length; i++) {
								const line = lines[i].trim();
								if (line.startsWith("标题:") || line.startsWith("标题：")) {
									title = line.replace(/^标题[:：]\s*/, "");
								} else if (
									line.startsWith("摘要:") ||
									line.startsWith("摘要：")
								) {
									summary = line.replace(/^摘要[:：]\s*/, "");
								} else if (
									line.startsWith("内容:") ||
									line.startsWith("内容：")
								) {
									docContent = lines
										.slice(i + 1)
										.join("\n")
										.trim();
									break;
								}
							}

							const changes = diffLines("", docContent);
							let additions = 0;
							changes.forEach((part) => {
								if (part.added) additions += part.count || 0;
							});

							chatStore.updateMessage(session.id, assistantMessage.id, {
								metadata: {
									fileUpdates: [
										{
											fileName: title,
											type: "create",
											additions,
											deletions: 0,
										},
									],
								},
							});

							events.emit(EVENTS.AI_DOC_CREATE_END, {
								title,
								summary,
								content: docContent,
								prompt: command?.name || content.slice(0, 50),
							});
						}
					}
				}

				// 最终清理消息内容，替换所有协议内容为 DONE 占位符
				let finalContent = accumulatedContent;

				// 1. 将完整的协议块替换为 DONE 占位符
				finalContent = finalContent
					.replace(/:::update-doc[\s\S]*?:::?/g, "\n<<<AI_UPDATE_DONE>>>\n")
					.replace(/:::create-doc[\s\S]*?:::?/g, "\n<<<AI_CREATE_DONE>>>\n");

				// 2. 清理可能的未闭合残留（兜底）
				finalContent = finalContent
					.replace(/:::update-doc[\s\S]*/g, "\n<<<AI_UPDATE_DONE>>>\n")
					.replace(/:::create-doc[\s\S]*/g, "\n<<<AI_CREATE_DONE>>>\n");

				chatStore.updateMessage(session.id, assistantMessage.id, {
					content: finalContent,
					isStreaming: false,
				});
				chatStore.setStatus("idle");

				// 调试：打印 AI 完整响应
				console.log("[CopilotSidebar] AI 完整响应:", accumulatedContent);

				// 兼容旧的写入协议
				const { writeContent } = parseWriteContent(accumulatedContent);
				if (writeContent && !isUpdatingDoc && !isCreatingDoc) {
					const editorContent = workspaceStore.getActiveDocContent();
					events.emit(EVENTS.AI_WRITE_TO_OUTPUT, {
						content: editorContent
							? editorContent + "\n\n" + writeContent
							: writeContent,
						originalContent: editorContent,
						prompt: command?.name || "AI 写作",
						type: "diff",
					});
				}
			},
			onError: (error: string) => {
				setAbortController(null);
				chatStore.updateMessage(session.id, assistantMessage.id, {
					content: `⚠️ 错误: ${error}`,
					isStreaming: false,
				});
				chatStore.setStatus("error", error);
			},
			onUsage: (usage) => {
				// 将 token 使用数据保存到消息 metadata
				console.log("[CopilotSidebar] 收到 token usage:", usage);
				chatStore.updateMessage(session.id, assistantMessage.id, {
					metadata: {
						tokenUsage: {
							promptTokens: usage.promptTokens,
							completionTokens: usage.completionTokens,
							totalTokens: usage.totalTokens,
						},
					},
				});
			},
		});
	};

	// 处理快捷操作
	const handleQuickAction = (action: QuickAction) => {
		if (action.isResearch) {
			// 显示输入框让用户输入研究主题
			const topic = prompt("请输入要研究的主题：");
			if (topic) {
				performDeepResearch(topic);
			}
		} else {
			handleSendMessage(action.prompt, undefined);
		}
	};

	// 新建对话
	const handleNewSession = () => {
		chatStore.createNewSession();
		setIsHistoryOpen(false);
	};

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
			handleSendMessage(userMessageContent, undefined, {
				skipUserMessage: true,
			});
		},
		[chatStore.activeSession, handleSendMessage],
	);

	const messages = chatStore.activeSession?.messages || [];
	const isStreaming = chatStore.status === "streaming";

	return (
		<aside
			data-copilot-sidebar
			className="flex flex-col h-full font-sans relative bg-white dark:bg-zinc-900"
			{...dropZoneProps}
		>
			{/* 拖拽资料到 AI 对话的视觉提示 */}
			{showDropIndicator && (
				<div
					className={`absolute inset-0 z-[100] pointer-events-none flex items-center justify-center border-2 border-dashed rounded-xl backdrop-blur-[1px] transition-colors ${isMouseDragOver ? "bg-blue-500/10 border-blue-400" : "bg-zinc-500/5 border-zinc-300"}`}
				>
					<div className="bg-white dark:bg-zinc-800 px-4 py-3 rounded-xl shadow-lg border border-blue-200 dark:border-blue-700 flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
							<Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
								添加到 AI 上下文
							</p>
							<p className="text-xs text-zinc-500 dark:text-zinc-400">
								{isMouseDragOver
									? "松开鼠标将资料添加到对话"
									: "将资料拖拽到此处"}
							</p>
						</div>
					</div>
				</div>
			)}
			{/* 历史记录面板 */}
			{isHistoryOpen && (
				<div className="absolute inset-0 z-50 bg-white dark:bg-zinc-900">
					<ChatHistory
						sessions={chatStore.sessions}
						activeSessionId={chatStore.activeSessionId}
						onSelectSession={(id) => {
							chatStore.setActiveSession(id);
							setIsHistoryOpen(false);
						}}
						onDeleteSession={chatStore.deleteSession}
						onNewSession={handleNewSession}
						onClose={() => setIsHistoryOpen(false)}
					/>
				</div>
			)}

			{/* Header - 极简风格，移除底部边框 */}
			<div className="px-4 py-4 flex items-center justify-between shrink-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm z-10">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 dark:from-zinc-100 dark:to-zinc-300 flex items-center justify-center shadow-sm">
						<Sparkles className="w-4 h-4 text-white dark:text-zinc-900" />
					</div>
					<div>
						<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 tracking-tight">
							AI 助手
						</h2>
						{isAgentExecuting ? (
							<span className="flex items-center gap-1 text-[10px] text-indigo-500 font-medium animate-pulse">
								<Loader2 className="w-2.5 h-2.5 animate-spin" />
								{agentCurrentTask?.type === "research"
									? "正在深度研究"
									: "Agent 执行中"}
							</span>
						) : null}
					</div>
				</div>
				<div className="flex items-center gap-1">
					<button
						onClick={handleNewSession}
						className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-95"
						title="新建对话"
					>
						<Plus className="w-4.5 h-4.5" />
					</button>
					<button
						onClick={() => setIsHistoryOpen(true)}
						className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-95"
						title="对话历史"
					>
						<History className="w-4.5 h-4.5" />
					</button>
				</div>
			</div>

			{pendingRequests.size > 0 && (
				<div className="px-4 pb-3 shrink-0">
					<div className="rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-3">
						<div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">
							需要授权才能继续执行工具（例如联网搜索）
						</div>
						<PermissionList
							requests={Array.from(pendingRequests.values()).map(
								(p) => p.request,
							)}
							onRespond={respondToPermission}
						/>
					</div>
				</div>
			)}

			{/* Messages */}
			<div
				ref={scrollContainerRef}
				onScroll={updateAutoScrollState}
				className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide"
			>
				{messages.length === 0 ? (
					<div className="flex flex-col h-full">
						{/* 欢迎区域 */}
						<div className="flex flex-col items-center text-center py-8">
							<div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
								<Bot className="w-8 h-8 text-zinc-500" />
							</div>
							<h3 className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">
								有什么可以帮您的？
							</h3>
							<p className="text-sm text-zinc-400 max-w-[200px]">
								我可以帮您深度研究、分析资料、撰写内容
							</p>
						</div>

						{/* 快捷操作 */}
						<div className="mt-auto space-y-2">
							<p className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-1">
								快捷操作
							</p>
							<div className="grid grid-cols-2 gap-2">
								{quickActions.map((action) => (
									<button
										key={action.id}
										onClick={() => handleQuickAction(action)}
										disabled={isStreaming || isAgentExecuting}
										className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-left transition-colors group disabled:opacity-50"
									>
										<div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors shadow-sm">
											<action.icon className="w-4 h-4" />
										</div>
										<span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 transition-colors">
											{action.label}
										</span>
									</button>
								))}
							</div>
						</div>

						{/* 研究进度提示 */}
						{currentResearch && currentResearch.status !== "completed" && (
							<div className="mt-4 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
								<div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
									<Loader2 className="w-4 h-4 animate-spin" />
									<span>正在进行深度研究...</span>
								</div>
								<button
									onClick={() => workspaceStore.setLeftSidebarView("research")}
									className="mt-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
								>
									查看研究进度 →
								</button>
							</div>
						)}
					</div>
				) : (
					<>
						{messages.map((msg) => (
							<ChatMessageComponent
								key={msg.id}
								message={msg}
								preferBlocks={chatSettings.blocksFirstEnabled}
								onRegenerate={
									!isStreaming && !isAgentExecuting && msg.role === "assistant"
										? handleRegenerateMessage
										: undefined
								}
							/>
						))}
						{/* 等待 AI 响应的提示 */}
						{isWaitingForLLM && chatMode === "agent" && (
							<div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
								<div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
									<Bot className="w-4 h-4 text-white" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="inline-flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl border border-blue-100 dark:border-blue-800/50 shadow-sm">
										<div className="relative flex items-center justify-center">
											<div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
											<div className="absolute w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
										</div>
										<div className="flex flex-col">
											<span className="text-sm font-medium text-blue-600 dark:text-blue-400">
												正在思考中...
											</span>
											<span className="text-xs text-blue-500/70 dark:text-blue-400/60">
												AI 正在分析您的请求
											</span>
										</div>
										<div className="flex gap-1 ml-2">
											<span
												className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
												style={{ animationDelay: "0ms" }}
											/>
											<span
												className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
												style={{ animationDelay: "150ms" }}
											/>
											<span
												className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
												style={{ animationDelay: "300ms" }}
											/>
										</div>
									</div>
								</div>
							</div>
						)}
						{/* 智能Agent思考过程展示 */}
						{(isAgentExecuting || thinkingSteps.length > 0) &&
							chatMode === "agent" &&
							!chatSettings.inlineTraceEnabled && (
								<div className="mb-4">
									<ThinkingProcessCompact
										steps={thinkingSteps}
										isActive={isAgentExecuting}
									/>
								</div>
							)}
						<div ref={messagesEndRef} />
					</>
				)}
			</div>

			{/* Input */}
			<div className="p-4 pt-2 relative">
				{/* 模型选择器 */}
				{isModelMenuOpen && (
					<ModelSelector
						models={enabledModels}
						activeModel={activeModel}
						onSelect={(modelId) => settingsStore.setActiveModel(modelId)}
						onClose={() => setIsModelMenuOpen(false)}
					/>
				)}

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
							className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl transition-colors text-sm font-medium"
						>
							<StopCircle className="w-4 h-4" />
							停止响应
						</button>
					</div>
				)}

				<div className="mb-2 flex items-center justify-between">
					<div className="inline-flex items-center bg-zinc-100/70 dark:bg-zinc-800/70 rounded-2xl p-1 ring-1 ring-black/5 dark:ring-white/5">
						<button
							onClick={() => setChatMode("chat")}
							className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors ${
								chatMode === "chat"
									? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
									: "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
							}`}
						>
							对话
						</button>
						<button
							onClick={() => setChatMode("agent")}
							className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors ${
								chatMode === "agent"
									? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
									: "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
							}`}
						>
							Agent
						</button>
					</div>

					<div className="text-[11px] text-zinc-400">
						{chatMode === "agent" ? "工具调用" : "普通对话"}
					</div>
				</div>

				<ChatInput
					onSubmit={handleSendMessage}
					disabled={isStreaming || isAgentExecuting}
					placeholder={
						isAgentExecuting
							? agentCurrentTask?.type === "research"
								? "研究进行中..."
								: "Agent 执行中..."
							: chatMode === "agent"
								? "Agent 模式：描述目标，我会自动调用工具..."
								: "输入消息，或用 / 唤起命令..."
					}
					model={activeModel || undefined}
					onModelClick={() => setIsModelMenuOpen(true)}
				/>
			</div>
		</aside>
	);
}
