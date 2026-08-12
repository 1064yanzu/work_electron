/**
 * 版本 6：AI Harness Hub 互通升级（互为工具 / 议会 / 共享白板 / 路由 / 额度）。
 *
 * - `harness_bridge_calls`：跨入口调用审计。任何「A 把 B 当工具调」的动作都落一行，
 *   含 prompt、结果、耗时、失败原因，可回溯可追责。
 * - `harness_council_runs` / `harness_council_answers`：议会模式（同一问题并发发给
 *   多个入口再裁决合并）。失败分支同样落行并记 error，不静默丢弃。
 * - `harness_board_entries`：按 cwd 作用域的共享工作记忆（白板）。DB 是真相源，
 *   `<cwd>/.aihub/BOARD.md` 是它的渲染产物。
 * - `harness_routes`：能力 → 有序入口清单的路由表（用户可改）。
 * - `harness_quota`：各入口的限额状态。只记录**从真实转录里检测到的**限额信号，
 *   检测不到就没有行（= unknown），不外推、不猜测剩余额度。
 * - `harness_handoffs` 增列 `mode`（native/raw/distill）与 `payload_path`：
 *   一期只有蒸馏一条路，二期变成三档策略，必须把实际用了哪档记下来，
 *   否则 UI 会把有损的蒸馏包展示成无损接力。
 *
 * 硬性要求：所有语句必须幂等（IF NOT EXISTS / 先查后加列），
 * 已发布后本函数内容不可再修改。
 */
import type { DbContext } from "../client";

/** 幂等加列：列已存在就跳过（SQLite 没有 ADD COLUMN IF NOT EXISTS）。 */
async function addColumnIfMissing(
	ctx: DbContext,
	table: string,
	column: string,
	definition: string,
): Promise<void> {
	const info = await ctx.client.execute(`PRAGMA table_info(${table})`);
	const exists = info.rows.some(
		(row) => String((row as Record<string, unknown>).name) === column,
	);
	if (exists) return;
	await ctx.client.execute(
		`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
	);
}

export async function runV6Migrations(ctx: DbContext): Promise<void> {
	// ---------- 跨入口调用审计 ----------
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_bridge_calls (
			id TEXT PRIMARY KEY,
			/* 发起方：ipo-sdk / claude-code / codex / … 或 external:<name> */
			caller TEXT NOT NULL,
			/* 被调方 harness id */
			target TEXT NOT NULL,
			/* cli / web / app */
			target_kind TEXT NOT NULL,
			prompt TEXT,
			cwd TEXT,
			response TEXT,
			/* running / succeeded / failed / timeout */
			status TEXT NOT NULL,
			error TEXT,
			duration_ms INTEGER DEFAULT 0,
			created_at INTEGER,
			finished_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_bridge_calls_created
		 ON harness_bridge_calls (created_at DESC)`,
	);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_bridge_calls_target
		 ON harness_bridge_calls (target, created_at DESC)`,
	);

	// ---------- 议会 ----------
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_council_runs (
			id TEXT PRIMARY KEY,
			question TEXT NOT NULL,
			cwd TEXT,
			/* JSON 数组：参与的 harness id */
			participants_json TEXT,
			/* running / done / failed */
			status TEXT NOT NULL,
			/* 裁决合并后的结论 markdown */
			verdict TEXT,
			error TEXT,
			created_at INTEGER,
			finished_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_council_runs_created
		 ON harness_council_runs (created_at DESC)`,
	);
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_council_answers (
			id TEXT PRIMARY KEY,
			run_id TEXT REFERENCES harness_council_runs(id) ON DELETE CASCADE,
			harness TEXT NOT NULL,
			label TEXT,
			answer TEXT,
			/* pending / succeeded / failed / timeout */
			status TEXT NOT NULL,
			error TEXT,
			duration_ms INTEGER DEFAULT 0,
			created_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_council_answers_run
		 ON harness_council_answers (run_id)`,
	);

	// ---------- 共享白板 ----------
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_board_entries (
			id TEXT PRIMARY KEY,
			/* 作用域：工作目录绝对路径；为空表示全局白板 */
			scope TEXT NOT NULL,
			/* goal / decision / pitfall / next / note */
			kind TEXT NOT NULL,
			content TEXT NOT NULL,
			/* 写入方 harness id，便于「谁说的」 */
			author TEXT,
			/* 关联的 canonical 会话（可空） */
			session_id TEXT,
			/* open / done —— 仅对 next 有意义 */
			state TEXT DEFAULT 'open',
			created_at INTEGER,
			updated_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_board_scope
		 ON harness_board_entries (scope, kind, created_at)`,
	);

	// ---------- 能力路由 ----------
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_routes (
			/* 能力 id：long-context / research / refactor / quick / chinese / … */
			capability TEXT PRIMARY KEY,
			label TEXT,
			/* JSON 数组：按优先级排列的 harness id */
			harnesses_json TEXT NOT NULL,
			enabled INTEGER DEFAULT 1,
			updated_at INTEGER
		)
	`);

	// ---------- 额度状态 ----------
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_quota (
			harness TEXT PRIMARY KEY,
			/* 最近一次检测到限额信号的时间；null = 没检测到 */
			limit_hit_at INTEGER,
			/* 从提示文案里解析出的恢复时间；解析不出就是 null（不猜） */
			resets_at INTEGER,
			/* 触发判定的原始文案片段，UI 可展开自证 */
			evidence TEXT,
			/* 用户手动标记的不可用（与自动检测分开，避免互相覆盖） */
			manual_blocked INTEGER DEFAULT 0,
			updated_at INTEGER
		)
	`);

	// ---------- 已有表加列 ----------
	await addColumnIfMissing(ctx, "harness_handoffs", "mode", "TEXT");
	await addColumnIfMissing(ctx, "harness_handoffs", "payload_path", "TEXT");
	await addColumnIfMissing(ctx, "harness_handoffs", "source_cwd", "TEXT");
}
