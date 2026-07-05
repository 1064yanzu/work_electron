import type { DbContext } from "../client";

/**
 * 版本 3：FTS5 中文化（D1+D2）。
 *
 * 背景：旧 `note_chunks_fts` 用 unicode61 tokenizer——中文不分词，中文全文
 * 搜索语义上是坏的；且旧触发器按 UNINDEXED `chunk_id` 做 DELETE，每次删除
 * 都要对整张 FTS 表线性扫描。
 *
 * 本迁移：
 * - 新建 `note_chunks_fts_v2`：`content=note_chunks, content_rowid=rowid,
 *   tokenize='trigram'`（external content，消灭正文双份存储；trigram 对
 *   中文子串匹配语义正确）；
 * - external content 标准触发器（AD/AU 用 'delete' 命令形式，O(log n)）；
 * - 回填不在迁移里同步执行（libsql file 模式事务同步执行，全量 rebuild 会
 *   冻结主进程），迁移只建表/触发器 + 记录回填边界，分批回填由启动后的
 *   idle 任务负责（见 `kb/ftsRebuild.ts`），进度记录在 app_config
 *   `fts_rebuild_cursor`，完成后置 `fts_version=2` 切换读路径。
 *
 * ## 回填窗口期的一致性设计（触发器里的 WHERE 条件）
 *
 * external content 表的 'delete' 命令要求「被删的 (rowid, content) 此前
 * 确实原样插入过索引」，否则索引会被写坏（FTS5 文档：undefined behavior）。
 * 而迁移完成到回填结束之间存在窗口期：存量行尚未进索引，此时若发生
 * DELETE/UPDATE（例如 rebuildNoteChunks 的整本重建），无条件触发器就会对
 * 从未入索引的行发 'delete'——这正是要避免的坏路径。
 *
 * 因此三个触发器都带谓词 indexed(r)：
 *
 *     r <= fts_rebuild_cursor（已回填） OR r > fts_backfill_boundary（迁移后新增，触发器实时维护）
 *
 * - 落在 (cursor, boundary] 的“待回填区”行：触发器直接跳过——
 *   - INSERT（rowid 复用场景）/ UPDATE：回填批次读的是 note_chunks 当前
 *     内容，扫到该 rowid 时自然收录最新值；
 *   - DELETE：行从未入索引，无需（也不能）发 'delete'。
 * - 回填完成后 cursor 被置为 boundary，谓词恒真，触发器全量生效。
 * - app_config 两个 key 由本迁移用 INSERT OR IGNORE 播种（重跑不会重置
 *   回填进度），谓词子查询是 app_config 主键点查，代价可忽略。
 *
 * 旧表 `note_chunks_fts` 与旧触发器本版本保留（reader/search.ts 仍在读旧表，
 * 且回填完成前旧表是唯一完整索引），DROP 留给下一个 schema 版本。
 *
 * 硬性要求：所有语句必须幂等（IF NOT EXISTS / OR IGNORE），
 * 已发布后本函数内容不可再修改。
 */

/** trigram tokenizer 需要 SQLite >= 3.34（libsql 实际内置 3.44+，仅 warn 不阻断） */
const MIN_TRIGRAM_VERSION = [3, 34] as const;

type MigrationLog = {
	info: (entry: Record<string, unknown>) => unknown;
	warn: (entry: Record<string, unknown>) => unknown;
};

async function resolveLog(): Promise<MigrationLog> {
	try {
		// 动态引入：logging/logger 依赖 electron app，纯 Node 环境（脚本/测试）
		// 下不可用，此时回落 console。
		const mod = await import("../../logging/logger");
		return mod.createLogger();
	} catch {
		return console;
	}
}

