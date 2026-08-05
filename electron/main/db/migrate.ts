import type { DbContext } from "./client";
import { initSql } from "./migrations/initSql";
import { runV2Migrations } from "./migrations/v2Migrations";
import { runV3Migrations } from "./migrations/v3Migrations";
import { runV4Migrations } from "./migrations/v4Migrations";
import { runV5Migrations } from "./migrations/v5Migrations";

/**
 * 当前数据库 schema 版本号（B12：版本化迁移）。
 *
 * 历史上 runMigrations 每次启动都无条件重跑全部 40+ CREATE TABLE、56+ ALTER、
 * 49+ CREATE INDEX 语句（即使全部是 IF NOT EXISTS / 安全加列，语句本身仍要走一次
 * SQLite 解析 + 执行），拖慢每次冷启动的 db init 阶段。
 *
 * 新方案：用 `PRAGMA user_version` 记录已迁移到的版本号。
 * - 全新安装：user_version 从 0 开始，跑完所有步骤后写入 CURRENT_SCHEMA_VERSION。
 * - 已是最新版本：runMigrations 直接返回，不重跑任何语句。
 * - 从旧版本升级：只跑 (旧版本, 新版本] 区间对应的步骤。
 *
 * 新增一批迁移时：追加一个新的 `runVN Migrations` 步骤文件，提升
 * CURRENT_SCHEMA_VERSION，并在下面的判断链里追加 `if (currentVersion < N)`。
 * 不要修改已发布版本对应的迁移函数内容（迁移历史应保持可追溯、不可变）。
 */
const CURRENT_SCHEMA_VERSION = 5;

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

async function readSchemaVersion(ctx: DbContext): Promise<number> {
	try {
		const result = await ctx.client.execute("PRAGMA user_version");
		const raw = (result.rows[0] as Record<string, unknown> | undefined)
			?.user_version;
		const n = Number(raw ?? 0);
		return Number.isFinite(n) ? n : 0;
	} catch {
		return 0;
	}
}

async function writeSchemaVersion(
	ctx: DbContext,
	version: number,
): Promise<void> {
	// PRAGMA 不支持绑定参数，version 是内部常量，非用户输入，可安全内联
	await ctx.client.execute(`PRAGMA user_version = ${version}`);
}

/**
 * 版本 1（历史全量迁移，内容保持原样不变，仅移除了已确认为死 schema 的
 * Wiki 表创建——Wiki 功能已改为文件系统驱动，见 kb/wikiService.ts 顶部注释；
 * 相关表的清理放在 v2Migrations 里统一 DROP）。
 */
