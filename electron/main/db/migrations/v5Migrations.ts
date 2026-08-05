/**
 * 版本 5：AI Harness Hub（跨 harness 会话资产互通）。
 *
 * - `harness_sessions`：各 AI 入口（claude-code / codex / ipo-sdk / web-*）的会话元数据。
 *   `origin_path` + `byte_offset` 支撑 JSONL 追加写的增量摄取（只读新增字节，
 *   不整文件重解析）。装不下的字段（model / gitBranch / cliVersion 等）进 `meta_json`。
 * - `harness_messages`：规范化后的每条消息；`blocks_json` 存原始 block 数组
 *   （thinking / tool_use / tool_result），`seq` 为会话内顺序号。
 * - `harness_messages_fts`：trigram FTS5 external-content 表，支持中文子串检索。
 *   本表随建表即建触发器，无存量回填窗口问题，故用无条件触发器
 *   （对比 v3 的 note_chunks_fts_v2 需要 rebuild_cursor 谓词）。
 * - `harness_handoffs`：迁移记录，source_session_id → target_harness 双向可追溯。
 *
 * 级联删除依赖连接级 `PRAGMA foreign_keys = ON`（db/client.ts 已开启）。
 *
 * 硬性要求：所有语句必须幂等（IF NOT EXISTS），
 * 已发布后本函数内容不可再修改。
 */
import type { DbContext } from "../client";

export async function runV5Migrations(ctx: DbContext): Promise<void> {
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_sessions (
			id TEXT PRIMARY KEY,
			harness TEXT NOT NULL,
			external_id TEXT,
			cwd TEXT,
			title TEXT,
			summary TEXT,
			status TEXT,
			origin_path TEXT,
			byte_offset INTEGER DEFAULT 0,
			message_count INTEGER DEFAULT 0,
			token_estimate INTEGER DEFAULT 0,
			meta_json TEXT,
			created_at INTEGER,
			updated_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_sessions_updated_at
		 ON harness_sessions (updated_at)`,
	);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_sessions_harness
		 ON harness_sessions (harness, updated_at)`,
	);
	// 增量摄取按 origin_path 反查会话（一个 JSONL 文件对应一个会话）
	await ctx.client.execute(
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_harness_sessions_origin
		 ON harness_sessions (origin_path)
		 WHERE origin_path IS NOT NULL`,
	);

	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_messages (
			id TEXT PRIMARY KEY,
			session_id TEXT REFERENCES harness_sessions(id) ON DELETE CASCADE,
			role TEXT,
			content TEXT,
			blocks_json TEXT,
			seq INTEGER,
			created_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_messages_session_seq
		 ON harness_messages (session_id, seq)`,
	);

	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_handoffs (
			id TEXT PRIMARY KEY,
			source_session_id TEXT,
			target_harness TEXT,
			package_md TEXT,
			status TEXT,
			pty_id TEXT,
			result_session_id TEXT,
			created_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_handoffs_created_at
		 ON harness_handoffs (created_at)`,
	);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_handoffs_source
		 ON harness_handoffs (source_session_id)`,
	);

	// trigram FTS：中文无空格分词，trigram 才能做子串匹配（照 v3 的选型）
	await ctx.client.executeMultiple(`
CREATE VIRTUAL TABLE IF NOT EXISTS harness_messages_fts USING fts5(
  content,
  content=harness_messages,
  content_rowid=rowid,
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS harness_messages_ai
AFTER INSERT ON harness_messages BEGIN
  INSERT INTO harness_messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS harness_messages_ad
AFTER DELETE ON harness_messages BEGIN
  INSERT INTO harness_messages_fts(harness_messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS harness_messages_au
AFTER UPDATE ON harness_messages BEGIN
  INSERT INTO harness_messages_fts(harness_messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
  INSERT INTO harness_messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
`);
}