async function assertSqliteVersionForTrigram(
	ctx: DbContext,
	log: MigrationLog,
): Promise<void> {
	try {
		const result = await ctx.client.execute("SELECT sqlite_version() AS v");
		const raw = String(
			(result.rows[0] as Record<string, unknown> | undefined)?.v ?? "",
		);
		const parts = raw.split(".").map((p) => Number.parseInt(p, 10));
		const [major = 0, minor = 0] = parts;
		const ok =
			major > MIN_TRIGRAM_VERSION[0] ||
			(major === MIN_TRIGRAM_VERSION[0] && minor >= MIN_TRIGRAM_VERSION[1]);
		if (ok) {
			log.info({
				msg: "v3 migration: sqlite version ok for fts5 trigram",
				sqliteVersion: raw,
			});
		} else {
			log.warn({
				msg: "v3 migration: sqlite version below 3.34, fts5 trigram may be unavailable",
				sqliteVersion: raw,
			});
		}
	} catch (err) {
		log.warn({
			msg: "v3 migration: failed to read sqlite_version()",
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

export async function runV3Migrations(ctx: DbContext): Promise<void> {
	const log = await resolveLog();
	await assertSqliteVersionForTrigram(ctx, log);

	// 一段脚本内顺序执行：建表 → 播种回填游标 → 建触发器。
	// updated_at 用 SQLite 自身的 epoch 毫秒表达式，保持整段 SQL 无绑定参数、
	// 可整体 executeMultiple（与 initSql 同一执行方式，BEGIN...END 触发器安全）。
	await ctx.client.executeMultiple(`
-- 1) trigram 外部内容 FTS（正文只存 note_chunks 一份）
CREATE VIRTUAL TABLE IF NOT EXISTS note_chunks_fts_v2 USING fts5(
  content,
  content=note_chunks,
  content_rowid=rowid,
  tokenize='trigram'
);

-- 2) 回填游标播种（INSERT OR IGNORE：迁移重跑不重置进度）
--    boundary = 迁移时点的 MAX(rowid)；<= boundary 的存量行由 idle 回填补齐，
--    > boundary 的新行由触发器实时维护。
INSERT OR IGNORE INTO app_config(key, value, updated_at)
SELECT 'fts_backfill_boundary',
       CAST(COALESCE(MAX(rowid), 0) AS TEXT),
       CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM note_chunks;

INSERT OR IGNORE INTO app_config(key, value, updated_at)
VALUES ('fts_rebuild_cursor', '0',
        CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- 3) external content 标准触发器（谓词含义见文件头注释）
CREATE TRIGGER IF NOT EXISTS note_chunks_ai_v2
AFTER INSERT ON note_chunks BEGIN
  INSERT INTO note_chunks_fts_v2(rowid, content)
  SELECT new.rowid, new.content
  WHERE new.rowid <= (SELECT CAST(value AS INTEGER) FROM app_config WHERE key = 'fts_rebuild_cursor')
     OR new.rowid >  (SELECT CAST(value AS INTEGER) FROM app_config WHERE key = 'fts_backfill_boundary');
END;

CREATE TRIGGER IF NOT EXISTS note_chunks_ad_v2
AFTER DELETE ON note_chunks BEGIN
  INSERT INTO note_chunks_fts_v2(note_chunks_fts_v2, rowid, content)
  SELECT 'delete', old.rowid, old.content
  WHERE old.rowid <= (SELECT CAST(value AS INTEGER) FROM app_config WHERE key = 'fts_rebuild_cursor')
     OR old.rowid >  (SELECT CAST(value AS INTEGER) FROM app_config WHERE key = 'fts_backfill_boundary');
END;

CREATE TRIGGER IF NOT EXISTS note_chunks_au_v2
AFTER UPDATE ON note_chunks BEGIN
  INSERT INTO note_chunks_fts_v2(note_chunks_fts_v2, rowid, content)
  SELECT 'delete', old.rowid, old.content
  WHERE old.rowid <= (SELECT CAST(value AS INTEGER) FROM app_config WHERE key = 'fts_rebuild_cursor')
     OR old.rowid >  (SELECT CAST(value AS INTEGER) FROM app_config WHERE key = 'fts_backfill_boundary');
  INSERT INTO note_chunks_fts_v2(rowid, content)
  SELECT new.rowid, new.content
  WHERE new.rowid <= (SELECT CAST(value AS INTEGER) FROM app_config WHERE key = 'fts_rebuild_cursor')
     OR new.rowid >  (SELECT CAST(value AS INTEGER) FROM app_config WHERE key = 'fts_backfill_boundary');
END;
`);

	log.info({ msg: "v3 migration applied: note_chunks_fts_v2 + triggers" });
}