async function runLegacyMigrations(ctx: DbContext): Promise<void> {
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

	// Migration: 添加 WebDAV 高级配置字段到 sync_config
	await safeAddColumn(
		ctx,
		"sync_config",
		"webdav_auto_sync",
		"INTEGER DEFAULT 0",
	);
	await safeAddColumn(
		ctx,
		"sync_config",
		"webdav_sync_interval",
		"INTEGER DEFAULT 0",
	);
	await safeAddColumn(
		ctx,
		"sync_config",
		"webdav_max_backups",
		"INTEGER DEFAULT 0",
	);
	await safeAddColumn(
		ctx,
		"sync_config",
		"webdav_skip_backup_file",
		"INTEGER DEFAULT 0",
	);
	await safeAddColumn(
		ctx,
		"sync_config",
		"webdav_disable_stream",
		"INTEGER DEFAULT 0",
	);
	await safeAddColumn(ctx, "sync_config", "webdav_last_sync_at", "INTEGER");
	await safeAddColumn(ctx, "sync_config", "webdav_last_sync_error", "TEXT");

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

	// 注：历史上这里曾创建 Wiki DB 表（wiki_pages / wiki_page_sources /
	// wiki_workspaces / wiki_workspace_pages 及其 FTS + 触发器）。
	// 该功能已于后续版本改为文件系统驱动（.llm-wiki/ 目录），DB 表已确认
	// 零应用代码引用（D8，2026-07 复核）。新安装不再创建；已存在的旧库
	// 由 v2Migrations 统一 DROP，见 migrations/v2Migrations.ts。

	// Migration: Reader 书架幂等导入 — 记录源文件路径并加唯一索引
	await safeAddColumn(ctx, "reader_books", "source_path", "TEXT");
	try {
		await ctx.client.execute({
			sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_reader_books_source_path ON reader_books(source_path) WHERE source_path IS NOT NULL`,
			args: [],
		});
	} catch {
		// 忽略索引创建错误
	}

	// Migration: TTS 桌宠 AI 个性化字段（为后续 LLM 生成台词预留）
	await safeAddColumn(
		ctx,
		"tts_settings",
		"scene_pet_persona_enabled",
		"INTEGER NOT NULL DEFAULT 0",
	);
	await safeAddColumn(ctx, "tts_settings", "scene_pet_persona_prompt", "TEXT");
	await safeAddColumn(
		ctx,
		"tts_settings",
		"scene_pet_persona_provider_id",
		"TEXT",
	);
	await safeAddColumn(ctx, "tts_settings", "scene_pet_persona_model", "TEXT");

	// Migration: design_sessions 加 metadata 列（kind/platform/precision/include_*/template_id/...）
	await safeAddColumn(ctx, "design_sessions", "metadata", "TEXT");

	// Migration: 阅读器知识卡片 — 标签 / 草稿 / SRS 间隔重复
	await safeAddColumn(
		ctx,
		"reader_cards",
		"tags",
		"TEXT NOT NULL DEFAULT '[]'",
	);
	await safeAddColumn(
		ctx,
		"reader_cards",
		"status",
		"TEXT NOT NULL DEFAULT 'active'",
	);
	await safeAddColumn(ctx, "reader_cards", "generation_session_id", "TEXT");
	await safeAddColumn(ctx, "reader_cards", "next_review_at", "INTEGER");
	await safeAddColumn(
		ctx,
		"reader_cards",
		"interval_days",
		"REAL NOT NULL DEFAULT 0",
	);
	await safeAddColumn(ctx, "reader_cards", "ease", "REAL NOT NULL DEFAULT 2.5");
	await safeAddColumn(
		ctx,
		"reader_cards",
		"review_count",
		"INTEGER NOT NULL DEFAULT 0",
	);
	await safeAddColumn(ctx, "reader_cards", "last_reviewed_at", "INTEGER");
	try {
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_reader_cards_status ON reader_cards(status)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_reader_cards_due ON reader_cards(next_review_at)`,
			args: [],
		});
		await ctx.client.execute({
			sql: `CREATE INDEX IF NOT EXISTS idx_reader_cards_gen_session ON reader_cards(generation_session_id)`,
			args: [],
		});
	} catch {
		// 忽略索引创建错误
	}

	// Migration: 语言风格包混搭配方表
	await ctx.client.execute({
		sql: `CREATE TABLE IF NOT EXISTS style_profile_recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cognitive_profile_id TEXT,
      rhetorical_profile_id TEXT,
      aesthetic_profile_id TEXT,
      anchors_profile_id TEXT,
      intensity TEXT DEFAULT 'medium',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (cognitive_profile_id) REFERENCES style_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (rhetorical_profile_id) REFERENCES style_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (aesthetic_profile_id) REFERENCES style_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (anchors_profile_id) REFERENCES style_profiles(id) ON DELETE SET NULL
    )`,
		args: [],
	});

	// Migration: 嵌入向量新增 BLOB 列（Float32Array buffer，约省 80% 空间）
	// 旧数据仍保留在 embedding_json TEXT 列中，读取时透明兼容：
	// 优先读 BLOB，若为 NULL 则回落 JSON 并转写回 BLOB。
	await safeAddColumn(ctx, "note_chunk_embeddings", "embedding", "BLOB");

	// Migration: 语言风格包升级到 v2「灵魂-骨干-血肉」体系
	await safeAddColumn(
		ctx,
		"style_analyses",
		"schema_version",
		"TEXT DEFAULT 'v1'",
	);
	await safeAddColumn(ctx, "style_analyses", "soul_layer", "TEXT");
	await safeAddColumn(ctx, "style_analyses", "thinking_operation", "TEXT");
	await safeAddColumn(ctx, "style_analyses", "articulation_pattern", "TEXT");
	await safeAddColumn(ctx, "style_analyses", "texture_layer", "TEXT");
	await safeAddColumn(ctx, "style_analyses", "cross_cutting", "TEXT");

	// Migration: 混搭配方表升级到 v2（新层级字段）
	await safeAddColumn(ctx, "style_profile_recipes", "soul_profile_id", "TEXT");
	await safeAddColumn(
		ctx,
		"style_profile_recipes",
		"thinking_profile_id",
		"TEXT",
	);
	await safeAddColumn(
		ctx,
		"style_profile_recipes",
		"articulation_profile_id",
		"TEXT",
	);
	await safeAddColumn(
		ctx,
		"style_profile_recipes",
		"texture_profile_id",
		"TEXT",
	);
	await safeAddColumn(
		ctx,
		"style_profile_recipes",
		"relational_profile_id",
		"TEXT",
	);
}

export async function runMigrations(ctx: DbContext): Promise<void> {
	const currentVersion = await readSchemaVersion(ctx);

	if (currentVersion >= CURRENT_SCHEMA_VERSION) {
		// 已是最新版本：全部表/列/索引均已存在，跳过整套重跑（B12 性能优化核心）
		return;
	}

	if (currentVersion < 1) {
		await runLegacyMigrations(ctx);
	}
	if (currentVersion < 2) {
		await runV2Migrations(ctx);
	}
	if (currentVersion < 3) {
		await runV3Migrations(ctx);
	}
	if (currentVersion < 4) {
		await runV4Migrations(ctx);
	}
	if (currentVersion < 5) {
		await runV5Migrations(ctx);
	}

	await writeSchemaVersion(ctx, CURRENT_SCHEMA_VERSION);
}
