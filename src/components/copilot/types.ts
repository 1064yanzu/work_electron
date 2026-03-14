// CopilotSidebar 共享类型

import type {
	ChatMessage as ChatMessageType,
	ChatStatus,
} from "../../lib/chat/types";

/**
 * chatStore 实例包装类型，将 zustand 选择器返回值与 actions 合并
 */
export interface ChatStoreLike {
	sessions: Array<{
		id: string;
		title: string;
		messages: ChatMessageType[];
		model?: string;
		agentSessionId?: string;
		sdkSessionId?: string;
	}>;
	activeSessionId: string | null;
	activeSession: {
		id: string;
		title: string;
		messages: ChatMessageType[];
		model?: string;
		agentSessionId?: string;
		sdkSessionId?: string;
	} | null;
	status: ChatStatus;
	createNewSession: () => void;
	setActiveSession: (id: string) => void;
	deleteSession: (id: string) => void;
	deleteSessionWithUndo: (
		sessionId: string,
		undoWindowMs?: number,
	) => {
		sessionId: string;
		title: string;
		expiresAt: number;
		undoWindowMs: number;
	} | null;
	undoDeleteSession: (sessionId: string) => boolean;
	addMessage: (sessionId: string, message: ChatMessageType) => void;
	updateMessage: (
		sessionId: string,
		messageId: string,
		updates: Partial<ChatMessageType>,
	) => void;
	replaceSessionMessages: (
		sessionId: string,
		messages: ChatMessageType[],
	) => void;
	updateSessionTitle: (sessionId: string, title: string) => void;
	setSessionAgentSessionId: (sessionId: string, agentSessionId: string) => void;
	setSessionSdkSessionId: (
		sessionId: string,
		sdkSessionId: string | undefined,
	) => void;
	setStatus: (status: ChatStatus, errorMessage?: string) => void;
	deleteMessage: (sessionId: string, messageId: string) => void;
}

export interface CreateProposal {
	id: string;
	title: string;
	summary: string;
	content: string;
	prompt: string;
	createdAt: number;
}
