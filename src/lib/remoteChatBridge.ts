/**
 * Remote Chat Bridge
 *
 * 监听主进程 `remote-chat-inject` IPC 事件，
 * 将远程第三方渠道（如飞书）的请求注入到“标准聊天会话 + 历史持久化 + 沙盒产物”链路。
 */

import { useEffect, useRef } from "react";
import { createAgentSession } from "./agent/api";
import { persistChatMessageToAgentSession } from "./agent/chatBridge";
import type { UIEvent } from "./agent/streamState";
import { chatStore } from "./chat/store";
import type { ChatMessage, ChatMessageBlock, ChatSession } from "./chat/types";
import { createMessage } from "./chat/types";
import { listen, type UnlistenFn } from "./tauriEventCompat";
import { workspaceStore } from "./workspaceStore";

type ToolCallBlock = Extract<ChatMessageBlock, { type: "tool_call" }>;

type RemoteRunBinding = {
	chatSessionId: string;
	assistantMessageId: string;
	agentSessionPromise: Promise<string | undefined>;
	taskId: string;
	sandboxDir?: string;
	textParts: string[];
	toolOrder: string[];
	toolsById: Map<string, ToolCallBlock>;
	imagePaths: Set<string>;
};

/** 远程注入事件的载荷 */
export interface RemoteChatInjectPayload {
	runId: string;
	prompt: string;
	channelId: string;
	peerName: string;
	peerId?: string;
	sessionId: string;
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

function getChatSessionById(sessionId: string): ChatSession | null {
	return (
		chatStore.getState().sessions.find((session) => session.id === sessionId) ||
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

/**
 * useRemoteChatBridge
 *
 * 在 CopilotSidebar 中调用此钩子，即可让远程消息走“和本地一致”的会话/历史/产物链路。
 */
export function useRemoteChatBridge(): void {
	const activeRunsRef = useRef<Map<string, RemoteRunBinding>>(new Map());
	const remoteSessionToChatSessionRef = useRef<Map<string, string>>(new Map());
	const ensuringAgentSessionRef = useRef<
		Map<string, Promise<string | undefined>>
	>(new Map());

	useEffect(() => {
		let unlistenInject: UnlistenFn | null = null;
		let unlistenSdkEvent: UnlistenFn | null = null;

		const ensureAgentSessionIdForChatSession = (
			chatSessionId: string,
		): Promise<string | undefined> => {
			const session = getChatSessionById(chatSessionId);
			if (!session) return Promise.resolve(undefined);
			if (
				session.agentSessionId &&
				!session.agentSessionId.startsWith("local-")
			) {
				return Promise.resolve(session.agentSessionId);
			}
			const pending = ensuringAgentSessionRef.current.get(chatSessionId);
			if (pending) return pending;

			const promise = (async () => {
				try {
					const projectId = workspaceStore.getState().currentProjectId || null;
					const created = await createAgentSession(session.title, projectId);
					chatStore.setSessionAgentSessionId(chatSessionId, created.id);
					return created.id;
				} catch (error) {
					console.warn("[RemoteChatBridge] 创建远程会话持久化记录失败:", error);
					return undefined;
				}
			})();
			ensuringAgentSessionRef.current.set(chatSessionId, promise);
			void promise.finally(() => {
				ensuringAgentSessionRef.current.delete(chatSessionId);
			});
			return promise;
		};

		const persistMessageById = async (
			chatSessionId: string,
			messageId: string,
			agentSessionPromise: Promise<string | undefined>,
		): Promise<void> => {
			const agentSessionId = await agentSessionPromise;
			if (!agentSessionId || agentSessionId.startsWith("local-")) return;

			const latestSession = getChatSessionById(chatSessionId);
			const latestMessage = latestSession?.messages.find(
				(msg) => msg.id === messageId,
			);
			if (!latestMessage) return;

			const record = await persistChatMessageToAgentSession(
				agentSessionId,
				latestMessage,
			);
			if (record?.id) {
				chatStore.updateMessage(chatSessionId, messageId, {
					metadata: { agentMessageId: record.id },
				});
			}
		};

		const ensureRemoteChatSession = (
			payload: RemoteChatInjectPayload,
		): ChatSession => {
			const mappedId = remoteSessionToChatSessionRef.current.get(
				payload.sessionId,
			);
			if (mappedId) {
				const mapped = getChatSessionById(mappedId);
				if (mapped) return mapped;
				remoteSessionToChatSessionRef.current.delete(payload.sessionId);
			}

			const previousActiveId = chatStore.getState().activeSessionId;
			const created = chatStore.createNewSession(
				buildRemoteSessionTitle(
					payload.channelId,
					payload.peerName,
					payload.peerId,
				),
			);
			remoteSessionToChatSessionRef.current.set(payload.sessionId, created.id);

			if (previousActiveId !== created.id) {
				chatStore.setActiveSession(previousActiveId);
			}
			return created;
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
			unlistenInject = await listen<RemoteChatInjectPayload>(
				"remote-chat-inject",
				(event) => {
					const payload = event.payload;
					const runId = String(payload.runId || "").trim();
					if (!runId) return;

					const session = ensureRemoteChatSession(payload);
					const taskId = `remote-${payload.sessionId}`;
					const channelLabel = getChannelLabel(payload.channelId);
					const peerDisplay = payload.peerName || payload.peerId || "未知来源";

					const userMessage = createMessage("user", payload.prompt, {
						metadata: {
							attachedFiles: [],
							taskId,
							sandboxDir: payload.sandboxDir,
						},
					});
					userMessage.content = `[${channelLabel} · ${peerDisplay}] ${payload.prompt}`;
					chatStore.addMessage(session.id, userMessage);

					const assistantMessage = createMessage("assistant", "", {
						isStreaming: true,
						metadata: {
							taskId,
							sandboxDir: payload.sandboxDir,
							blocks: [],
						},
					});
					chatStore.addMessage(session.id, assistantMessage);

					const agentSessionPromise = ensureAgentSessionIdForChatSession(
						session.id,
					);
					void persistMessageById(
						session.id,
						userMessage.id,
						agentSessionPromise,
					);

					activeRunsRef.current.set(runId, {
						chatSessionId: session.id,
						assistantMessageId: assistantMessage.id,
						agentSessionPromise,
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
						void persistMessageById(
							binding.chatSessionId,
							binding.assistantMessageId,
							binding.agentSessionPromise,
						);
						activeRunsRef.current.delete(runId);
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
						void persistMessageById(
							binding.chatSessionId,
							binding.assistantMessageId,
							binding.agentSessionPromise,
						);
						activeRunsRef.current.delete(runId);
					}
				},
			);
		};

		setup().catch((error) => {
			console.error("[RemoteChatBridge] Setup failed:", error);
		});

		return () => {
			unlistenInject?.();
			unlistenSdkEvent?.();
			activeRunsRef.current.clear();
			remoteSessionToChatSessionRef.current.clear();
			ensuringAgentSessionRef.current.clear();
		};
	}, []);
}
