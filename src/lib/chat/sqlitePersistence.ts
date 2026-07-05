/**
 * Chat 历史 SQLite 落库器（F2）
 *
 * 只做「脏标记 + 节流 flush」：store 的每次变更登记细粒度脏标记，
 * flush 时按会话聚合成少量 IPC 调用（upsert 会话行 → 批量 upsert 消息）。
 *
 * 落库节奏：
 * - streaming：5s 节流（脏标记天然只含活跃的那条流式消息 + 会话元数据）；
 * - normal：500ms 节流；
 * - immediate：尽快（流结束 / abort / beforeunload 的全量 flush）。
 *
 * 可靠性铁律：任何 IPC 失败都不丢内存数据——失败的标记原样放回，
 * 定时重试；内存 state 永远是事实源。
 */
import type { ChatHistoryMessageInput } from "../../../electron/shared/ipc-schema";
import {
	deleteSessionRow,
	messageToRowInput,
	saveMessageRows,
	sessionToRowInput,
	upsertSessionRow,
} from "./historyBackend";
import { type ChatState, isSessionLoaded } from "./types";

export type SqlitePersistMode = "normal" | "streaming" | "immediate";

const NORMAL_THROTTLE_MS = 500;
const STREAMING_THROTTLE_MS = 5000;
const RETRY_DELAY_MS = 5000;

interface PersisterDeps {
	getState: () => ChatState;
}

export class ChatSqlitePersister {
	private dirtyMessageIds = new Map<string, Set<string>>();
	private replaceSessionIds = new Set<string>();
	private deleteMessageIds = new Map<string, Set<string>>();
	private dirtySessionIds = new Set<string>();
	private deletedSessionIds = new Set<string>();

	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private flushTimerDue = 0;
	private lastFlushTime = 0;
	private flushing = false;
	private pendingFlush = false;

	constructor(private deps: PersisterDeps) {}

	// ============ 脏标记登记 ============

	noteSessionMeta(sessionId: string) {
		this.dirtySessionIds.add(sessionId);
	}

	noteMessageDirty(sessionId: string, messageId: string) {
		let set = this.dirtyMessageIds.get(sessionId);
		if (!set) {
			set = new Set();
			this.dirtyMessageIds.set(sessionId, set);
		}
		set.add(messageId);
		this.dirtySessionIds.add(sessionId);
	}

	/** 全会话消息 upsert（顺序号可能整体变化：插入/删除中间消息/整体替换） */
	noteSessionReplace(sessionId: string) {
		this.replaceSessionIds.add(sessionId);
		this.dirtyMessageIds.delete(sessionId);
		this.deleteMessageIds.delete(sessionId);
		this.dirtySessionIds.add(sessionId);
	}

	/** 全会话消息 upsert（不删已有行；用于流结束时的全量兜底） */
	noteSessionAllDirty(sessionId: string) {
		if (this.replaceSessionIds.has(sessionId)) return;
		const session = this.deps
			.getState()
			.sessions.find((s) => s.id === sessionId);
		if (!session) return;
		for (const msg of session.messages) {
			this.noteMessageDirty(sessionId, msg.id);
		}
		this.dirtySessionIds.add(sessionId);
	}

	noteMessagesDeleted(sessionId: string, messageIds: string[]) {
		if (messageIds.length === 0) return;
		let set = this.deleteMessageIds.get(sessionId);
		if (!set) {
			set = new Set();
			this.deleteMessageIds.set(sessionId, set);
		}
		for (const id of messageIds) {
			set.add(id);
			this.dirtyMessageIds.get(sessionId)?.delete(id);
		}
		this.dirtySessionIds.add(sessionId);
	}

	noteSessionDeleted(sessionId: string) {
		this.deletedSessionIds.add(sessionId);
		this.dirtySessionIds.delete(sessionId);
		this.dirtyMessageIds.delete(sessionId);
		this.deleteMessageIds.delete(sessionId);
		this.replaceSessionIds.delete(sessionId);
	}

	/** LRU 逐出前检查：该会话是否还有未落库的工作 */
	hasPendingWork(sessionId: string): boolean {
		return (
			this.deletedSessionIds.has(sessionId) ||
			this.dirtySessionIds.has(sessionId) ||
			this.replaceSessionIds.has(sessionId) ||
			this.dirtyMessageIds.has(sessionId) ||
			this.deleteMessageIds.has(sessionId)
		);
	}

	/** 丢弃全部标记（初始化最终落到 localstorage 模式时调用，防泄漏） */
	reset() {
		this.dirtyMessageIds.clear();
		this.replaceSessionIds.clear();
		this.deleteMessageIds.clear();
		this.dirtySessionIds.clear();
		this.deletedSessionIds.clear();
		if (this.flushTimer !== null) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}

	private hasAnyWork(): boolean {
		return (
			this.deletedSessionIds.size > 0 ||
			this.dirtySessionIds.size > 0 ||
			this.replaceSessionIds.size > 0 ||
			this.dirtyMessageIds.size > 0 ||
			this.deleteMessageIds.size > 0
		);
	}

	// ============ 调度 ============

