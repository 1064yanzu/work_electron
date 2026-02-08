import type { DbContext } from "./client";
import { initSql } from "./migrations/initSql";

/**
 * 安全添加列 - 如果列已存在则忽略错误
 */
async function safeAddColumn(
	ctx: DbContext,
	table: string,
	column: string,
	definition: string,
): Promise<void> {
	try {
		await ctx.client.execute({
			sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
			args: [],
		});
	} catch (e: any) {
		// 如果列已存在,忽略错误
		if (e?.message?.includes("duplicate column name")) {
			return;
		}
		// 其他错误则抛出
		throw e;
	}
}

export async function runMigrations(ctx: DbContext) {
	// 运行基础初始化SQL(创建表)
	await ctx.client.executeMultiple(initSql);

	// 运行增量迁移 - 安全添加新列
	// Migration: 添加 SDK 相关字段到 agent_sessions
	await safeAddColumn(ctx, "agent_sessions", "sdk_session_id", "TEXT");
	await safeAddColumn(
		ctx,
		"agent_sessions",
		"model",
		"TEXT DEFAULT 'claude-sonnet-4-5'",
	);
	await safeAddColumn(
		ctx,
		"agent_sessions",
		"total_prompt_tokens",
		"INTEGER DEFAULT 0",
	);
	await safeAddColumn(
		ctx,
		"agent_sessions",
		"total_completion_tokens",
		"INTEGER DEFAULT 0",
	);
	await safeAddColumn(
		ctx,
		"agent_sessions",
		"total_tokens",
		"INTEGER DEFAULT 0",
	);
	await safeAddColumn(ctx, "agent_sessions", "last_compact_at", "INTEGER");
	await safeAddColumn(ctx, "agent_sessions", "pre_compact_tokens", "INTEGER");

	// Migration: 添加项目隔离支持
	await safeAddColumn(ctx, "agent_sessions", "project_id", "TEXT");
	await safeAddColumn(ctx, "artifacts", "project_id", "TEXT");

	// Migration: 添加设备信息字段到 sync_config
	await safeAddColumn(ctx, "sync_config", "device_id", "TEXT");
	await safeAddColumn(ctx, "sync_config", "device_name", "TEXT");

	// Migration: 添加设备信息字段到 backup_history
	await safeAddColumn(ctx, "backup_history", "device_id", "TEXT");
	await safeAddColumn(ctx, "backup_history", "device_name", "TEXT");

	// Migration: sources 表增强（作用域、路径、软删除、来源类型）
	await safeAddColumn(ctx, "sources", "scope", "TEXT DEFAULT 'global'");
	await safeAddColumn(ctx, "sources", "storage_path", "TEXT");
	await safeAddColumn(ctx, "sources", "is_deleted", "INTEGER DEFAULT 0");
	await safeAddColumn(ctx, "sources", "origin_type", "TEXT DEFAULT 'manual'");

	// Migration: output_assets 表增强
	await safeAddColumn(ctx, "output_assets", "scope", "TEXT DEFAULT 'project'");
	await safeAddColumn(ctx, "output_assets", "tags", "TEXT DEFAULT '[]'");
	await safeAddColumn(ctx, "output_assets", "storage_path", "TEXT");
	await safeAddColumn(ctx, "output_assets", "is_deleted", "INTEGER DEFAULT 0");

	// Migration: 主题表
	await ctx.client.execute({
		sql: `CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
		args: [],
	});
	await ctx.client.execute({
		sql: `CREATE TABLE IF NOT EXISTS file_themes (
      source_id TEXT NOT NULL,
      theme_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (source_id, theme_id),
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
      FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
    )`,
		args: [],
	});

	// 添加索引(如果不存在会自动跳过因为用了 IF NOT EXISTS)
	try {
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_agent_sessions_sdk_session ON agent_sessions(sdk_session_id)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_agent_sessions_project ON agent_sessions(project_id)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id)`,
			args: [],
		});
		// 在安全添加 device_id 列后创建索引
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_backup_history_device ON backup_history(device_id)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_sources_scope ON sources(scope)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_sources_deleted ON sources(is_deleted)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_output_assets_scope ON output_assets(scope)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_output_assets_deleted ON output_assets(is_deleted)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_file_themes_source ON file_themes(source_id)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_file_themes_theme ON file_themes(theme_id)`,
			args: [],
		});
	} catch {
		// 忽略索引创建错误
	}
}
