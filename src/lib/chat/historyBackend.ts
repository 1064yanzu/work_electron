/**
 * Chat 历史 SQLite 后端桥（F2）
 *
 * - IPC 封装：chat_history_* 命令；
 * - ChatSession / ChatMessage ↔ DB 行的无损往返转换；
 * - 灰度开关：app_config `chat_history_backend`（'localstorage' | 'sqlite'，默认 sqlite）；
 * - localStorage → SQLite 首启迁移（分片导入 + 条数校验 + 备份改名）。
 */
import type {
	ChatHistoryMessageInput,
	ChatHistoryMessageRow,
	ChatHistorySessionInput,
	ChatHistorySessionRow,
} from "../../../electron/shared/ipc-schema";
import { getConfig, setConfig } from "../config/core";
import { invoke } from "../tauriCompat";
import { parseStoredData } from "./compression";
import type { ChatMessage, ChatMessageBlock, ChatSession } from "./types";

export type ChatHistoryBackend = "localstorage" | "sqlite";

/** app_config 灰度开关 key */
export const CHAT_HISTORY_BACKEND_CONFIG_KEY = "chat_history_backend";
/** localStorage 主 key（与 store.ts 保持一致） */
export const CHAT_STORAGE_KEY = "chat_sessions";
/** 迁移完成后主 key 改名为该备份 key，保留一个版本周期用于回滚 */
export const CHAT_STORAGE_BACKUP_KEY = "chat_sessions.migrated-backup";
/** sqlite 模式下 activeSessionId 的轻量持久化 key */
export const CHAT_ACTIVE_SESSION_KEY = "chat_active_session_id";

/** 迁移分片大小：每片 50 个会话 */
const MIGRATE_CHUNK_SIZE = 50;

// ============ 后端开关 ============

export async function readChatHistoryBackend(): Promise<ChatHistoryBackend> {
	try {
		const value = await getConfig(CHAT_HISTORY_BACKEND_CONFIG_KEY);
		if (value === "localstorage" || value === "sqlite") return value;
	} catch (e) {
		console.warn("[chatHistory] 读取后端开关失败，回落 localstorage:", e);
		return "localstorage";
	}
	// 未设置 → 默认 sqlite（新策略）
	return "sqlite";
}

export async function writeChatHistoryBackend(
	backend: ChatHistoryBackend,
): Promise<void> {
	try {
		await setConfig(CHAT_HISTORY_BACKEND_CONFIG_KEY, backend);
	} catch (e) {
		console.warn("[chatHistory] 写入后端开关失败:", e);
	}
}

// ============ 模型 ↔ 行 转换 ============

/** message 行 metadata_json 的结构（metadata.blocks 单独存 blocks_json） */
interface MessageExtraJson {
	model?: string;
	suggestedContent?: string;
	originalContent?: string;
	metadata?: Omit<NonNullable<ChatMessage["metadata"]>, "blocks">;
}

/** session 行 meta_json 的结构 */
interface SessionMetaJson {
	model?: string;
	sdkSessionId?: string;
	threadSource?: ChatSession["threadSource"];
}

function stringifyOrNull(value: unknown): string | null {
	if (value == null) return null;
	try {
		const json = JSON.stringify(value);
		return json === "{}" || json === undefined ? null : json;
	} catch (e) {
		console.warn("[chatHistory] 序列化失败（字段被丢弃到 null）:", e);
		return null;
	}
}

function parseJsonOrNull<T>(raw: string | null | undefined): T | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export function messageToRowInput(
	msg: ChatMessage,
	seq: number,
): ChatHistoryMessageInput {
	const { blocks, ...restMetadata } = msg.metadata ?? {};
	const extra: MessageExtraJson = {};
	if (msg.model) extra.model = msg.model;
	if (msg.suggestedContent !== undefined)
		extra.suggestedContent = msg.suggestedContent;
	if (msg.originalContent !== undefined)
		extra.originalContent = msg.originalContent;
	if (msg.metadata && Object.keys(restMetadata).length > 0)
		extra.metadata = restMetadata;

	return {
		id: msg.id,
		role: msg.role,
		content: msg.content ?? "",
		blocks_json: stringifyOrNull(blocks),
		metadata_json: stringifyOrNull(extra),
		seq,
		created_at: msg.timestamp,
	};
}

