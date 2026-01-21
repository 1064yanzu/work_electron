import type { DbContext } from "./client";
import { initSql } from "./migrations/initSql";

/**
 * 安全添加列 - 如果列已存在则忽略错误
 */
async function safeAddColumn(
	ctx: DbContext,
	table: string,
	column: string,
	definition: string
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
	await safeAddColumn(ctx, "agent_sessions", "model", "TEXT DEFAULT 'claude-sonnet-4-5'");
	await safeAddColumn(ctx, "agent_sessions", "total_prompt_tokens", "INTEGER DEFAULT 0");
	await safeAddColumn(ctx, "agent_sessions", "total_completion_tokens", "INTEGER DEFAULT 0");
	await safeAddColumn(ctx, "agent_sessions", "total_tokens", "INTEGER DEFAULT 0");
	await safeAddColumn(ctx, "agent_sessions", "last_compact_at", "INTEGER");
	await safeAddColumn(ctx, "agent_sessions", "pre_compact_tokens", "INTEGER");

	// 添加索引(如果不存在会自动跳过因为用了 IF NOT EXISTS)
	try {
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_agent_sessions_sdk_session ON agent_sessions(sdk_session_id)`,
			args: [],
		});
	} catch {
		// 忽略索引创建错误
	}
}
