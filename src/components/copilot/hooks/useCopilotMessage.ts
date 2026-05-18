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
import { beginCopilotMirror } from "../../../lib/design/copilotMirror";
import { EVENTS, events } from "../../../lib/events";
import { designStore } from "../../../lib/stores";
import { workspaceStore } from "../../../lib/workspaceStore";
import type { SlashCommand } from "../../chat/SlashCommand";
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
			// 设计模式草稿态：劫持发送，用用户输入覆盖 launch_payload.prompt
			// 后启动 design SDK；不进 Copilot 消息流。
			const designState = designStore.getState();
			if (designState.stage === "draft" && designState.draftLaunch) {
				const trimmed = content.trim();
				if (!trimmed) {
					toast.warning("请先描述你想要的设计");
					return;
				}
				const designSession = designState.currentSession;
				if (!designSession) {
					toast.error("当前没有活跃的设计会话");
					return;
				}
				// 关键时序：必须先 beginCopilotMirror 把 user 消息写进 chatStore，
				// 再触发 consumeDraftLaunch + setStage("running")。否则 pendingLaunch
				// 的 useEffect 异步链可能先跑到中栏 stage 切换，右栏还没拿到消息。
				beginCopilotMirror(trimmed, designSession.id, designSession.title);
				designStore.consumeDraftLaunch(trimmed);
				designStore.setStage("running");
				return;
			}

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
		stop,
	};
}
