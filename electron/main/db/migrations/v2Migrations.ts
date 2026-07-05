import type { DbContext } from "../client";

/**
 * Schema v2 增量迁移（B12 + D4 + D8）。
 *
 * 由 migrate.ts 的版本判断链调用，仅在 `currentVersion < 2` 时执行一次，
 * 执行完毕后 migrate.ts 会把 PRAGMA user_version 写为 2。
 */
export async function runV2Migrations(ctx: DbContext): Promise<void> {
	await createPerfEventsTable(ctx);
	await dropDeadWikiSchema(ctx);
	await createV2Indexes(ctx);
	await backfillIsDeletedDefaults(ctx);
}

/**
 * M0：性能观测事件表（启动里程碑 / 渲染端 longtask 汇总 / 慢 IPC 调用）。
 * 复用与 perf_metrics 相同的“本地持久化，不上报”定位，7 天滚动保留由
 * services/perfEvents.ts 负责清理。
 */
async function createPerfEventsTable(ctx: DbContext): Promise<void> {
	const statements = [
		`CREATE TABLE IF NOT EXISTS perf_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_ms REAL,
      meta_json TEXT
    )`,
		"CREATE INDEX IF NOT EXISTS idx_perf_events_ts ON perf_events(ts)",
		"CREATE INDEX IF NOT EXISTS idx_perf_events_kind_ts ON perf_events(kind, ts)",
	];
	for (const sql of statements) {
		await ctx.client.execute({ sql, args: [] });
	}
}

/**
 * D8：清理死 Wiki DB Schema。
 *
 * Wiki 功能已于历史版本改为文件系统驱动（`.llm-wiki/` 目录下的 Markdown +
 * frontmatter，见 `electron/main/kb/wikiService.ts` 顶部注释），原先基于
 * SQLite 的 6 表 + 2 张 FTS5 虚表 + 6 个触发器已确认零应用代码引用
 * （2026-07 复核：全仓库搜索 `FROM wiki_pages` / `FROM wiki_page_sources` /
 * `FROM wiki_workspace_pages` 均只出现在其自身的触发器定义里）。
 *
 * 新安装不会再创建这些表（已从 migrate.ts 的 legacy 迁移步骤移除）；
 * 这里负责把老库上残留的这些表连带触发器 / FTS 虚表一次性 DROP 掉。
 * `projects.wiki_enabled` 列同样从未被读取，但列删除在 SQLite 里代价
 * 更高且价值有限，保留不处理。
 */
async function dropDeadWikiSchema(ctx: DbContext): Promise<void> {
	const statements = [
		// 触发器必须先于表删除（虽然 DROP TABLE 会自动清掉依赖它的触发器，
		// 但显式 DROP 更明确、且对 FTS5 外部内容表更安全）
		"DROP TRIGGER IF EXISTS wiki_pages_fts_ai",
		"DROP TRIGGER IF EXISTS wiki_pages_fts_ad",
		"DROP TRIGGER IF EXISTS wiki_pages_fts_au",
		"DROP TRIGGER IF EXISTS wiki_workspace_pages_fts_ai",
		"DROP TRIGGER IF EXISTS wiki_workspace_pages_fts_ad",
		"DROP TRIGGER IF EXISTS wiki_workspace_pages_fts_au",
		"DROP TABLE IF EXISTS wiki_pages_fts",
		"DROP TABLE IF EXISTS wiki_workspace_pages_fts",
		"DROP TABLE IF EXISTS wiki_page_sources",
		"DROP TABLE IF EXISTS wiki_pages",
		"DROP TABLE IF EXISTS wiki_workspace_pages",
		"DROP TABLE IF EXISTS wiki_workspaces",
	];
	for (const sql of statements) {
		try {
			await ctx.client.execute({ sql, args: [] });
		} catch {
			// 老库可能从未创建过这些表 / FTS 虚表，忽略单条失败继续下一条
		}
	}
}

/**
 * D4：补齐级联子表 / 高频查询列缺失的索引。
 *
 * 覆盖：agent_audit_logs（零索引）、agent_artifacts（零索引）、
 * agent_tool_calls.node_id、agent_messages(session_id, created_at) 复合索引、
 * agent_sessions(updated_at)、agent_tasks(session_id, created_at)、
 * activity 5 路 UNION 涉及的 sources/notes/output_assets/cards 的 created_at、
 * workflow_run_logs(node_id)。
 */
async function createV2Indexes(ctx: DbContext): Promise<void> {
	const statements = [
		"CREATE INDEX IF NOT EXISTS idx_agent_audit_logs_session ON agent_audit_logs(session_id)",
		"CREATE INDEX IF NOT EXISTS idx_agent_artifacts_task ON agent_artifacts(task_id)",
		"CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_node ON agent_tool_calls(node_id)",
		"CREATE INDEX IF NOT EXISTS idx_agent_messages_session_created ON agent_messages(session_id, created_at)",
		"CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated ON agent_sessions(updated_at)",
		"CREATE INDEX IF NOT EXISTS idx_agent_tasks_session_created ON agent_tasks(session_id, created_at)",
		"CREATE INDEX IF NOT EXISTS idx_workflow_run_logs_node ON workflow_run_logs(node_id)",
		// activity.ts 的 5 路 UNION ALL 每一路都按 created_at 过滤
		"CREATE INDEX IF NOT EXISTS idx_sources_created ON sources(created_at)",
		"CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at)",
		"CREATE INDEX IF NOT EXISTS idx_output_assets_created ON output_assets(created_at)",
		"CREATE INDEX IF NOT EXISTS idx_cards_created ON cards(created_at)",
		"CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at)",
	];
	for (const sql of statements) {
		try {
			await ctx.client.execute({ sql, args: [] });
		} catch {
			// 目标表在极老的库上可能不存在（例如从未使用过某功能），忽略单条失败
		}
	}
}

/**
 * D7（后半）：把 is_deleted 列里的 NULL 归一为 0。
 *
 * 历史行如果 is_deleted 是 NULL（早期版本 safeAddColumn 补列时，已存在的行
 * 不会被自动回填默认值——SQLite 的 ALTER TABLE ADD COLUMN DEFAULT 只影响
 * "新插入行"的隐式取值，已存在行的物理存储里该列仍是 NULL），
 * 之前查询代码用 `COALESCE(is_deleted, 0) = 0` 兼容 NULL，但这样写会让
 * `idx_sources_deleted` / `idx_output_assets_deleted` 两个索引失效（SQLite
 * 无法对函数表达式走索引）。这里先把数据物理归一，配合应用层查询改写为
 * 纯 `is_deleted = 0`（sources.ts / outputs.ts / files.ts），索引才能生效。
 */
async function backfillIsDeletedDefaults(ctx: DbContext): Promise<void> {
	const statements = [
		"UPDATE sources SET is_deleted = 0 WHERE is_deleted IS NULL",
		"UPDATE output_assets SET is_deleted = 0 WHERE is_deleted IS NULL",
	];
	for (const sql of statements) {
		try {
			await ctx.client.execute({ sql, args: [] });
		} catch {
			// 忽略
		}
	}
}