	schedule(mode: SqlitePersistMode) {
		if (!this.hasAnyWork()) return;
		const throttleMs =
			mode === "immediate"
				? 0
				: mode === "streaming"
					? STREAMING_THROTTLE_MS
					: NORMAL_THROTTLE_MS;
		const now = Date.now();
		const due = Math.max(now, this.lastFlushTime + throttleMs);

		if (this.flushTimer !== null) {
			if (due >= this.flushTimerDue) return; // 已有更早的计划
			clearTimeout(this.flushTimer);
		}
		this.flushTimerDue = due;
		this.flushTimer = setTimeout(
			() => {
				this.flushTimer = null;
				void this.runFlush();
			},
			Math.max(0, due - now),
		);
	}

	/** 立即 flush 全部标记（流结束 / beforeunload / 退出前调用） */
	flushAll(): Promise<void> {
		if (this.flushTimer !== null) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		return this.runFlush();
	}

	private scheduleRetry() {
		if (this.flushTimer !== null) return;
		this.flushTimerDue = Date.now() + RETRY_DELAY_MS;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			void this.runFlush();
		}, RETRY_DELAY_MS);
	}

	// ============ flush ============

	private async runFlush(): Promise<void> {
		if (this.flushing) {
			this.pendingFlush = true;
			return;
		}
		this.flushing = true;
		let hadFailure = false;

		try {
			// 1) 删除会话（消息级联）
			const deleted = Array.from(this.deletedSessionIds);
			this.deletedSessionIds.clear();
			for (const id of deleted) {
				try {
					await deleteSessionRow(id);
				} catch (e) {
					this.deletedSessionIds.add(id);
					hadFailure = true;
					console.warn(`[chatHistory] 删除会话落库失败（将重试）: ${id}`, e);
				}
			}

			// 2) 按会话聚合处理元数据 + 消息
			const sessionIds = new Set<string>([
				...this.dirtySessionIds,
				...this.replaceSessionIds,
				...this.dirtyMessageIds.keys(),
				...this.deleteMessageIds.keys(),
			]);

			for (const id of sessionIds) {
				const session = this.deps.getState().sessions.find((s) => s.id === id);
				if (!session) {
					// 会话已不在内存（已删除且删除标记单独处理），丢弃残余标记
					this.dirtySessionIds.delete(id);
					this.replaceSessionIds.delete(id);
					this.dirtyMessageIds.delete(id);
					this.deleteMessageIds.delete(id);
					continue;
				}

				const hasMessageWork =
					this.replaceSessionIds.has(id) ||
					this.dirtyMessageIds.has(id) ||
					this.deleteMessageIds.has(id);

				// 元数据 upsert（消息写入前必须保证会话行存在——外键）
				if (this.dirtySessionIds.has(id) || hasMessageWork) {
					this.dirtySessionIds.delete(id);
					try {
						await upsertSessionRow(sessionToRowInput(session));
					} catch (e) {
						this.dirtySessionIds.add(id);
						hadFailure = true;
						console.warn(
							`[chatHistory] 会话元数据落库失败（将重试）: ${id}`,
							e,
						);
						continue; // 消息标记保留，下次连同元数据一起重试
					}
				}

				if (!hasMessageWork) continue;
				// 未加载会话不 flush 消息（seq 无法确定）；
				// 变更未加载会话时 store 会触发 hydration，加载后标记仍在、自然补 flush。
				if (!isSessionLoaded(session)) continue;

				const replace = this.replaceSessionIds.has(id);
				const dirtySnapshot = this.dirtyMessageIds.get(id);
				const deleteSnapshot = this.deleteMessageIds.get(id);
				const deleteIds = deleteSnapshot ? Array.from(deleteSnapshot) : [];

				let messages: ChatHistoryMessageInput[];
				if (replace) {
					messages = session.messages.map((m, i) => messageToRowInput(m, i));
				} else {
					messages = [];
					session.messages.forEach((m, i) => {
						if (dirtySnapshot?.has(m.id)) {
							messages.push(messageToRowInput(m, i));
						}
					});
				}

				this.replaceSessionIds.delete(id);
				this.dirtyMessageIds.delete(id);
				this.deleteMessageIds.delete(id);

				if (messages.length === 0 && deleteIds.length === 0 && !replace) {
					continue;
				}

				try {
					await saveMessageRows({
						session_id: id,
						messages,
						replace: replace || undefined,
						delete_ids: deleteIds.length > 0 ? deleteIds : undefined,
					});
				} catch (e) {
					// 失败：标记原样放回，内存数据不丢，下次重试
					if (replace) {
						this.replaceSessionIds.add(id);
					} else if (dirtySnapshot) {
						const set = this.dirtyMessageIds.get(id) ?? new Set<string>();
						for (const mid of dirtySnapshot) set.add(mid);
						this.dirtyMessageIds.set(id, set);
					}
					if (deleteIds.length > 0) {
						const set = this.deleteMessageIds.get(id) ?? new Set<string>();
						for (const mid of deleteIds) set.add(mid);
						this.deleteMessageIds.set(id, set);
					}
					hadFailure = true;
					console.warn(`[chatHistory] 消息落库失败（将重试）: ${id}`, e);
				}
			}

			this.lastFlushTime = Date.now();
		} finally {
			this.flushing = false;
		}

		if (hadFailure) {
			this.scheduleRetry();
		}
		if (this.pendingFlush) {
			this.pendingFlush = false;
			this.schedule("normal");
		}
	}
}
