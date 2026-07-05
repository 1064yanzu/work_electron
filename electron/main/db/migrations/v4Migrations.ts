import type { DbContext } from "../client";

/**
 * 版本 4：chat 历史迁 SQLite（F2）。
 *
 * - `chat_sessions`：渲染端 ChatSession 的元数据行。装不下的字段
 *   （model / sdkSessionId / threadSource 等）序列化进 `meta_json`。
 * - `chat_messages`：每条消息一行；`blocks_json` 存 metadata.blocks，
 *   其余（model / suggestedContent / originalContent / metadata 其它键）
 *   序列化进 `metadata_json`。`seq` 为会话内顺序号。
 * - 级联删除依赖连接级 `PRAGMA foreign_keys = ON`（db/client.ts 已开启）。
 *
 * 硬性要求：所有语句必须幂等（IF NOT EXISTS），
 * 已发布后本函数内容不可再修改。
 */
export async function runV4Migrations(ctx: DbContext): Promise<void> {
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS chat_sessions (
			id TEXT PRIMARY KEY,
			title TEXT,
			folder_id TEXT,
			cwd TEXT,
			agent_session_id TEXT,
			is_pinned INTEGER DEFAULT 0,
			is_archived INTEGER DEFAULT 0,
			created_at INTEGER,
			updated_at INTEGER,
			meta_json TEXT
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
		 ON chat_sessions (updated_at)`,
	);

	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS chat_messages (
			id TEXT PRIMARY KEY,
			session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
			role TEXT,
			content TEXT,
			blocks_json TEXT,
			metadata_json TEXT,
			seq INTEGER,
			created_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_seq
		 ON chat_messages (session_id, seq)`,
	);
}
