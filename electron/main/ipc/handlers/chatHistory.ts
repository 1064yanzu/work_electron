/**
 * Chat 历史 IPC Handlers（F2：chat 历史迁 SQLite）
 *
 * 存储模型：
 * - chat_sessions 存会话元数据，装不下的字段进 meta_json；
 * - chat_messages 每条消息一行，blocks_json / metadata_json 承载结构化字段；
 * - 写入统一走 withBatch（单事务），大批量按 ≤400 条语句切片并在批间让路。
 */
import type { InStatement } from "@libsql/client";
import type { IpcMainInvokeEvent } from "electron";
import type {
	ChatHistoryMessageInput,
	ChatHistorySessionInput,
	IPCSchema,
} from "../../../shared/ipc-schema";
import { chunkArray, withBatch, yieldToEventLoop } from "../../db/batch";
import type { DbContext } from "../../db/client";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

/** 单事务内的最大语句数（libsql file 模式事务同步执行，防主进程停顿） */
const MAX_STATEMENTS_PER_BATCH = 400;
/** 预览截断长度 */
const PREVIEW_LENGTH = 200;

function sessionUpsertStatement(input: ChatHistorySessionInput): InStatement {
	return {
		sql: `INSERT INTO chat_sessions
			(id, title, folder_id, cwd, agent_session_id, is_pinned, is_archived, created_at, updated_at, meta_json)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				title = excluded.title,
				folder_id = excluded.folder_id,
				cwd = excluded.cwd,
				agent_session_id = excluded.agent_session_id,
				is_pinned = excluded.is_pinned,
				is_archived = excluded.is_archived,
				created_at = excluded.created_at,
				updated_at = excluded.updated_at,
				meta_json = excluded.meta_json`,
		args: [
			input.id,
			input.title ?? "",
			input.folder_id ?? null,
			input.cwd ?? null,
			input.agent_session_id ?? null,
			input.is_pinned ? 1 : 0,
			input.is_archived ? 1 : 0,
			input.created_at,
			input.updated_at,
			input.meta_json ?? null,
		],
	};
}

function messageUpsertStatement(
	sessionId: string,
	msg: ChatHistoryMessageInput,
): InStatement {
	return {
		sql: `INSERT INTO chat_messages
			(id, session_id, role, content, blocks_json, metadata_json, seq, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				session_id = excluded.session_id,
				role = excluded.role,
				content = excluded.content,
				blocks_json = excluded.blocks_json,
				metadata_json = excluded.metadata_json,
				seq = excluded.seq,
				created_at = excluded.created_at`,
		args: [
			msg.id,
			sessionId,
			msg.role,
			msg.content ?? "",
			msg.blocks_json ?? null,
			msg.metadata_json ?? null,
			msg.seq,
			msg.created_at,
		],
	};
}

/** 分批提交语句：单批 ≤ MAX_STATEMENTS_PER_BATCH，批间让出事件循环 */
async function executeInBatches(
	db: DbContext,
	statements: InStatement[],
): Promise<void> {
	const chunks = chunkArray(statements, MAX_STATEMENTS_PER_BATCH);
	for (let i = 0; i < chunks.length; i++) {
		await withBatch(db, chunks[i]);
		if (i < chunks.length - 1) await yieldToEventLoop();
	}
}

