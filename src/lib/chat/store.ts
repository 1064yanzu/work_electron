// AI 聊天状态管理
import { useCallback, useRef, useSyncExternalStore } from "react";
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

interface DeletedSessionSnapshot {
	session: ChatSession;
	index: number;
	wasActive: boolean;
	expiresAt: number;
}

function sameFileUpdate(a: FileUpdate, b: FileUpdate): boolean {
	return (
		a.fileName === b.fileName &&
		a.filePath === b.filePath &&
		a.type === b.type &&
		a.additions === b.additions &&
		a.deletions === b.deletions &&
		a.status === b.status &&
		a.toolCallId === b.toolCallId
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
				((update.toolCallId &&
					b.update.toolCallId &&
					b.update.toolCallId === update.toolCallId) ||
					(b.update.fileName === update.fileName &&
						b.update.type === update.type)),
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
// 触发 QuotaExceededError 时降级：临时把最旧的非 pinned / 非 archived 会话排除掉再重试，
// 让用户至少能保留近期与置顶会话。被剔除的会话仍在内存 state.sessions 中，
// 用户当次会话仍可访问；下次启动这些会话会从 localStorage 丢失。
// TODO: 后续把超额会话迁移到 SQLite，详见 plans/performance-optimization-plan.md P3-1。
const QUOTA_FALLBACK_KEEP_MIN = 50; // 保留至少这么多最近 + 置顶 + 归档的会话
let quotaWarningShown = false;

function trimSessionsForQuota(state: ChatState): ChatState | null {
	const sessions = state.sessions;
	if (sessions.length <= QUOTA_FALLBACK_KEEP_MIN) return null;

	// 优先保留 pinned + archived（用户主动管理过的），其次按 updatedAt 倒序保留最近的
	const pinned = sessions.filter((s) => s.isPinned || s.isArchived);
	const others = sessions
		.filter((s) => !s.isPinned && !s.isArchived)
		.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

	const keepOthers = others.slice(
		0,
		Math.max(0, QUOTA_FALLBACK_KEEP_MIN - pinned.length),
	);
	const kept = [...pinned, ...keepOthers].sort(
		(a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
	);

	if (kept.length === sessions.length) return null;
	return { ...state, sessions: kept };
}

function saveToStorage(state: ChatState) {
	try {
		const compressed = serializeForStorage(state);
		localStorage.setItem(STORAGE_KEY, compressed);
	} catch (e) {
		const isQuota =
			e instanceof DOMException &&
			(e.name === "QuotaExceededError" ||
				e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
				e.code === 22 ||
				e.code === 1014);
		if (isQuota) {
			const trimmed = trimSessionsForQuota(state);
			if (trimmed) {
				try {
					localStorage.setItem(STORAGE_KEY, serializeForStorage(trimmed));
					if (!quotaWarningShown) {
						quotaWarningShown = true;
						console.warn(
							`[ChatStore] localStorage 配额已满，本次只持久化最近 ${trimmed.sessions.length} / ${state.sessions.length} 条会话；最旧的非置顶/非归档会话将不再保留到下次启动。建议手动归档或导出旧会话。`,
						);
					}
					return;
				} catch (e2) {
					console.error(
						"[ChatStore] 降级写入仍然失败，本次保存被丢弃：",
						e2,
					);
					return;
				}
			}
		}
		console.error("Failed to save chat sessions:", e);
	}
}

// 状态管理器
class ChatStore {
	private state: ChatState;
	private listeners: Set<() => void> = new Set();
	private emitScheduled = false;
	private lastEmitTime = 0;
	private deletedSessions: Map<string, DeletedSessionSnapshot> = new Map();
	private deletedSessionTimers: Map<string, ReturnType<typeof setTimeout>> =
		new Map();

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

	private clearDeletedSession(sessionId: string) {
		const timer = this.deletedSessionTimers.get(sessionId);
		if (timer) {
			clearTimeout(timer);
			this.deletedSessionTimers.delete(sessionId);
		}
		this.deletedSessions.delete(sessionId);
	}

	private clearAllDeletedSessions() {
		for (const sessionId of this.deletedSessionTimers.keys()) {
			this.clearDeletedSession(sessionId);
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

	// 创建新会话（如果已有空会话则复用）
	createNewSession(title?: string): ChatSession {
		// 检查是否已有空会话（没有消息的会话）
		const existingEmptySession = this.state.sessions.find(
			(s) => s.messages.length === 0,
		);

		// 如果当前激活的就是空会话，直接返回它
		if (
			existingEmptySession &&
			this.state.activeSessionId === existingEmptySession.id
		) {
			return existingEmptySession;
		}

		// 如果有空会话但不是当前激活的，切换到它
		if (existingEmptySession) {
			this.setState(
				(state) => ({
					...state,
					activeSessionId: existingEmptySession.id,
				}),
				"normal",
			);
			return existingEmptySession;
		}

		// 没有空会话，创建新的
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

	// 创建全新会话（不复用空会话）
	createFreshSession(title?: string): ChatSession {
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
		this.clearDeletedSession(sessionId);
		this.setState((state) => {
			const sessions = state.sessions.filter((s) => s.id !== sessionId);
			const activeSessionId =
				state.activeSessionId === sessionId
					? sessions[0]?.id || null
					: state.activeSessionId;
			return { ...state, sessions, activeSessionId };
		}, "normal");
	}

	// 删除会话（支持撤销）
	deleteSessionWithUndo(sessionId: string, undoWindowMs = 5000) {
		const index = this.state.sessions.findIndex(
			(session) => session.id === sessionId,
		);
		if (index < 0) return null;

		const session = this.state.sessions[index];
		const windowMs = Math.max(1000, undoWindowMs);
		const expiresAt = Date.now() + windowMs;
		const wasActive = this.state.activeSessionId === sessionId;

		this.clearDeletedSession(sessionId);
		this.deletedSessions.set(sessionId, {
			session,
			index,
			wasActive,
			expiresAt,
		});
		const timer = setTimeout(() => {
			this.clearDeletedSession(sessionId);
		}, windowMs);
		this.deletedSessionTimers.set(sessionId, timer);

		this.setState((state) => {
			const sessions = state.sessions.filter((item) => item.id !== sessionId);
			const activeSessionId =
				state.activeSessionId === sessionId
					? sessions[0]?.id || null
					: state.activeSessionId;
			return { ...state, sessions, activeSessionId };
		}, "normal");

		return {
			sessionId,
			title: session.title,
			expiresAt,
			undoWindowMs: windowMs,
		};
	}

	undoDeleteSession(sessionId: string) {
		const snapshot = this.deletedSessions.get(sessionId);
		if (!snapshot) return false;
		if (snapshot.expiresAt < Date.now()) {
			this.clearDeletedSession(sessionId);
			return false;
		}

		this.clearDeletedSession(sessionId);
		this.setState((state) => {
			if (state.sessions.some((item) => item.id === sessionId)) {
				return state;
			}
			const sessions = [...state.sessions];
			const insertAt = Math.max(0, Math.min(snapshot.index, sessions.length));
			sessions.splice(insertAt, 0, snapshot.session);
			return {
				...state,
				sessions,
				activeSessionId: snapshot.wasActive
					? snapshot.session.id
					: state.activeSessionId || snapshot.session.id,
			};
		}, "normal");
		return true;
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

	setSessionDesignId(
		sessionId: string,
		designSessionId: string | undefined,
	) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId
						? { ...s, designSessionId, updatedAt: Date.now() }
						: s,
				),
			}),
			"normal",
		);
	}

	findSessionByDesignId(designSessionId: string): ChatSession | null {
		return (
			this.state.sessions.find(
				(s) => s.designSessionId === designSessionId,
			) ?? null
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

	// 设置会话关联的工作目录（用于线程按项目分组）
	setSessionCwd(sessionId: string, cwd: string | undefined) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId ? { ...s, cwd, updatedAt: Date.now() } : s,
				),
			}),
			"normal",
		);
	}

	setSessionPinned(sessionId: string, isPinned: boolean) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId ? { ...s, isPinned, updatedAt: Date.now() } : s,
				),
			}),
			"normal",
		);
	}

	setSessionArchived(sessionId: string, isArchived: boolean) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId ? { ...s, isArchived, updatedAt: Date.now() } : s,
				),
			}),
			"normal",
		);
	}

	// 设置会话来源（用于线程区分本地项目对话与远程对话）
	setSessionThreadSource(
		sessionId: string,
		threadSource: ChatSession["threadSource"] | undefined,
	) {
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId
						? { ...s, threadSource, updatedAt: Date.now() }
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
		this.clearAllDeletedSessions();
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
	createFreshSession: chatStore.createFreshSession.bind(chatStore),
	setActiveSession: chatStore.setActiveSession.bind(chatStore),
	deleteSession: chatStore.deleteSession.bind(chatStore),
	deleteSessionWithUndo: chatStore.deleteSessionWithUndo.bind(chatStore),
	undoDeleteSession: chatStore.undoDeleteSession.bind(chatStore),
	addMessage: chatStore.addMessage.bind(chatStore),
	insertMessageBefore: chatStore.insertMessageBefore.bind(chatStore),
	updateMessage: chatStore.updateMessage.bind(chatStore),
	replaceSessionMessages: chatStore.replaceSessionMessages.bind(chatStore),
	updateSessionTitle: chatStore.updateSessionTitle.bind(chatStore),
	setSessionAgentSessionId: chatStore.setSessionAgentSessionId.bind(chatStore),
	setSessionDesignId: chatStore.setSessionDesignId.bind(chatStore),
	findSessionByDesignId: chatStore.findSessionByDesignId.bind(chatStore),
	setSessionSdkSessionId: chatStore.setSessionSdkSessionId.bind(chatStore),
	setSessionCwd: chatStore.setSessionCwd.bind(chatStore),
	setSessionPinned: chatStore.setSessionPinned.bind(chatStore),
	setSessionArchived: chatStore.setSessionArchived.bind(chatStore),
	setSessionThreadSource: chatStore.setSessionThreadSource.bind(chatStore),
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

// Selector Hook - 按需订阅 chat 状态，减少无关重渲染
export function useChatStoreSelector<T>(selector: (state: ChatState) => T): T {
	const selectorRef = useRef(selector);
	selectorRef.current = selector;

	const getSnapshot = useCallback(
		() => selectorRef.current(chatStore.getState()),
		[],
	);

	return useSyncExternalStore(chatStore.subscribe, getSnapshot, getSnapshot);
}
