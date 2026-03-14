/**
 * Session 快照持久化层
 * 将会话快照序列化到 localStorage，支持大小限制和自动清理
 * 与 codingSessionStore 解耦，由后者调用本模块实现持久化
 */
import type { CodingSessionState } from "./codingSessionStore";

const STORAGE_PREFIX = "ipo-session-snapshot-";
const INDEX_KEY = "ipo-session-snapshot-index";

/** 单个快照的最大大小（字节） */
const MAX_SNAPSHOT_SIZE = 2 * 1024 * 1024; // 2MB
/** 所有快照的最大总大小（字节） */
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

interface SnapshotIndexEntry {
	threadId: string;
	savedAt: number;
	size: number;
}

// === 索引管理 ===

function loadIndex(): SnapshotIndexEntry[] {
	try {
		const raw = localStorage.getItem(INDEX_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveIndex(entries: SnapshotIndexEntry[]) {
	try {
		localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
	} catch {
		// localStorage 满了，忽略索引保存错误
	}
}

function updateIndex(threadId: string, size: number) {
	const entries = loadIndex().filter((e) => e.threadId !== threadId);
	entries.push({ threadId, savedAt: Date.now(), size });
	saveIndex(entries);
}

function removeFromIndex(threadId: string) {
	const entries = loadIndex().filter((e) => e.threadId !== threadId);
	saveIndex(entries);
}

// === 自动清理 ===

/** 计算当前总使用量，超出限制时清理最旧的快照 */
function enforceStorageLimit(reserveBytes: number) {
	const entries = loadIndex();
	let totalSize = entries.reduce((sum, e) => sum + e.size, 0) + reserveBytes;

	if (totalSize <= MAX_TOTAL_SIZE) return;

	// 按时间排序，最旧的在前
	const sorted = [...entries].sort((a, b) => a.savedAt - b.savedAt);

	for (const entry of sorted) {
		if (totalSize <= MAX_TOTAL_SIZE) break;
		localStorage.removeItem(STORAGE_PREFIX + entry.threadId);
		totalSize -= entry.size;
	}

	// 重新从 localStorage 检查哪些还存在
	const validEntries = entries.filter(
		(e) => localStorage.getItem(STORAGE_PREFIX + e.threadId) !== null,
	);
	saveIndex(validEntries);
}

// === 公共 API ===

/** 将快照保存到 localStorage */
export function saveSnapshotToStorage(
	threadId: string,
	snapshot: CodingSessionState,
): boolean {
	try {
		// 序列化快照（排除运行时状态）
		const serializable = {
			sdkSessionId: snapshot.sdkSessionId,
			runId: null,
			status: "idle" as const,
			messages: snapshot.messages.map((m) => ({
				...m,
				isStreaming: false,
				thinkingBlocks: m.thinkingBlocks.map((b) => ({
					...b,
					isStreaming: false,
				})),
			})),
			streamingMessageId: null,
			pendingPermission: null,
			usage: snapshot.usage,
			activeSubagents: [],
			currentTeam: null,
		};

		const json = JSON.stringify(serializable);

		// 检查单个快照大小限制
		if (json.length > MAX_SNAPSHOT_SIZE) {
			console.warn(
				`[SnapshotPersistence] 快照 ${threadId} 超过大小限制 (${(json.length / 1024 / 1024).toFixed(1)}MB)，跳过持久化`,
			);
			return false;
		}

		// 清理空间
		enforceStorageLimit(json.length);

		// 写入
		localStorage.setItem(STORAGE_PREFIX + threadId, json);
		updateIndex(threadId, json.length);
		return true;
	} catch (err) {
		console.warn("[SnapshotPersistence] 保存快照失败:", err);
		return false;
	}
}

/** 从 localStorage 加载快照 */
export function loadSnapshotFromStorage(
	threadId: string,
): CodingSessionState | null {
	try {
		const json = localStorage.getItem(STORAGE_PREFIX + threadId);
		if (!json) return null;
		return JSON.parse(json) as CodingSessionState;
	} catch (err) {
		console.warn("[SnapshotPersistence] 加载快照失败:", err);
		return null;
	}
}

/** 从 localStorage 删除快照 */
export function deleteSnapshotFromStorage(threadId: string): void {
	localStorage.removeItem(STORAGE_PREFIX + threadId);
	removeFromIndex(threadId);
}

/** 获取所有已持久化的线程 ID */
export function listPersistedSnapshotIds(): string[] {
	return loadIndex().map((e) => e.threadId);
}