/** LIKE 转义（% _ \） */
function escapeLike(q: string): string {
	return q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function createChatHistoryHandlers(db: DbContext) {
	const listSessions: Handler<"chat_history_list_sessions"> = async () => {
		const result = await db.client.execute(`
			SELECT
				s.id, s.title, s.folder_id, s.cwd, s.agent_session_id,
				s.is_pinned, s.is_archived, s.created_at, s.updated_at, s.meta_json,
				(SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count,
				(SELECT m.role FROM chat_messages m WHERE m.session_id = s.id
					ORDER BY m.seq DESC LIMIT 1) AS last_message_role,
				(SELECT substr(m.content, 1, ${PREVIEW_LENGTH}) FROM chat_messages m WHERE m.session_id = s.id
					ORDER BY m.seq DESC LIMIT 1) AS last_message_preview,
				(SELECT m.created_at FROM chat_messages m WHERE m.session_id = s.id
					ORDER BY m.seq DESC LIMIT 1) AS last_message_at,
				(SELECT substr(m.content, 1, ${PREVIEW_LENGTH}) FROM chat_messages m
					WHERE m.session_id = s.id AND m.role = 'user'
					ORDER BY m.seq DESC LIMIT 1) AS last_user_preview
			FROM chat_sessions s
			ORDER BY s.updated_at DESC
		`);
		return {
			sessions: result.rows.map((row) => {
				const r = row as Record<string, unknown>;
				return {
					id: r.id as string,
					title: (r.title as string) ?? "",
					folder_id: (r.folder_id as string) ?? null,
					cwd: (r.cwd as string) ?? null,
					agent_session_id: (r.agent_session_id as string) ?? null,
					is_pinned: Number(r.is_pinned ?? 0) === 1,
					is_archived: Number(r.is_archived ?? 0) === 1,
					created_at: Number(r.created_at ?? 0),
					updated_at: Number(r.updated_at ?? 0),
					meta_json: (r.meta_json as string) ?? null,
					message_count: Number(r.message_count ?? 0),
					last_message_role: (r.last_message_role as string) ?? null,
					last_message_preview: (r.last_message_preview as string) ?? null,
					last_message_at:
						r.last_message_at == null ? null : Number(r.last_message_at),
					last_user_preview: (r.last_user_preview as string) ?? null,
				};
			}),
		};
	};

	const getMessages: Handler<"chat_history_get_messages"> = async (
		_event,
		input,
	) => {
		const result = await db.client.execute({
			sql: `SELECT id, session_id, role, content, blocks_json, metadata_json, seq, created_at
				FROM chat_messages WHERE session_id = ? ORDER BY seq ASC`,
			args: [input.session_id],
		});
		return {
			messages: result.rows.map((row) => {
				const r = row as Record<string, unknown>;
				return {
					id: r.id as string,
					session_id: r.session_id as string,
					role: (r.role as string) ?? "user",
					content: (r.content as string) ?? "",
					blocks_json: (r.blocks_json as string) ?? null,
					metadata_json: (r.metadata_json as string) ?? null,
					seq: Number(r.seq ?? 0),
					created_at: Number(r.created_at ?? 0),
				};
			}),
		};
	};

	const saveMessages: Handler<"chat_history_save_messages"> = async (
		_event,
		input,
	) => {
		const statements: InStatement[] = [];
		let deleted = 0;

		if (input.replace) {
			statements.push({
				sql: `DELETE FROM chat_messages WHERE session_id = ?`,
				args: [input.session_id],
			});
		}
		if (input.delete_ids && input.delete_ids.length > 0) {
			for (const ids of chunkArray(input.delete_ids, 200)) {
				statements.push({
					sql: `DELETE FROM chat_messages WHERE session_id = ? AND id IN (${ids
						.map(() => "?")
						.join(",")})`,
					args: [input.session_id, ...ids],
				});
			}
			deleted = input.delete_ids.length;
		}
		for (const msg of input.messages) {
			statements.push(messageUpsertStatement(input.session_id, msg));
		}

		await executeInBatches(db, statements);
		return { success: true, saved: input.messages.length, deleted };
	};

	const upsertSession: Handler<"chat_history_upsert_session"> = async (
		_event,
		input,
	) => {
		await db.client.execute(sessionUpsertStatement(input));
		return { success: true };
	};

	const deleteSession: Handler<"chat_history_delete_session"> = async (
		_event,
		input,
	) => {
		// 消息级联删除依赖 PRAGMA foreign_keys=ON；再显式删一遍兜底（幂等）。
		await withBatch(db, [
			{
				sql: `DELETE FROM chat_messages WHERE session_id = ?`,
				args: [input.session_id],
			},
			{
				sql: `DELETE FROM chat_sessions WHERE id = ?`,
				args: [input.session_id],
			},
		]);
		return { success: true };
	};

	const migrateImport: Handler<"chat_history_migrate_import"> = async (
		_event,
		input,
	) => {
		let importedSessions = 0;
		let importedMessages = 0;

		for (const session of input.sessions) {
			// 每个会话独立成组，保证会话行先于消息行写入（外键约束）
			const statements: InStatement[] = [sessionUpsertStatement(session)];
			for (const msg of session.messages) {
				statements.push(messageUpsertStatement(session.id, msg));
			}
			await executeInBatches(db, statements);
			importedSessions += 1;
			importedMessages += session.messages.length;
		}

		return {
			success: true,
			imported_sessions: importedSessions,
			imported_messages: importedMessages,
		};
	};

	const search: Handler<"chat_history_search"> = async (_event, input) => {
		const q = (input.q || "").trim();
		if (!q) return { results: [] };
		const limit = Math.max(1, Math.min(200, input.limit ?? 50));
		const result = await db.client.execute({
			sql: `SELECT id, session_id, role, substr(content, 1, ${PREVIEW_LENGTH}) AS snippet, created_at
				FROM chat_messages
				WHERE content LIKE ? ESCAPE '\\'
				ORDER BY created_at DESC
				LIMIT ?`,
			args: [`%${escapeLike(q)}%`, limit],
		});
		return {
			results: result.rows.map((row) => {
				const r = row as Record<string, unknown>;
				return {
					session_id: r.session_id as string,
					message_id: r.id as string,
					role: (r.role as string) ?? "user",
					snippet: (r.snippet as string) ?? "",
					created_at: Number(r.created_at ?? 0),
				};
			}),
		};
	};

	return {
		chat_history_list_sessions: listSessions,
		chat_history_get_messages: getMessages,
		chat_history_save_messages: saveMessages,
		chat_history_upsert_session: upsertSession,
		chat_history_delete_session: deleteSession,
		chat_history_migrate_import: migrateImport,
		chat_history_search: search,
	};
}
