/**
 * Remote Chat Bridge
 *
 * 监听主进程 `remote-chat-inject` IPC 事件，
 * 并将远程会话镜像到本地聊天历史。
 * 远程会话持久化以主进程落库为准，前端只负责实时展示与同步。
 */

import { useEffect, useRef } from "react";
import { listAgentSessions } from "./agent/api";
import { loadAgentSessionMessagesAsChatMessages } from "./agent/chatBridge";
import { normalizeAgentReplayMessages } from "./chat/messageNormalization";
import type { UIEvent } from "./agent/streamState";
import { chatStore } from "./chat/store";
import type { ChatMessage, ChatMessageBlock, ChatSession } from "./chat/types";
import { createMessage } from "./chat/types";
import { getPerformanceTuning } from "./config";
import { listen, type UnlistenFn } from "./tauriEventCompat";
import { isDesktopEnvironment } from "./tauriCompat";

type ToolCallBlock = Extract<ChatMessageBlock, { type: "tool_call" }>;

type RemoteRunBinding = {
	chatSessionId: string;
	assistantMessageId: string;
	agentSessionId?: string;
	taskId: string;
	sandboxDir?: string;
	textParts: string[];
	toolOrder: string[];
	toolsById: Map<string, ToolCallBlock>;
	imagePaths: Set<string>;
};

const INITIAL_MIRROR_LIMIT = 80;
const INITIAL_HYDRATION_LIMIT = 40;
const INCREMENTAL_MIRROR_LIMIT = 200;

/** 远程注入事件的载荷 */
export interface RemoteChatInjectPayload {
	runId: string;
	prompt: string;
	channelId: string;
	peerName: string;
	peerId?: string;
	sessionId: string;
	taskId?: string;
	agentSessionId?: string;
	persistedByMain?: boolean;
	sandboxDir?: string;
}

/** Agent SDK 事件载荷（简化版，仅取桥接需要的字段） */
interface AgentSdkEventPayload {
	runId?: string;
	type: string;
	events?: UIEvent[];
	result?: Record<string, unknown>;
	error?: string;
}

function getChannelLabel(channelId: string): string {
	const labels: Record<string, string> = {
		feishu: "飞书",
		telegram: "Telegram",
		slack: "Slack",
		discord: "Discord",
		generic_webhook: "Webhook",
	};
	return labels[channelId] ?? channelId;
}

function buildRemoteSessionTitle(
	channelId: string,
	peerName?: string,
	peerId?: string,
): string {
	const channelLabel = getChannelLabel(channelId);
	const peerLabel = String(peerName || peerId || "未知来源").trim();
	return `远程 · ${channelLabel} · ${peerLabel}`;
}

function parseTimestamp(raw: unknown): number {
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return Math.max(0, Math.floor(raw));
	}
	if (typeof raw === "string") {
		const parsed = Number(raw);
		if (Number.isFinite(parsed)) {
			return Math.max(0, Math.floor(parsed));
		}
	}
	return Date.now();
}

function getChatSessionById(sessionId: string): ChatSession | null {
	return (
		chatStore.getState().sessions.find((session) => session.id === sessionId) ||
		null
	);
}

function findChatSessionByAgentSessionId(
	agentSessionId: string,
): ChatSession | null {
	if (!agentSessionId) return null;
	return (
		chatStore
			.getState()
			.sessions.find((session) => session.agentSessionId === agentSessionId) ||
		null
	);
}

function buildRunBlocks(binding: RemoteRunBinding): ChatMessageBlock[] {
	const blocks: ChatMessageBlock[] = [];
	for (const toolCallId of binding.toolOrder) {
		const block = binding.toolsById.get(toolCallId);
		if (block) blocks.push(block);
	}
	for (const path of binding.imagePaths) {
		blocks.push({
			type: "image",
			path,
			title: "图片产物",
		});
	}
	return blocks;
}

function extractImagePathsFromOutput(output: unknown): string[] {
	if (!output || typeof output !== "object") return [];
	const imagePathsRaw = (output as { image_paths?: unknown }).image_paths;
	if (!Array.isArray(imagePathsRaw)) return [];
	return imagePathsRaw
		.map((item) => String(item || "").trim())
		.filter((item) => item.length > 0);
}