export function rowToMessage(row: ChatHistoryMessageRow): ChatMessage {
	const extra = parseJsonOrNull<MessageExtraJson>(row.metadata_json) ?? {};
	const blocks = parseJsonOrNull<ChatMessageBlock[]>(row.blocks_json);

	const metadata: ChatMessage["metadata"] = { ...(extra.metadata ?? {}) };
	if (blocks && blocks.length > 0) metadata.blocks = blocks;

	const msg: ChatMessage = {
		id: row.id,
		role: (row.role as ChatMessage["role"]) || "user",
		content: row.content ?? "",
		timestamp: row.created_at,
		// 持久化数据不可能还在流式中；显式不还原 isStreaming
	};
	if (extra.model) msg.model = extra.model;
	if (extra.suggestedContent !== undefined)
		msg.suggestedContent = extra.suggestedContent;
	if (extra.originalContent !== undefined)
		msg.originalContent = extra.originalContent;
	if (Object.keys(metadata).length > 0) msg.metadata = metadata;
	return msg;
}

export function sessionToRowInput(
	session: ChatSession,
): ChatHistorySessionInput {
	const meta: SessionMetaJson = {};
	if (session.model) meta.model = session.model;
	if (session.sdkSessionId) meta.sdkSessionId = session.sdkSessionId;
	if (session.threadSource) meta.threadSource = session.threadSource;

	return {
		id: session.id,
		title: session.title,
		folder_id: null,
		cwd: session.cwd ?? null,
		agent_session_id: session.agentSessionId ?? null,
		is_pinned: Boolean(session.isPinned),
		is_archived: Boolean(session.isArchived),
		created_at: session.createdAt,
		updated_at: session.updatedAt,
		meta_json: stringifyOrNull(meta),
	};
}

/** DB 会话行 → 仅元数据的 ChatSession（messages 空、messagesLoaded=false） */
export function rowToSessionMeta(row: ChatHistorySessionRow): ChatSession {
	const meta = parseJsonOrNull<SessionMetaJson>(row.meta_json) ?? {};
	const session: ChatSession = {
		id: row.id,
		title: row.title ?? "",
		messages: [],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		messagesLoaded: false,
		messageCount: row.message_count,
	};
	if (meta.model) session.model = meta.model;
	if (meta.sdkSessionId) session.sdkSessionId = meta.sdkSessionId;
	if (meta.threadSource) session.threadSource = meta.threadSource;
	if (row.cwd) session.cwd = row.cwd;
	if (row.agent_session_id) session.agentSessionId = row.agent_session_id;
	if (row.is_pinned) session.isPinned = true;
	if (row.is_archived) session.isArchived = true;
	if (row.last_message_preview != null) {
		session.lastPreview = {
			role: (row.last_message_role as ChatMessage["role"]) || "assistant",
			content: row.last_message_preview,
			timestamp: row.last_message_at ?? row.updated_at,
		};
	}
	if (row.last_user_preview != null) {
		session.lastUserPreview = row.last_user_preview;
	}
	return session;
}

// ============ IPC 封装 ============

export async function listSessionRows(): Promise<ChatHistorySessionRow[]> {
	const result = await invoke<{ sessions: ChatHistorySessionRow[] }>(
		"chat_history_list_sessions",
		{},
	);
	return result.sessions;
}

export async function getMessageRows(
	sessionId: string,
): Promise<ChatHistoryMessageRow[]> {
	const result = await invoke<{ messages: ChatHistoryMessageRow[] }>(
		"chat_history_get_messages",
		{ session_id: sessionId },
	);
	return result.messages;
}

export async function saveMessageRows(input: {
	session_id: string;
	messages: ChatHistoryMessageInput[];
	replace?: boolean;
	delete_ids?: string[];
}): Promise<void> {
	await invoke("chat_history_save_messages", input as never);
}

export async function upsertSessionRow(
	input: ChatHistorySessionInput,
): Promise<void> {
	await invoke("chat_history_upsert_session", input as never);
}

