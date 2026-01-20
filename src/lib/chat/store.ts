// AI 聊天状态管理
import { useSyncExternalStore } from "react";
import { parseStoredData, serializeForStorage } from "./compression";
import {
	type ChatMessage,
	type ChatMessageBlock,
	type ChatSession,
	type ChatState,
	createSession,
	type FileUpdate,
} from "./types";

// 本地存储 key
const STORAGE_KEY = "chat_sessions";

function sameFileUpdate(a: FileUpdate, b: FileUpdate): boolean {
	return (
		a.fileName === b.fileName &&
		a.type === b.type &&
		a.additions === b.additions &&
		a.deletions === b.deletions
	);
}

function mergeFileUpdatesIntoBlocks(
	blocks: ChatMessageBlock[] | undefined,
	fileUpdates: FileUpdate[] | undefined,
): ChatMessageBlock[] | undefined {
	if (!Array.isArray(blocks) || blocks.length === 0) return blocks;
	if (!Array.isArray(fileUpdates) || fileUpdates.length === 0) return blocks;

	const next = [...blocks];
	let changed = false;

	for (const update of fileUpdates) {
		const existingIdx = next.findIndex(
			(b) =>
				b.type === "file_update" &&
				b.update.fileName === update.fileName &&
				b.update.type === update.type,
		);
		if (existingIdx >= 0) {
			const existing = next[existingIdx];
			if (
				existing.type === "file_update" &&
				!sameFileUpdate(existing.update, update)
			) {
				next[existingIdx] = { type: "file_update", update } as const;
				changed = true;
			}
			continue;
		}

		const insertBeforeIdx = next.findIndex((b) => b.type === "agent_task");
		const block = { type: "file_update", update } as const;
		if (insertBeforeIdx >= 0) {
			next.splice(insertBeforeIdx, 0, block);
		} else {
			next.push(block);
		}
		changed = true;
	}

	return changed ? next : blocks;
}

// 初始状态
const initialState: ChatState = {
	sessions: [],
	activeSessionId: null,
	status: "idle",
	error: null,
};

// 从 localStorage 加载（支持压缩格式和旧格式自动迁移）
function loadFromStorage(): ChatState {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = parseStoredData(stored);
			if (parsed) {
				console.log(
					`[ChatStore] Loaded ${parsed.sessions.length} sessions from storage`,
				);
				return {
					...initialState,
					sessions: parsed.sessions,
					activeSessionId: parsed.activeSessionId,
				};
			}
		}
	} catch (e) {
		console.error("Failed to load chat sessions:", e);
	}
	return initialState;
}

// 保存到 localStorage（使用压缩格式）
function saveToStorage(state: ChatState) {
	try {
		const compressed = serializeForStorage(state);
		localStorage.setItem(STORAGE_KEY, compressed);
		console.log(
			`[ChatStore] Saved ${state.sessions.length} sessions (${(compressed.length / 1024).toFixed(1)}KB compressed)`,
		);
	} catch (e) {
		console.error("Failed to save chat sessions:", e);
	}
}

// 状态管理器
class ChatStore {
	private state: ChatState;
	private listeners: Set<() => void> = new Set();

	constructor() {
		this.state = loadFromStorage();
	}

