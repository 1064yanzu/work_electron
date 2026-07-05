// AI 聊天状态管理
//
// 持久化后端（F2 灰度）：
// - "sqlite"（默认）：会话/消息落 SQLite（chat_history_* IPC），内存只常驻
//   全部会话元数据 + 活跃会话全文 + 最近 3 个会话的 LRU 全文；
// - "localstorage"：旧路径原样保留（LZString 压缩整个 ChatState），
//   迁移失败自动回落，配置 app_config `chat_history_backend` 可手动切换。
import { useCallback, useRef, useSyncExternalStore } from "react";
import { parseStoredData, serializeForStorage } from "./compression";
import {
	CHAT_ACTIVE_SESSION_KEY,
	CHAT_STORAGE_BACKUP_KEY,
	type ChatHistoryBackend,
	getMessageRows,
	listSessionRows,
	migrateLocalStorageToSqlite,
	readChatHistoryBackend,
	rowToMessage,
	rowToSessionMeta,
	writeChatHistoryBackend,
} from "./historyBackend";
import { ChatSqlitePersister } from "./sqlitePersistence";
import {
	type ChatMessage,
	type ChatMessageBlock,
	type ChatSession,
	type ChatState,
	createSession,
	type FileUpdate,
	getSessionMessageCount,
	isSessionLoaded,
} from "./types";

// 本地存储 key
const STORAGE_KEY = "chat_sessions";
const EMIT_THROTTLE_MS = 16; // ~60fps
const SAVE_THROTTLE_MS = 500;
const STREAMING_SAVE_THROTTLE_MS = 2000;

/** sqlite 模式内存中最多常驻全文的会话数：活跃 1 + LRU 3 */
const MAX_LOADED_SESSIONS = 4;

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

// 从 localStorage 加载（支持压缩格式和旧格式自动迁移）。
// 主 key 缺失时尝试迁移备份 key（sqlite → localstorage 的回滚路径）。
function loadFromStorage(): ChatState {
	try {
		const stored =
			localStorage.getItem(STORAGE_KEY) ??
			localStorage.getItem(CHAT_STORAGE_BACKUP_KEY);
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
// 注：sqlite 后端（默认）不走本路径；本路径仅为 localstorage 灰度回退保留。
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
					console.error("[ChatStore] 降级写入仍然失败，本次保存被丢弃：", e2);
					return;
				}
			}
		}
		console.error("Failed to save chat sessions:", e);
	}
}

function readStoredActiveSessionId(): string | null {
	try {
		return localStorage.getItem(CHAT_ACTIVE_SESSION_KEY);
	} catch {
		return null;
	}
}