export async function deleteSessionRow(sessionId: string): Promise<void> {
	await invoke("chat_history_delete_session", { session_id: sessionId });
}

export async function searchChatHistory(
	q: string,
	limit?: number,
): Promise<
	Array<{
		session_id: string;
		message_id: string;
		role: string;
		snippet: string;
		created_at: number;
	}>
> {
	const result = await invoke<{
		results: Array<{
			session_id: string;
			message_id: string;
			role: string;
			snippet: string;
			created_at: number;
		}>;
	}>("chat_history_search", { q, limit });
	return result.results;
}

// ============ 首启迁移 ============

export interface MigrationResult {
	/** 迁移是否成功（"无需迁移"也算成功） */
	ok: boolean;
	/** 是否实际执行了导入 */
	migrated: boolean;
	error?: unknown;
}

/**
 * localStorage → SQLite 迁移：
 * 1. 检测主 key；无 → 无需迁移；
 * 2. 解压解析 → 每 50 会话一片 chat_history_migrate_import；
 * 3. 校验导入返回的总条数与解析结果一致；
 * 4. 主 key 改名为备份 key（保留一个版本周期作回滚）。
 *
 * 任一步失败：保留原 key，返回 ok=false，由调用方回落 localstorage。
 * 导入为 INSERT OR REPLACE，失败重试幂等。
 */
export async function migrateLocalStorageToSqlite(): Promise<MigrationResult> {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(CHAT_STORAGE_KEY);
	} catch (e) {
		return { ok: false, migrated: false, error: e };
	}
	if (!raw) return { ok: true, migrated: false };

	try {
		const parsed = parseStoredData(raw);
		if (!parsed) {
			// 数据损坏无法解析：不迁移也不删除，回落 localstorage 让旧路径自行处理
			return {
				ok: false,
				migrated: false,
				error: new Error("parseStoredData returned null"),
			};
		}

		const sessions = parsed.sessions;
		const expectedSessions = sessions.length;
		const expectedMessages = sessions.reduce(
			(sum, s) => sum + s.messages.length,
			0,
		);

		let importedSessions = 0;
		let importedMessages = 0;
		for (let i = 0; i < sessions.length; i += MIGRATE_CHUNK_SIZE) {
			const chunk = sessions.slice(i, i + MIGRATE_CHUNK_SIZE);
			const payload = chunk.map((session) => ({
				...sessionToRowInput(session),
				messages: session.messages.map((msg, seq) =>
					messageToRowInput(msg, seq),
				),
			}));
			const result = await invoke<{
				success: boolean;
				imported_sessions: number;
				imported_messages: number;
			}>("chat_history_migrate_import", { sessions: payload } as never);
			if (!result?.success) {
				throw new Error(`chat_history_migrate_import 分片失败（offset=${i}）`);
			}
			importedSessions += result.imported_sessions;
			importedMessages += result.imported_messages;
		}

		if (
			importedSessions !== expectedSessions ||
			importedMessages !== expectedMessages
		) {
			throw new Error(
				`迁移条数校验失败：sessions ${importedSessions}/${expectedSessions}, messages ${importedMessages}/${expectedMessages}`,
			);
		}

		// 主 key 改名保留备份（一个版本周期后再清理）。
		// 注意顺序：先删主 key 再写备份，避免两份数据并存瞬间触发配额溢出；
		// 此时导入已通过条数校验，即使备份写入失败数据也已安全在 SQLite。
		localStorage.removeItem(CHAT_STORAGE_KEY);
		try {
			localStorage.setItem(CHAT_STORAGE_BACKUP_KEY, raw);
		} catch (backupErr) {
			console.warn(
				"[chatHistory] 迁移备份 key 写入失败（数据已在 SQLite，忽略）:",
				backupErr,
			);
		}

		console.log(
			`[chatHistory] localStorage → SQLite 迁移完成：${importedSessions} 会话 / ${importedMessages} 消息`,
		);
		return { ok: true, migrated: true };
	} catch (e) {
		console.warn("[chatHistory] 迁移失败，保留 localStorage 原数据:", e);
		return { ok: false, migrated: false, error: e };
	}
}
