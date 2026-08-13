// Copilot 消息发送 Hook
// 整合 chat/agent 两套消息发送逻辑、深度研究、重新生成、计划反馈监听，
// 并对外暴露统一的 handleSendMessage / handleRegenerateMessage / stop。

import { useCallback, useEffect, useState } from "react";
import { encodeChatMessageToAgentContentJson } from "../../../lib/agent/chatBridge";
import { agentExecutor } from "../../../lib/agent/executor";
import { onPlanModifyFeedback } from "../../../lib/agent/planModifyEvent";
import { agentStore } from "../../../lib/agent/store";
import { parseDocProtocolFinal } from "../../../lib/chat/docProtocol";
import { createMessage } from "../../../lib/chat/types";
import { EVENTS, events } from "../../../lib/events";
import { workspaceStore } from "../../../lib/workspaceStore";
import type { SlashCommand } from "../../chat/SlashCommand";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { toast } from "../../ui/Toast";
import type { ChatStoreLike } from "../types";
import { useAgentHandler } from "./useAgentHandler";
import { useChatHandler } from "./useChatHandler";
import { useCopilotProposals } from "./useCopilotProposals";
import { useSessionTitleGeneration } from "./useSessionTitleGeneration";

export interface SendMessageOptions {
	command?: SlashCommand;
	chips?: Array<{ type: string; command: SlashCommand }>;
	forcedSkillId?: string;
	skipUserMessage?: boolean;
	forceForkSession?: boolean;
	parentSdkSessionId?: string;
}

interface UseCopilotMessageOptions {
	chatStore: ChatStoreLike;
	activeModel: string | null;
	chatSettings: {
		persistEnabled: boolean;
		inlineTraceEnabled: boolean;
	};
	chatMode: "chat" | "agent";
	enabledModels: Array<{ id: string; provider: string }>;
	debugLog: (...args: unknown[]) => void;
	debugWarn: (...args: unknown[]) => void;
}

export function useCopilotMessage({
	chatStore,
	activeModel,
	chatSettings,
	chatMode,
	enabledModels,
	debugLog,
	debugWarn,
}: UseCopilotMessageOptions) {
	const [abortController, setAbortController] =
		useState<AbortController | null>(null);

	const { queueCreateProposal } = useCopilotProposals();
	const { generateSessionTitle } = useSessionTitleGeneration({
		chatStore,
		enabledModels,
		debugLog,
	});

	const onFirstUserMessage = useCallback(
		(sessionId: string, firstMessage: string, fallbackModel?: string) => {
			void generateSessionTitle(sessionId, firstMessage, fallbackModel);
		},
		[generateSessionTitle],
	);

	const { handleAgentModeMessage } = useAgentHandler({
		chatStore,
		activeModel,
		chatSettings,
		debugLog,
		debugWarn,
		onFirstUserMessage,
		queueCreateProposal,
		setAbortController,
	});

	const { handleChatModeMessage } = useChatHandler({
		chatStore,
		activeModel,
		debugLog,
		onFirstUserMessage,
		queueCreateProposal,
		setAbortController,
	});

	const performDeepResearch = useCallback(
		async (query: string) => {
			if (!activeModel) {
				toast.warning("请先在设置中配置并选择一个模型");
				return;
			}

			const session = chatStore.activeSession;
			if (!session) return;

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
				await agentExecutor.executeResearchTask(query);

				const finalState = agentStore.getState();
				const rawResultText = finalState.currentTask?.result
					? finalState.currentTask.result
					: "研究任务已完成，请在左侧 Agent 面板查看详细结果。";

				const protocol = parseDocProtocolFinal(rawResultText, {
					activeDocContent: "",
					hasActiveDoc: false,
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
					activeDocContent: "",
					hasActiveDoc: false,
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
		},
		[activeModel, chatStore, generateSessionTitle, queueCreateProposal],
	);

	const handleSendMessage = useCallback(
		async (content: string, submitOptions?: SendMessageOptions) => {
			const command = submitOptions?.command;
			const forcedSkillId = submitOptions?.forcedSkillId;
			const skipUserMessage = submitOptions?.skipUserMessage;
			const forceForkSession = submitOptions?.forceForkSession === true;
			const parentSdkSessionIdForRun = submitOptions?.parentSdkSessionId;

			if (!activeModel) {
				toast.warning("请先在设置中配置并选择一个模型");
				return;
			}

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
		},
		[
			activeModel,
			chatMode,
			chatStore,
			handleAgentModeMessage,
			handleChatModeMessage,
			performDeepResearch,
		],
	);

	const handleEditUserMessage = useCallback(
		async (messageId: string, newContent: string) => {
			const session = chatStore.activeSession;
			if (!session) return;
			const idx = session.messages.findIndex((m) => m.id === messageId);
			if (idx < 0 || session.messages[idx].role !== "user") return;

			// 错误预防：编辑重发会连带丢弃其后全部消息（不可逆），必须先告知数量
			const affectedCount = session.messages.length - idx - 1;
			if (affectedCount > 0) {
				const ok = await confirmDialog.show({
					title: "编辑并重新发送",
					message: `重新发送将丢弃这条消息之后的 ${affectedCount} 条消息（包括 AI 回复与执行记录），且无法恢复。`,
					type: "warning",
					confirmText: "重新发送",
					cancelText: "取消",
				});
				if (!ok) return;
			}

			// 删除该用户消息及其后的全部消息（含 assistant 回复 / trace）
			const ids = session.messages.slice(idx).map((m) => m.id);
			for (const id of ids) {
				chatStore.deleteMessage(session.id, id);
			}

			void handleSendMessage(newContent, {
				forceForkSession: true,
				parentSdkSessionId: session.sdkSessionId,
			});
		},
		[chatStore, handleSendMessage],
	);

	const handleDeleteMessage = useCallback(
		async (messageId: string) => {
			const session = chatStore.activeSession;
			if (!session) return;
			// 消息删除不可逆（会话级删除有 5s undo，消息级没有），加一道确认
			const ok = await confirmDialog.show({
				title: "删除消息",
				message: "删除后无法恢复，确定删除这条消息吗？",
				type: "danger",
				confirmText: "删除",
				cancelText: "取消",
			});
			if (!ok) return;
			chatStore.deleteMessage(session.id, messageId);
		},
		[chatStore],
	);

	const handleRegenerateMessage = useCallback(
		(messageId: string) => {
			const session = chatStore.activeSession;
			if (!session) return;

			const messageIndex = session.messages.findIndex(
				(m) => m.id === messageId,
			);
			if (messageIndex === -1) return;

			const targetMessage = session.messages[messageIndex];
			if (targetMessage.role !== "assistant") return;

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

			chatStore.deleteMessage(session.id, messageId);

			void handleSendMessage(userMessageContent, {
				skipUserMessage: true,
				forceForkSession: true,
				parentSdkSessionId: session.sdkSessionId,
			});
		},
		[chatStore, handleSendMessage],
	);

	useEffect(() => {
		return onPlanModifyFeedback((feedback) => {
			const prefixed = `请根据以下反馈修改计划：\n\n${feedback}`;
			void handleSendMessage(prefixed);
		});
	}, [handleSendMessage]);

	const stop = useCallback(() => {
		if (chatMode === "agent") {
			agentExecutor.cancel();
		}
		if (abortController) {
			abortController.abort();
			setAbortController(null);
		}
		chatStore.setStatus("idle");
	}, [abortController, chatMode, chatStore]);

	return {
		handleSendMessage,
		handleRegenerateMessage,
		handleEditUserMessage,
		handleDeleteMessage,
		stop,
	};
}
