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
const EMIT_THROTTLE_MS = 16; // ~60fps
const SAVE_THROTTLE_MS = 500;
const STREAMING_SAVE_THROTTLE_MS = 2000;

type PersistMode = "normal" | "streaming" | "immediate";

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
	} catch (e) {
		console.error("Failed to save chat sessions:", e);
	}
}

// 状态管理器
class ChatStore {
	private state: ChatState;
	private listeners: Set<() => void> = new Set();
	private emitScheduled = false;
	private lastEmitTime = 0;

	private saveScheduled = false;
	private lastSaveTime = 0;
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private idleSaveId: number | null = null;

	constructor() {
		this.state = loadFromStorage();

		// Best-effort flush to storage on lifecycle events (prevents losing last chunks)
		if (typeof window !== "undefined") {
			window.addEventListener("beforeunload", () => {
				this.flush();
			});
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "hidden") this.flush();
			});
		}
	}

	getState = () => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		this.listeners.forEach((l) => l());
	}

	private scheduleEmit() {
		const now = Date.now();
		if (now - this.lastEmitTime >= EMIT_THROTTLE_MS) {
			this.emit();
			this.lastEmitTime = now;
			return;
		}
		if (!this.emitScheduled) {
			this.emitScheduled = true;
			setTimeout(
				() => {
					this.emitScheduled = false;
					this.emit();
					this.lastEmitTime = Date.now();
				},
				EMIT_THROTTLE_MS - (now - this.lastEmitTime),
			);
		}
	}

	private queueIdleSave() {
		if (this.saveScheduled) return;
		this.saveScheduled = true;

		const run = () => {
			this.saveScheduled = false;
			saveToStorage(this.state);
			this.lastSaveTime = Date.now();
		};

		if (
			typeof window !== "undefined" &&
			typeof (window as any).requestIdleCallback === "function"
		) {
			// Prefer idle time to avoid blocking typing/scrolling.
			this.idleSaveId = (window as any).requestIdleCallback(run, {
				timeout: 1500,
			});
			return;
		}

		// Fallback: synchronous save.
		run();
	}

	private scheduleSave(mode: PersistMode) {
		if (mode === "immediate") {
			// Save soon (but not synchronously) to avoid jank on user interactions.
			if (this.saveTimeout !== null) {
				clearTimeout(this.saveTimeout);
				this.saveTimeout = null;
			}
			this.queueIdleSave();
			return;
		}

		const throttleMs =
			mode === "streaming" ? STREAMING_SAVE_THROTTLE_MS : SAVE_THROTTLE_MS;

		const now = Date.now();
		if (now - this.lastSaveTime >= throttleMs) {
			this.queueIdleSave();
			return;
		}

		if (this.saveTimeout !== null) return;

		this.saveTimeout = setTimeout(
			() => {
				this.saveTimeout = null;
				this.queueIdleSave();
			},
			throttleMs - (now - this.lastSaveTime),
		);
	}

	flush() {
		try {
			if (this.saveTimeout !== null) {
				clearTimeout(this.saveTimeout);
				this.saveTimeout = null;
			}

			if (
				this.idleSaveId !== null &&
				typeof window !== "undefined" &&
				typeof (window as any).cancelIdleCallback === "function"
			) {
				(window as any).cancelIdleCallback(this.idleSaveId);
			}
			this.idleSaveId = null;
			this.saveScheduled = false;

			saveToStorage(this.state);
			this.lastSaveTime = Date.now();
		} catch (e) {
			console.error("Failed to flush chat sessions:", e);
		}
	}

	private setState(
		updater: (state: ChatState) => ChatState,
		persist: PersistMode,
	) {
		this.state = updater(this.state);
		this.scheduleSave(persist);
		this.scheduleEmit();
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
		this.setState(
			(state) => ({
				...state,
				sessions: [session, ...state.sessions],
				activeSessionId: session.id,
			}),
			"normal",
		);
		return session;
	}

	// 切换会话
	setActiveSession(sessionId: string | null) {
		this.setState(
			(state) => ({
				...state,
				activeSessionId: sessionId,
			}),
			"normal",
		);
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
		}, "normal");
	}

	// 添加消息
	addMessage(sessionId: string, message: ChatMessage) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId
						? {
								...s,
								messages: [...s.messages, message],
								updatedAt: Date.now(),
							}
						: s,
				),
			}),
			message.isStreaming ? "streaming" : "normal",
		);
	}

	// 在指定消息前插入消息
	insertMessageBefore(
		sessionId: string,
		beforeMessageId: string,
		message: ChatMessage,
	) {
		this.setState(
			(state) => ({
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
			}),
			message.isStreaming ? "streaming" : "normal",
		);
	}

	// 更新消息（用于流式响应）
	updateMessage(
		sessionId: string,
		messageId: string,
		updates: Partial<ChatMessage>,
	) {
		const prevSession = this.state.sessions.find((s) => s.id === sessionId);
		const prevMessage = prevSession?.messages.find((m) => m.id === messageId);
		const prevIsStreaming = Boolean(prevMessage?.isStreaming);
		const nextIsStreaming =
			typeof updates.isStreaming === "boolean"
				? updates.isStreaming
				: prevIsStreaming;

		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId
						? {
								...s,
								messages: s.messages.map((m) => {
									if (m.id !== messageId) return m;
									const updated = {
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
									} satisfies ChatMessage;
									return updated;
								}),
								updatedAt: Date.now(),
							}
						: s,
				),
			}),
			updates.isStreaming === false
				? "immediate"
				: nextIsStreaming
					? "streaming"
					: "normal",
		);
	}

	replaceSessionMessages(sessionId: string, messages: ChatMessage[]) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId ? { ...s, messages, updatedAt: Date.now() } : s,
				),
			}),
			"normal",
		);
	}

	// 更新会话标题
	updateSessionTitle(sessionId: string, title: string) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s,
				),
			}),
			"normal",
		);
	}

	setSessionAgentSessionId(
		sessionId: string,
		agentSessionId: string | undefined,
	) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId
						? { ...s, agentSessionId, updatedAt: Date.now() }
						: s,
				),
			}),
			"normal",
		);
	}

	setSessionSdkSessionId(sessionId: string, sdkSessionId: string | undefined) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId
						? { ...s, sdkSessionId, updatedAt: Date.now() }
						: s,
				),
			}),
			"normal",
		);
	}

	// 设置状态
	setStatus(status: ChatState["status"], error?: string) {
		this.setState(
			(state) => ({
				...state,
				status,
				error: error || null,
			}),
			"normal",
		);
	}

	// 清空所有会话
	clearAllSessions() {
		this.setState(() => ({ ...initialState }), "immediate");
	}

	// 删除指定消息
	deleteMessage(sessionId: string, messageId: string) {
		this.setState(
			(state) => ({
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
			}),
			"normal",
		);
	}

	// 删除指定消息及之后的所有消息（用于重新生成）
	deleteMessagesFrom(sessionId: string, messageId: string) {
		this.setState(
			(state) => ({
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
			}),
			"normal",
		);
	}
}

// 单例
export const chatStore = new ChatStore();

const chatActions = {
	createNewSession: chatStore.createNewSession.bind(chatStore),
	setActiveSession: chatStore.setActiveSession.bind(chatStore),
	deleteSession: chatStore.deleteSession.bind(chatStore),
	addMessage: chatStore.addMessage.bind(chatStore),
	insertMessageBefore: chatStore.insertMessageBefore.bind(chatStore),
	updateMessage: chatStore.updateMessage.bind(chatStore),
	replaceSessionMessages: chatStore.replaceSessionMessages.bind(chatStore),
	updateSessionTitle: chatStore.updateSessionTitle.bind(chatStore),
	setSessionAgentSessionId: chatStore.setSessionAgentSessionId.bind(chatStore),
	setSessionSdkSessionId: chatStore.setSessionSdkSessionId.bind(chatStore),
	setStatus: chatStore.setStatus.bind(chatStore),
	clearAllSessions: chatStore.clearAllSessions.bind(chatStore),
	deleteMessage: chatStore.deleteMessage.bind(chatStore),
	deleteMessagesFrom: chatStore.deleteMessagesFrom.bind(chatStore),
	flush: chatStore.flush.bind(chatStore),
};

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
		...chatActions,
	};
}