function extractTokenUsage(result?: Record<string, unknown>): {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
} | null {
	const usage = (result?.usage ?? null) as Record<string, unknown> | null;
	if (!usage || typeof usage !== "object") return null;
	const promptTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
	const completionTokens = Number(
		usage.output_tokens ?? usage.completion_tokens ?? 0,
	);
	const totalTokens = Number(
		usage.total_tokens ?? promptTokens + completionTokens,
	);
	if (
		!Number.isFinite(promptTokens) ||
		!Number.isFinite(completionTokens) ||
		!Number.isFinite(totalTokens)
	) {
		return null;
	}
	return {
		promptTokens: Math.max(0, Math.floor(promptTokens)),
		completionTokens: Math.max(0, Math.floor(completionTokens)),
		totalTokens: Math.max(0, Math.floor(totalTokens)),
	};
}

function parseRemoteConfig(configJson: unknown): {
	remoteSessionId?: string;
	channelId?: string;
	peerName?: string;
	peerId?: string;
	taskId?: string;
	sandboxDir?: string;
} | null {
	if (!configJson || typeof configJson !== "object") return null;
	const obj = configJson as Record<string, unknown>;
	if (obj.source !== "remote-control") return null;
	const remoteSessionId =
		typeof obj.remoteSessionId === "string" ? obj.remoteSessionId.trim() : "";
	const channelId =
		typeof obj.channelId === "string" ? obj.channelId.trim() : "";
	const peerName = typeof obj.peerName === "string" ? obj.peerName.trim() : "";
	const peerId = typeof obj.peerId === "string" ? obj.peerId.trim() : "";
	const taskId = typeof obj.taskId === "string" ? obj.taskId.trim() : "";
	const sandboxDir =
		typeof obj.sandboxDir === "string" ? obj.sandboxDir.trim() : "";
	return {
		remoteSessionId: remoteSessionId || undefined,
		channelId: channelId || undefined,
		peerName: peerName || undefined,
		peerId: peerId || undefined,
		taskId: taskId || undefined,
		sandboxDir: sandboxDir || undefined,
	};
}

/**
 * useRemoteChatBridge
 *
 * 在 App 根组件中调用该 hook，保证任意界面下远程会话都可镜像进聊天历史。
 */