	getState = () => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		this.listeners.forEach((l) => l());
	}

	private setState(updater: (state: ChatState) => ChatState) {
		this.state = updater(this.state);
		saveToStorage(this.state);
		this.emit();
	}

	// 获取当前会话
	getActiveSession(): ChatSession | null {
		if (!this.state.activeSessionId) return null;
		return (
			this.state.sessions.find((s) => s.id === this.state.activeSessionId) ||
			null
		);
	}

	// 创建新会话
	createNewSession(title?: string): ChatSession {
		const session = createSession(title);
		this.setState((state) => ({
			...state,
			sessions: [session, ...state.sessions],
			activeSessionId: session.id,
		}));
		return session;
	}

	// 切换会话
	setActiveSession(sessionId: string | null) {
		this.setState((state) => ({
			...state,
			activeSessionId: sessionId,
		}));
	}

	// 删除会话
	deleteSession(sessionId: string) {
		this.setState((state) => {
			const sessions = state.sessions.filter((s) => s.id !== sessionId);
			const activeSessionId =
				state.activeSessionId === sessionId
					? sessions[0]?.id || null
					: state.activeSessionId;
			return { ...state, sessions, activeSessionId };
		});
	}

	// 添加消息
	addMessage(sessionId: string, message: ChatMessage) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) =>
				s.id === sessionId
					? { ...s, messages: [...s.messages, message], updatedAt: Date.now() }
					: s,
			),
		}));
	}

	// 在指定消息前插入消息
	insertMessageBefore(
		sessionId: string,
		beforeMessageId: string,
		message: ChatMessage,
	) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) => {
				if (s.id !== sessionId) return s;
				const idx = s.messages.findIndex((m) => m.id === beforeMessageId);
				if (idx === -1) {
					return {
						...s,
						messages: [...s.messages, message],
						updatedAt: Date.now(),
					};
				}
				const nextMessages = [
					...s.messages.slice(0, idx),
					message,
					...s.messages.slice(idx),
				];
				return { ...s, messages: nextMessages, updatedAt: Date.now() };
			}),
		}));
	}

	// 更新消息（用于流式响应）
	updateMessage(
		sessionId: string,
		messageId: string,
		updates: Partial<ChatMessage>,
	) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) =>
				s.id === sessionId
					? {
							...s,
							messages: s.messages.map((m) =>
								m.id === messageId
									? {
											...m,
											...updates,
											metadata: (() => {
												if (updates.metadata === undefined) return m.metadata;
												const merged = {
													...(m.metadata || {}),
													...(((updates.metadata as any) || {}) as any),
												};
												const mergedBlocks = mergeFileUpdatesIntoBlocks(
													merged.blocks,
													merged.fileUpdates,
												);
												return mergedBlocks
													? { ...merged, blocks: mergedBlocks }
													: merged;
											})(),
										}
									: m,
							),
							updatedAt: Date.now(),
						}
					: s,
			),
		}));
	}

	replaceSessionMessages(sessionId: string, messages: ChatMessage[]) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) =>
				s.id === sessionId ? { ...s, messages, updatedAt: Date.now() } : s,
			),
		}));
	}

	// 更新会话标题
	updateSessionTitle(sessionId: string, title: string) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) =>
				s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s,
			),
		}));
	}

	setSessionAgentSessionId(
		sessionId: string,
		agentSessionId: string | undefined,
	) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) =>
				s.id === sessionId
					? { ...s, agentSessionId, updatedAt: Date.now() }
					: s,
			),
		}));
	}

	setSessionSdkSessionId(sessionId: string, sdkSessionId: string | undefined) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) =>
				s.id === sessionId ? { ...s, sdkSessionId, updatedAt: Date.now() } : s,
			),
		}));
	}

	// 设置状态
	setStatus(status: ChatState["status"], error?: string) {
		this.setState((state) => ({
			...state,
			status,
			error: error || null,
		}));
	}

	// 清空所有会话
	clearAllSessions() {
		this.setState(() => ({
			...initialState,
		}));
	}

	// 删除指定消息
	deleteMessage(sessionId: string, messageId: string) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) =>
				s.id === sessionId
					? {
							...s,
							messages: s.messages.filter((m) => m.id !== messageId),
							updatedAt: Date.now(),
						}
					: s,
			),
		}));
	}

	// 删除指定消息及之后的所有消息（用于重新生成）
	deleteMessagesFrom(sessionId: string, messageId: string) {
		this.setState((state) => ({
			...state,
			sessions: state.sessions.map((s) => {
				if (s.id !== sessionId) return s;
				const idx = s.messages.findIndex((m) => m.id === messageId);
				if (idx === -1) return s;
				return {
					...s,
					messages: s.messages.slice(0, idx),
					updatedAt: Date.now(),
				};
			}),
		}));
	}
}

// 单例
export const chatStore = new ChatStore();

// React Hook
export function useChatStore() {
	const state = useSyncExternalStore(
		chatStore.subscribe,
		chatStore.getState,
		chatStore.getState,
	);

	return {
		...state,
		activeSession: chatStore.getActiveSession(),
		createNewSession: chatStore.createNewSession.bind(chatStore),
		setActiveSession: chatStore.setActiveSession.bind(chatStore),
		deleteSession: chatStore.deleteSession.bind(chatStore),
		addMessage: chatStore.addMessage.bind(chatStore),
		insertMessageBefore: chatStore.insertMessageBefore.bind(chatStore),
		updateMessage: chatStore.updateMessage.bind(chatStore),
		replaceSessionMessages: chatStore.replaceSessionMessages.bind(chatStore),
		updateSessionTitle: chatStore.updateSessionTitle.bind(chatStore),
		setSessionAgentSessionId:
			chatStore.setSessionAgentSessionId.bind(chatStore),
		setSessionSdkSessionId: chatStore.setSessionSdkSessionId.bind(chatStore),
		setStatus: chatStore.setStatus.bind(chatStore),
		clearAllSessions: chatStore.clearAllSessions.bind(chatStore),
		deleteMessage: chatStore.deleteMessage.bind(chatStore),
		deleteMessagesFrom: chatStore.deleteMessagesFrom.bind(chatStore),
	};
}
