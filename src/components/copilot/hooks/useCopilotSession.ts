// Copilot 会话管理 Hook
// 聚合 chatStore 状态 + chatActions，并负责
//   - 确保始终存在活跃会话
//   - 自动恢复持久化 Agent Session 与重放消息

import { useEffect, useMemo, useRef } from "react";
import { loadAgentSessionMessagesAsChatMessages } from "../../../lib/agent/chatBridge";
import {
	agentPersistence,
	resumePersistentSession,
} from "../../../lib/agent/persistence";
import { useChatStoreSelector } from "../../../lib/chat/store";
import { normalizeAgentReplayMessages } from "../../../lib/chat/messageNormalization";
import type { ChatMessage as ChatMessageType } from "../../../lib/chat/types";
import { chatActions } from "../copilotSidebarConstants";
import type { ChatStoreLike } from "../types";

interface UseCopilotSessionOptions {
	replayEnabled: boolean;
	replayLimit: number;
}

interface UseCopilotSessionResult {
	chatStore: ChatStoreLike;
}

export function useCopilotSession({
	replayEnabled,
	replayLimit,
}: UseCopilotSessionOptions): UseCopilotSessionResult {
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

	const chatStore = useMemo<ChatStoreLike>(
		() => ({
			sessions,
			activeSessionId,
			activeSession,
			status,
			...chatActions,
		}),
		[sessions, activeSessionId, activeSession, status],
	);

	useEffect(() => {
		if (!chatStore.activeSession && chatStore.sessions.length === 0) {
			chatStore.createNewSession();
		} else if (!chatStore.activeSession && chatStore.sessions.length > 0) {
			chatStore.setActiveSession(chatStore.sessions[0].id);
		}
	}, [chatStore]);

	const activeRestoredAgentSessionIdRef = useRef<string | null>(null);
	const replayedAgentSessionIdsRef = useRef<Set<string>>(new Set());

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
			replayEnabled && !replayedAgentSessionIdsRef.current.has(agentSessionId);
		if (!shouldResume && !shouldReplay) return;

		void (async () => {
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
							limit: replayLimit > 0 ? replayLimit : undefined,
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
	}, [chatStore.activeSessionId, replayEnabled, replayLimit]);

	return { chatStore };
}
