import { sessionStore } from "../agent/sessionManager";
import type { ChatSession } from "./types";
import { getSessionMessageCount } from "./types";
import { chatStore } from "./store";

export const DEFAULT_THREAD_MODEL = "claude-3-5-sonnet-20241022";

function extractFolderName(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] || path;
}

function findReusableScopedEmptySession(path: string): ChatSession | undefined {
	return chatStore.getState().sessions.find(
		// getSessionMessageCount：sqlite 模式下未加载会话按 DB 派生消息数判断，
		// 避免把有历史但未加载全文的会话误判为空会话复用。
		(session) => getSessionMessageCount(session) === 0 && session.cwd === path,
	);
}

function ensureScopedAgentSession(
	session: Pick<ChatSession, "id" | "agentSessionId">,
	path: string,
	model: string,
): string {
	if (session.agentSessionId) {
		const linkedRuntimeSession = sessionStore
			.getAllSessions()
			.find((item) => item.id === session.agentSessionId);
		if (linkedRuntimeSession?.cwd === path) {
			sessionStore.setCurrentSession(linkedRuntimeSession.id);
			return linkedRuntimeSession.id;
		}
	}

	const nextAgentSession = sessionStore.createSession({ model, cwd: path });
	sessionStore.setCurrentSession(nextAgentSession.id);
	chatStore.setSessionAgentSessionId(session.id, nextAgentSession.id);
	return nextAgentSession.id;
}

export function resolveThreadWorkingDirectory(
	session?: Pick<ChatSession, "cwd" | "agentSessionId"> | null,
): string | undefined {
	if (session?.cwd) return session.cwd;

	if (session?.agentSessionId) {
		const linkedRuntimeSession = sessionStore
			.getAllSessions()
			.find((item) => item.id === session.agentSessionId);
		if (linkedRuntimeSession?.cwd) return linkedRuntimeSession.cwd;
	}

	return sessionStore.getCurrentSession()?.cwd;
}

export function createThreadSessionForPath(
	path: string,
	model: string,
	options?: {
		title?: string;
	},
): ChatSession {
	const reusableSession = findReusableScopedEmptySession(path);
	if (reusableSession) {
		chatStore.setSessionCwd(reusableSession.id, path);
		ensureScopedAgentSession(reusableSession, path, model);
		chatStore.setActiveSession(reusableSession.id);
		return (
			chatStore
				.getState()
				.sessions.find((session) => session.id === reusableSession.id) ||
			reusableSession
		);
	}

	const folderName = extractFolderName(path);
	const nextChatSession = chatStore.createFreshSession(
		options?.title || `${folderName} - 新对话`,
	);
	chatStore.setSessionCwd(nextChatSession.id, path);

	const nextAgentSession = sessionStore.createSession({ model, cwd: path });
	sessionStore.setCurrentSession(nextAgentSession.id);
	chatStore.setSessionAgentSessionId(nextChatSession.id, nextAgentSession.id);

	return (
		chatStore
			.getState()
			.sessions.find((session) => session.id === nextChatSession.id) ||
		nextChatSession
	);
}