function writeStoredActiveSessionId(sessionId: string | null) {
	try {
		if (sessionId) localStorage.setItem(CHAT_ACTIVE_SESSION_KEY, sessionId);
		else localStorage.removeItem(CHAT_ACTIVE_SESSION_KEY);
	} catch {
		// 忽略：仅影响下次启动的默认选中
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

	// ===== SQLite 后端（F2）=====
	/** "pending" = 初始化中（后端未定）；期间脏标记照记，最终定型后统一处理 */
	private backend: ChatHistoryBackend | "pending" = "pending";
	private persister = new ChatSqlitePersister({ getState: () => this.state });
	/** pending 期间是否有需要 localstorage 兜底保存的变更 */
	private pendingLocalDirty = false;
	/** 会话消息加载去重 */
	private loadInFlight: Map<string, Promise<void>> = new Map();
	/** 最近访问过全文的会话 id（尾部最新），用于 LRU 逐出 */
	private lruOrder: string[] = [];
	/** 初始化完成信号（消费方可等待后端定型/首屏数据就绪） */
	readonly ready: Promise<void>;

	constructor() {
		this.state = initialState;
		this.ready = this.initialize();

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

	/** 当前生效的历史后端（初始化完成前为 "pending"） */
	getHistoryBackend(): ChatHistoryBackend | "pending" {
		return this.backend;
	}

	// ==================
	// 初始化 / 后端选择
	// ==================

	private async initialize(): Promise<void> {
		let backend: ChatHistoryBackend = "localstorage";
		try {
			backend = await readChatHistoryBackend();
		} catch {
			backend = "localstorage";
		}

		if (backend === "sqlite") {
			try {
				const migration = await migrateLocalStorageToSqlite();
				if (!migration.ok) {
					// 迁移失败：保留原 key，灰度开关回落 localstorage
					console.warn(
						"[ChatStore] chat 历史迁移 SQLite 失败，回落 localstorage 模式",
						migration.error,
					);
					await writeChatHistoryBackend("localstorage");
					this.finalizeLocalstorageBoot();
					return;
				}
				if (migration.migrated) {
					await writeChatHistoryBackend("sqlite");
				}

				const rows = await listSessionRows();
				const metaSessions = rows.map(rowToSessionMeta);
				this.backend = "sqlite";
				this.mergeLoadedState(metaSessions, readStoredActiveSessionId());
				this.persister.schedule("normal"); // 补 flush pending 期间的标记

				const activeId = this.state.activeSessionId;
				if (activeId) {
					await this.ensureSessionLoaded(activeId);
				}
				return;
			} catch (e) {
				// DB 读取失败（非迁移失败）：本次运行回落 localstorage，不改配置，
				// 下次启动仍会尝试 sqlite。
				console.warn(
					"[ChatStore] SQLite 后端初始化失败，本次运行回落 localstorage:",
					e,
				);
				this.finalizeLocalstorageBoot();
				return;
			}
		}

		this.finalizeLocalstorageBoot();
	}

	private finalizeLocalstorageBoot() {
		this.backend = "localstorage";
		this.persister.reset();
		const loaded = loadFromStorage();
		this.mergeLoadedState(loaded.sessions, loaded.activeSessionId);
		if (this.pendingLocalDirty) {
			this.pendingLocalDirty = false;
			this.scheduleSave("normal");
		}
	}

	/** 把异步加载到的会话并入当前 state（保留初始化窗口期内新建的会话） */
	private mergeLoadedState(
		loadedSessions: ChatSession[],
		loadedActiveId: string | null,
	) {
		const droppedBlankIds: string[] = [];
		this.setState((state) => {
			// 初始化窗口期内 UI 兜底自建的"纯空白"会话（无消息/无归属）在有历史
			// 数据时丢弃，避免每次启动都顶掉上次的活跃会话、并在 DB 里堆积空行。
			const keptInMemory =
				loadedSessions.length > 0
					? state.sessions.filter((s) => {
							const isBlank =
								s.messages.length === 0 &&
								!s.cwd &&
								!s.agentSessionId &&
								!s.threadSource;
							if (isBlank) droppedBlankIds.push(s.id);
							return !isBlank;
						})
					: state.sessions;
			const inMemoryIds = new Set(keptInMemory.map((s) => s.id));
			const sessions = [
				...keptInMemory,
				...loadedSessions.filter((s) => !inMemoryIds.has(s.id)),
			];
			const pickActive = (): string | null => {
				if (
					state.activeSessionId &&
					sessions.some((s) => s.id === state.activeSessionId)
				) {
					return state.activeSessionId;
				}
				if (loadedActiveId && sessions.some((s) => s.id === loadedActiveId)) {
					return loadedActiveId;
				}
				return sessions[0]?.id ?? null;
			};
			return { ...state, sessions, activeSessionId: pickActive() };
		}, "normal");
		// 空白会话若已被抢先 flush 成 DB 行，一并清掉（幂等删除）
		if (this.trackSqlite) {
			for (const id of droppedBlankIds) {
				this.persister.noteSessionDeleted(id);
			}
		}
	}

	// ==================
	// 会话消息按需加载（sqlite 模式）
	// ==================

	/**
	 * 确保会话消息全文已在内存。localstorage 模式下恒为已加载（no-op）。
	 * DB 加载结果与内存中的新增消息按 id 去重合并（未加载期间的追加不丢）。
	 */
	async ensureSessionLoaded(sessionId: string): Promise<void> {
		if (this.backend === "pending") {
			await this.ready;
		}
		if (this.backend !== "sqlite") return;

		const session = this.state.sessions.find((s) => s.id === sessionId);
		if (!session) return;
		if (isSessionLoaded(session)) {
			this.touchLoaded(sessionId);
			return;
		}

		const inFlight = this.loadInFlight.get(sessionId);
		if (inFlight) return inFlight;

		const promise = (async () => {
			try {
				const rows = await getMessageRows(sessionId);
				const dbMessages = rows.map(rowToMessage);
				this.setState((state) => {
					const target = state.sessions.find((s) => s.id === sessionId);
					if (!target || isSessionLoaded(target)) return state;
					const dbIds = new Set(dbMessages.map((m) => m.id));
					// 未加载期间追加的内存消息（远控注入等）排在 DB 消息之后
					const extras = target.messages.filter((m) => !dbIds.has(m.id));
					const merged = [...dbMessages, ...extras];
					return {
						...state,
						sessions: state.sessions.map((s) =>
							s.id === sessionId
								? {
										...s,
										messages: merged,
										messagesLoaded: true,
										messageCount: merged.length,
									}
								: s,
						),
					};
				}, "normal");
				this.touchLoaded(sessionId);
			} catch (e) {
				// 加载失败：会话保持未加载态，内存中已有的消息不受影响
				console.warn(`[ChatStore] 加载会话消息失败: ${sessionId}`, e);
			} finally {
				this.loadInFlight.delete(sessionId);
			}
		})();
		this.loadInFlight.set(sessionId, promise);
		return promise;
	}

	private touchLoaded(sessionId: string) {
		this.lruOrder = this.lruOrder.filter((id) => id !== sessionId);
		this.lruOrder.push(sessionId);
		this.evictIfNeeded();
	}

	/** 超出「活跃 + LRU 3」的已加载会话逐出全文（保留元数据 + 预览） */
	private evictIfNeeded() {
		if (this.backend !== "sqlite") return;

		const keep = new Set<string>();
		if (this.state.activeSessionId) keep.add(this.state.activeSessionId);
		for (
			let i = this.lruOrder.length - 1;
			i >= 0 && keep.size < MAX_LOADED_SESSIONS;
			i--
		) {
			keep.add(this.lruOrder[i]);
		}

		const evictableIds = new Set(
			this.state.sessions
				.filter(
					(s) =>
						isSessionLoaded(s) &&
						s.messages.length > 0 &&
						!keep.has(s.id) &&
						// 有未落库工作 / 正在流式输出的会话不能逐出（内存是唯一事实源）
						!this.persister.hasPendingWork(s.id) &&
						s.messages.at(-1)?.isStreaming !== true,
				)
				.map((s) => s.id),
		);
		if (evictableIds.size === 0) return;

		this.lruOrder = this.lruOrder.filter((id) => !evictableIds.has(id));
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) => {
					if (!evictableIds.has(s.id)) return s;
					const lastMsg = s.messages.at(-1);
					let lastUserPreview = s.lastUserPreview;
					for (let i = s.messages.length - 1; i >= 0; i--) {
						if (s.messages[i].role === "user") {
							lastUserPreview = s.messages[i].content.slice(0, 200);
							break;
						}
					}
					return {
						...s,
						messages: [],
						messagesLoaded: false,
						messageCount: s.messages.length,
						lastPreview: lastMsg
							? {
									role: lastMsg.role,
									content: lastMsg.content.slice(0, 200),
									timestamp: lastMsg.timestamp,
								}
							: s.lastPreview,
						lastUserPreview,
					};
				}),
			}),
			"normal",
		);
	}

	// ==================
	// 持久化调度（双后端分流）
	// ==================

	private schedulePersist(mode: PersistMode) {
		if (this.backend === "sqlite") {
			this.persister.schedule(mode);
			return;
		}
		if (this.backend === "localstorage") {
			this.scheduleSave(mode);
			return;
		}
		// pending：后端未定。sqlite 用的脏标记已在各 mutation 里登记；
		// 若最终落到 localstorage，用该标记补一次全量保存。
		this.pendingLocalDirty = true;
	}

	/** 当前是否需要登记 sqlite 脏标记（pending 期间也记，定型后统一处理） */
	private get trackSqlite(): boolean {
		return this.backend !== "localstorage";
	}

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
			if (this.backend === "sqlite") {
				// beforeunload 场景 best-effort；失败标记保留，下次启动数据仍在内存策略保护下
				void this.persister.flushAll();
				return;
			}

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
		const nextState = updater(this.state);
		if (Object.is(nextState, this.state)) {
			return;
		}
		const prevActiveId = this.state.activeSessionId;
		this.state = nextState;
		if (nextState.activeSessionId !== prevActiveId) {
			writeStoredActiveSessionId(nextState.activeSessionId);
		}
		this.schedulePersist(persist);
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
		// 检查是否已有空会话（没有消息的会话）；
		// 未加载会话用 DB 派生的 messageCount 判断，避免把有历史的会话误判为空。
		const existingEmptySession = this.state.sessions.find(
			(s) => getSessionMessageCount(s) === 0,
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
			this.setActiveSession(existingEmptySession.id);
			return existingEmptySession;
		}

		// 没有空会话，创建新的
		const session = createSession(title);
		if (this.trackSqlite) this.persister.noteSessionMeta(session.id);
		this.setState(
			(state) => ({
				...state,
				sessions: [session, ...state.sessions],
				activeSessionId: session.id,
			}),
			"normal",
		);
		this.touchLoaded(session.id);
		return session;
	}

	// 创建全新会话（不复用空会话）
	createFreshSession(title?: string): ChatSession {
		const session = createSession(title);
		if (this.trackSqlite) this.persister.noteSessionMeta(session.id);
		this.setState(
			(state) => ({
				...state,
				sessions: [session, ...state.sessions],
				activeSessionId: session.id,
			}),
			"normal",
		);
		this.touchLoaded(session.id);
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
		if (sessionId) {
			void this.ensureSessionLoaded(sessionId);
		}
	}

	// 删除会话
	deleteSession(sessionId: string) {
		this.clearDeletedSession(sessionId);
		if (this.trackSqlite) this.persister.noteSessionDeleted(sessionId);
		this.lruOrder = this.lruOrder.filter((id) => id !== sessionId);
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
	// sqlite 模式：撤销窗口内不动 DB（未加载会话的快照只有元数据，
	// 若先删 DB 再撤销会丢消息），窗口过期才真正落删除。
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
			// 撤销窗口过期：真正删除 DB 行
			if (this.trackSqlite) {
				this.persister.noteSessionDeleted(sessionId);
				this.persister.schedule("normal");
			}
		}, windowMs);
		this.deletedSessionTimers.set(sessionId, timer);

		this.lruOrder = this.lruOrder.filter((id) => id !== sessionId);
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
		if (this.trackSqlite) this.persister.noteSessionMeta(sessionId);
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
		const target = this.state.sessions.find((s) => s.id === sessionId);
		if (this.trackSqlite) {
			this.persister.noteMessageDirty(sessionId, message.id);
		}
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
		// 未加载会话被追加消息（远控注入等）：立即触发按需加载 + 合并，
		// 避免长期停留在"部分消息"状态。
		if (target && !isSessionLoaded(target)) {
			void this.ensureSessionLoaded(sessionId);
		} else {
			this.touchLoaded(sessionId);
		}
	}

	// 在指定消息前插入消息
	insertMessageBefore(
		sessionId: string,
		beforeMessageId: string,
		message: ChatMessage,
	) {
		// 插入会整体改变后续消息的 seq，走全量 replace
		if (this.trackSqlite) this.persister.noteSessionReplace(sessionId);
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
		this.touchLoaded(sessionId);
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

		if (this.trackSqlite) {
			this.persister.noteMessageDirty(sessionId, messageId);
			if (updates.isStreaming === false) {
				// 流结束/中止：全量兜底该会话（消息 id 集合在 setState 前后不变）
				this.persister.noteSessionAllDirty(sessionId);
			}
		}

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
		if (this.trackSqlite) this.persister.noteSessionReplace(sessionId);
		this.setState(
			(state) => ({
				...state,
				sessions: state.sessions.map((s) =>
					s.id === sessionId
						? {
								...s,
								messages,
								// 调用方给出的是该会话的完整消息集，视为已加载
								messagesLoaded: true,
								messageCount: messages.length,
								updatedAt: Date.now(),
							}
						: s,
				),
			}),
			"normal",
		);
		this.touchLoaded(sessionId);
	}

	// 更新会话标题
	updateSessionTitle(sessionId: string, title: string) {
		if (this.trackSqlite) this.persister.noteSessionMeta(sessionId);
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
		if (this.trackSqlite) this.persister.noteSessionMeta(sessionId);
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
		if (this.trackSqlite) this.persister.noteSessionMeta(sessionId);
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
		if (this.trackSqlite) this.persister.noteSessionMeta(sessionId);
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
		if (this.trackSqlite) this.persister.noteSessionMeta(sessionId);
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
		if (this.trackSqlite) this.persister.noteSessionMeta(sessionId);
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
		if (this.trackSqlite) this.persister.noteSessionMeta(sessionId);
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
		if (this.trackSqlite) {
			for (const session of this.state.sessions) {
				this.persister.noteSessionDeleted(session.id);
			}
			// 撤销窗口里的会话也一并清掉
			for (const sessionId of this.deletedSessions.keys()) {
				this.persister.noteSessionDeleted(sessionId);
			}
		}
		this.clearAllDeletedSessions();
		this.lruOrder = [];
		this.setState(() => ({ ...initialState }), "immediate");
	}

	// 删除指定消息
	deleteMessage(sessionId: string, messageId: string) {
		// 删除中间消息会改变后续 seq，走全量 replace（同时清掉被删行）
		if (this.trackSqlite) this.persister.noteSessionReplace(sessionId);
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
		// 截断式删除：前缀消息 seq 不变，只需删除被截断的行
		if (this.trackSqlite) {
			const session = this.state.sessions.find((s) => s.id === sessionId);
			if (session) {
				const idx = session.messages.findIndex((m) => m.id === messageId);
				if (idx !== -1) {
					this.persister.noteMessagesDeleted(
						sessionId,
						session.messages.slice(idx).map((m) => m.id),
					);
				}
			}
		}
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
	ensureSessionLoaded: chatStore.ensureSessionLoaded.bind(chatStore),
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