export function useRemoteChatBridge(): void {
	const activeRunsRef = useRef<Map<string, RemoteRunBinding>>(new Map());
	const remoteSessionToChatSessionRef = useRef<Map<string, string>>(new Map());
	const agentSessionToChatSessionRef = useRef<Map<string, string>>(new Map());
	const activeRunByAgentSessionRef = useRef<Map<string, string>>(new Map());
	const syncInFlightRef = useRef(false);
	const lastSyncedAtRef = useRef(0);

	useEffect(() => {
		if (!isDesktopEnvironment()) return;

		let unlistenInject: UnlistenFn | null = null;
		let unlistenSdkEvent: UnlistenFn | null = null;
		let syncTimer: ReturnType<typeof setInterval> | null = null;
		let disposed = false;

		const ensureRemoteChatSession = (input: {
			remoteSessionId?: string;
			agentSessionId?: string;
			channelId?: string;
			peerName?: string;
			peerId?: string;
			title: string;
		}): ChatSession => {
			const { remoteSessionId, agentSessionId, title } = input;
			const markRemoteSource = (chatSessionId: string) => {
				chatStore.setSessionThreadSource(chatSessionId, {
					type: "remote",
					remoteSessionId,
					channelId: input.channelId,
					peerName: input.peerName,
					peerId: input.peerId,
				});
			};
			if (agentSessionId) {
				const mappedByAgent =
					agentSessionToChatSessionRef.current.get(agentSessionId);
				if (mappedByAgent) {
					const existing = getChatSessionById(mappedByAgent);
					if (existing) {
						if (remoteSessionId) {
							remoteSessionToChatSessionRef.current.set(
								remoteSessionId,
								existing.id,
							);
						}
						markRemoteSource(existing.id);
						return existing;
					}
					agentSessionToChatSessionRef.current.delete(agentSessionId);
				}
				const existingByAgent = findChatSessionByAgentSessionId(agentSessionId);
				if (existingByAgent) {
					agentSessionToChatSessionRef.current.set(
						agentSessionId,
						existingByAgent.id,
					);
					if (remoteSessionId) {
						remoteSessionToChatSessionRef.current.set(
							remoteSessionId,
							existingByAgent.id,
						);
					}
					markRemoteSource(existingByAgent.id);
					return existingByAgent;
				}
			}

			if (remoteSessionId) {
				const mappedByRemote =
					remoteSessionToChatSessionRef.current.get(remoteSessionId);
				if (mappedByRemote) {
					const existing = getChatSessionById(mappedByRemote);
					if (existing) {
						markRemoteSource(existing.id);
						return existing;
					}
					remoteSessionToChatSessionRef.current.delete(remoteSessionId);
				}
			}

			const previousActiveId = chatStore.getState().activeSessionId;
			const created = chatStore.createFreshSession(title);
			if (previousActiveId !== created.id) {
				chatStore.setActiveSession(previousActiveId);
			}
			if (remoteSessionId) {
				remoteSessionToChatSessionRef.current.set(remoteSessionId, created.id);
			}
			if (agentSessionId) {
				agentSessionToChatSessionRef.current.set(agentSessionId, created.id);
				chatStore.setSessionAgentSessionId(created.id, agentSessionId);
			}
			markRemoteSource(created.id);
			return created;
		};

		const hydrateAgentSessionMessages = async (
			agentSessionId: string,
			chatSessionId: string,
		): Promise<void> => {
			const session = getChatSessionById(chatSessionId);
			if (!session) return;
			try {
				const messages =
					await loadAgentSessionMessagesAsChatMessages(agentSessionId);
				if (!getChatSessionById(chatSessionId)) return;
				chatStore.replaceSessionMessages(
					chatSessionId,
					normalizeAgentReplayMessages(messages),
				);
			} catch (error) {
				console.warn("[RemoteChatBridge] 同步远程会话消息失败:", error);
			}
		};

		const syncRemoteSessions = async (force: boolean): Promise<void> => {
			if (disposed || syncInFlightRef.current) return;
			syncInFlightRef.current = true;
			try {
				const sessions = await listAgentSessions("active");
				if (disposed) return;
				const mirrorLimit = force
					? INITIAL_MIRROR_LIMIT
					: INCREMENTAL_MIRROR_LIMIT;
				const remoteSessions = sessions
					.map((session) => {
						const meta = parseRemoteConfig(session.config_json);
						if (!meta) return null;
						return { session, meta };
					})
					.filter(
						(
							item,
						): item is {
							session: any;
							meta: NonNullable<ReturnType<typeof parseRemoteConfig>>;
						} => Boolean(item),
					)
					.sort(
						(a, b) =>
							parseTimestamp(b.session.updated_at) -
							parseTimestamp(a.session.updated_at),
					)
					.slice(0, mirrorLimit);

				let maxUpdatedAt = lastSyncedAtRef.current;
				let hydratedCount = 0;
				const hydrateTargets: Array<{
					agentSessionId: string;
					chatSessionId: string;
				}> = [];
				for (const item of remoteSessions) {
					const updatedAt = parseTimestamp(item.session.updated_at);
					maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt);
					const agentSessionId = String(item.session.id || "").trim();
					if (!agentSessionId) continue;
					const chatSession = ensureRemoteChatSession({
						remoteSessionId: item.meta.remoteSessionId,
						agentSessionId,
						channelId: item.meta.channelId,
						peerName: item.meta.peerName,
						peerId: item.meta.peerId,
						title:
							typeof item.session.title === "string" &&
							item.session.title.trim()
								? item.session.title.trim()
								: buildRemoteSessionTitle(
										item.meta.channelId || "feishu",
										item.meta.peerName,
										item.meta.peerId,
									),
					});
					chatStore.setSessionAgentSessionId(chatSession.id, agentSessionId);

					if (
						!force &&
						updatedAt <= lastSyncedAtRef.current &&
						!activeRunByAgentSessionRef.current.has(agentSessionId)
					) {
						// 按 updated_at 已降序，后续更旧，直接提前结束。
						break;
					}
					if (
						activeRunByAgentSessionRef.current.has(agentSessionId) &&
						!force
					) {
						continue;
					}
					if (force && hydratedCount >= INITIAL_HYDRATION_LIMIT) {
						continue;
					}
					hydrateTargets.push({
						agentSessionId,
						chatSessionId: chatSession.id,
					});
					if (force) hydratedCount += 1;
				}
				const maxConcurrentHydration = 4;
				for (
					let index = 0;
					index < hydrateTargets.length;
					index += maxConcurrentHydration
				) {
					const chunk = hydrateTargets.slice(
						index,
						index + maxConcurrentHydration,
					);
					await Promise.allSettled(
						chunk.map((target) =>
							hydrateAgentSessionMessages(
								target.agentSessionId,
								target.chatSessionId,
							),
						),
					);
				}
				lastSyncedAtRef.current = Math.max(
					lastSyncedAtRef.current,
					maxUpdatedAt,
				);
			} catch (error) {
				console.warn("[RemoteChatBridge] 远程会话增量同步失败:", error);
			} finally {
				syncInFlightRef.current = false;
			}
		};

		const updateAssistantMessage = (
			binding: RemoteRunBinding,
			overrides?: Partial<ChatMessage>,
		): void => {
			const metadataBase = {
				taskId: binding.taskId,
				sandboxDir: binding.sandboxDir,
				blocks: buildRunBlocks(binding),
			};
			chatStore.updateMessage(
				binding.chatSessionId,
				binding.assistantMessageId,
				{
					content: binding.textParts.join(""),
					metadata: metadataBase,
					...overrides,
				},
			);
		};

		const setup = async () => {
			void syncRemoteSessions(true);
			let remoteSyncIntervalMs = 15000;
			try {
				const settings = await getPerformanceTuning();
				remoteSyncIntervalMs = settings.remoteSyncIntervalMs;
			} catch (error) {
				console.warn(
					"[RemoteChatBridge] 加载性能设置失败，使用默认同步间隔:",
					error,
				);
			}

			const handleWindowFocus = () => {
				void syncRemoteSessions(false);
			};
			const handleVisibility = () => {
				if (document.visibilityState === "visible") {
					void syncRemoteSessions(false);
				}
			};
			window.addEventListener("focus", handleWindowFocus);
			document.addEventListener("visibilitychange", handleVisibility);

			syncTimer = setInterval(() => {
				if (document.visibilityState !== "visible") return;
				void syncRemoteSessions(false);
			}, remoteSyncIntervalMs);

			unlistenInject = await listen<RemoteChatInjectPayload>(
				"remote-chat-inject",
				async (event) => {
					const payload = event.payload;
					const runId = String(payload.runId || "").trim();
					if (!runId) return;
					if (activeRunsRef.current.has(runId)) return;

					const taskId = String(
						payload.taskId || `remote-${payload.sessionId}`,
					);
					const session = ensureRemoteChatSession({
						remoteSessionId: payload.sessionId,
						agentSessionId: payload.agentSessionId,
						channelId: payload.channelId,
						peerName: payload.peerName,
						peerId: payload.peerId,
						title: buildRemoteSessionTitle(
							payload.channelId,
							payload.peerName,
							payload.peerId,
						),
					});
					if (payload.agentSessionId) {
						chatStore.setSessionAgentSessionId(
							session.id,
							payload.agentSessionId,
						);
						agentSessionToChatSessionRef.current.set(
							payload.agentSessionId,
							session.id,
						);
						activeRunByAgentSessionRef.current.set(
							payload.agentSessionId,
							runId,
						);
						if (payload.persistedByMain) {
							void hydrateAgentSessionMessages(
								payload.agentSessionId,
								session.id,
							);
						}
					}

					const channelLabel = getChannelLabel(payload.channelId);
					const peerDisplay = payload.peerName || payload.peerId || "未知来源";
					// sqlite 后端：先确保该会话消息已加载，否则 hasUserForTask 会在
					// 未加载的空 messages 上误判、重复注入用户消息。
					try {
						await chatStore.ensureSessionLoaded(session.id);
					} catch {
						// 加载失败不阻断注入流程
					}
					const hasUserForTask = getChatSessionById(session.id)?.messages.some(
						(msg) => msg.role === "user" && msg.metadata?.taskId === taskId,
					);
					if (!payload.persistedByMain || !hasUserForTask) {
						const userMessage = createMessage("user", payload.prompt, {
							metadata: {
								attachedFiles: [],
								taskId,
								sandboxDir: payload.sandboxDir,
							},
						});
						userMessage.content = `[${channelLabel} · ${peerDisplay}] ${payload.prompt}`;
						chatStore.addMessage(session.id, userMessage);
					}

					const assistantMessage = createMessage("assistant", "", {
						isStreaming: true,
						metadata: {
							taskId,
							sandboxDir: payload.sandboxDir,
							blocks: [],
						},
					});
					chatStore.addMessage(session.id, assistantMessage);

					activeRunsRef.current.set(runId, {
						chatSessionId: session.id,
						assistantMessageId: assistantMessage.id,
						agentSessionId: payload.agentSessionId,
						taskId,
						sandboxDir: payload.sandboxDir,
						textParts: [],
						toolOrder: [],
						toolsById: new Map(),
						imagePaths: new Set(),
					});
				},
			);

			unlistenSdkEvent = await listen<AgentSdkEventPayload>(
				"agent-sdk-event",
				(event) => {
					const payload = event.payload;
					const runId = String(payload.runId || "").trim();
					if (!runId) return;
					const binding = activeRunsRef.current.get(runId);
					if (!binding) return;

					if (payload.type === "transformed" && Array.isArray(payload.events)) {
						let changed = false;
						for (const uiEvent of payload.events) {
							if (
								uiEvent.type === "text_delta" &&
								typeof uiEvent.content === "string"
							) {
								binding.textParts.push(uiEvent.content);
								changed = true;
								continue;
							}

							if (
								uiEvent.type === "session_init" &&
								typeof uiEvent.sessionId === "string" &&
								uiEvent.sessionId.trim()
							) {
								chatStore.setSessionSdkSessionId(
									binding.chatSessionId,
									uiEvent.sessionId.trim(),
								);
								changed = true;
								continue;
							}

							if (uiEvent.type === "tool_call_start") {
								const toolCallId = String(uiEvent.id || "").trim();
								if (!toolCallId) continue;
								if (!binding.toolsById.has(toolCallId)) {
									binding.toolOrder.push(toolCallId);
								}
								binding.toolsById.set(toolCallId, {
									type: "tool_call",
									taskId: binding.taskId,
									toolCallId,
									toolType: uiEvent.name,
									name: uiEvent.name,
									status: "running",
									input:
										uiEvent.input && typeof uiEvent.input === "object"
											? uiEvent.input
											: {},
								});
								changed = true;
								continue;
							}

							if (uiEvent.type === "tool_input_complete") {
								const toolCallId = String(uiEvent.id || "").trim();
								if (!toolCallId) continue;
								const current = binding.toolsById.get(toolCallId);
								if (!current) continue;
								binding.toolsById.set(toolCallId, {
									...current,
									input:
										uiEvent.input && typeof uiEvent.input === "object"
											? uiEvent.input
											: current.input,
								});
								changed = true;
								continue;
							}

							if (uiEvent.type === "tool_call_end") {
								const toolCallId = String(uiEvent.id || "").trim();
								if (!toolCallId) continue;
								const current = binding.toolsById.get(toolCallId);
								if (!current) continue;
								binding.toolsById.set(toolCallId, {
									...current,
									status: uiEvent.isError ? "error" : "completed",
									output: uiEvent.output,
									error: uiEvent.isError ? "工具调用失败" : undefined,
								});
								for (const path of extractImagePathsFromOutput(
									uiEvent.output,
								)) {
									binding.imagePaths.add(path);
								}
								changed = true;
							}
						}

						if (changed) {
							updateAssistantMessage(binding, { isStreaming: true });
						}
						return;
					}

					if (payload.type === "done") {
						const resultText =
							typeof payload.result?.result === "string"
								? payload.result.result
								: "";
						const finalContent =
							binding.textParts.join("") || resultText || "（远程任务已完成）";
						const tokenUsage = extractTokenUsage(payload.result);

						updateAssistantMessage(binding, {
							content: finalContent,
							isStreaming: false,
							metadata: {
								taskId: binding.taskId,
								sandboxDir: binding.sandboxDir,
								blocks: buildRunBlocks(binding),
								...(tokenUsage ? { tokenUsage } : {}),
							},
						});
						activeRunsRef.current.delete(runId);
						if (binding.agentSessionId) {
							activeRunByAgentSessionRef.current.delete(binding.agentSessionId);
							void hydrateAgentSessionMessages(
								binding.agentSessionId,
								binding.chatSessionId,
							);
							setTimeout(() => {
								void hydrateAgentSessionMessages(
									binding.agentSessionId as string,
									binding.chatSessionId,
								);
							}, 500);
						}
						return;
					}

					if (payload.type === "error") {
						const errorText = payload.error || "未知错误";
						const current = binding.textParts.join("");
						updateAssistantMessage(binding, {
							content: current
								? `${current}\n\n❌ 错误: ${errorText}`
								: `❌ 远程任务出错: ${errorText}`,
							isStreaming: false,
						});
						activeRunsRef.current.delete(runId);
						if (binding.agentSessionId) {
							activeRunByAgentSessionRef.current.delete(binding.agentSessionId);
							void hydrateAgentSessionMessages(
								binding.agentSessionId,
								binding.chatSessionId,
							);
						}
					}
				},
			);

			return () => {
				window.removeEventListener("focus", handleWindowFocus);
				document.removeEventListener("visibilitychange", handleVisibility);
			};
		};

		let cleanupWindowHooks: (() => void) | undefined;
		setup()
			.then((cleanupFn) => {
				cleanupWindowHooks = cleanupFn;
			})
			.catch((error) => {
				console.error("[RemoteChatBridge] Setup failed:", error);
			});

		return () => {
			disposed = true;
			cleanupWindowHooks?.();
			unlistenInject?.();
			unlistenSdkEvent?.();
			if (syncTimer) {
				clearInterval(syncTimer);
				syncTimer = null;
			}
			activeRunsRef.current.clear();
			remoteSessionToChatSessionRef.current.clear();
			agentSessionToChatSessionRef.current.clear();
			activeRunByAgentSessionRef.current.clear();
		};
	}, []);
}
