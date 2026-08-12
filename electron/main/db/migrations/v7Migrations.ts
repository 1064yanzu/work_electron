/**
 * 版本 7：AI Harness 自动化（定时任务 / 运行记录 / 重试尝试明细）。
 *
 * - `harness_jobs`：任务定义。触发器与重试策略以 JSON 存列，因为它们是**联合类型**
 *   （manual / once / daily / interval 各有各的字段），拆成扁平列会得到一堆恒为 NULL
 *   的字段和一个说不清的约束关系。
 * - `harness_job_runs`：一次触发产生的运行。一个 run 可能包含多次 attempt。
 * - `harness_job_attempts`：每一次实际执行的明细，含失败类别、判定证据原文、
 *   是否走了原生续接。这是「昨晚到底发生了什么」的唯一可信记录——
 *   守护在无人值守时做的每一个决定都必须能被事后复盘，否则用户只能看到
 *   一个「失败了」然后无从查起。
 *
 * 限额等待复用已有的 `harness_quota`，不新建表。
 *
 * 硬性要求：所有语句必须幂等（IF NOT EXISTS），已发布后本函数内容不可再修改。
 */
import type { DbContext } from "../client";

export async function runV7Migrations(ctx: DbContext): Promise<void> {
	// ---------- 任务定义 ----------
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_jobs (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			/* 任务说明（可空），给用户自己备注用 */
			description TEXT,
			enabled INTEGER NOT NULL DEFAULT 1,
			/* 目标入口 id：claude-code / codex / gemini-cli / … */
			target_harness TEXT NOT NULL,
			/* headless（后台子进程） / pty（可视终端，可接管） */
			exec_mode TEXT NOT NULL DEFAULT 'headless',
			/* 工作目录绝对路径 */
			cwd TEXT,
			/* 交给目标 agent 的任务指令 */
			prompt TEXT NOT NULL,
			/* 是否允许目标 agent 改文件。默认关——无人值守时写权限是显式选择 */
			allow_write INTEGER NOT NULL DEFAULT 0,
			/* JSON：{ type: manual | once | daily | interval, ... } */
			trigger_json TEXT NOT NULL,
			/* 执行窗口 HH:MM，两者同时为空表示不限制；允许跨零点（22:00 → 06:00） */
			window_start TEXT,
			window_end TEXT,
			/* 单次 run 最多尝试几次 */
			max_attempts INTEGER NOT NULL DEFAULT 5,
			/* JSON：{ misfire: skip | runOnce, backoffCapMs, ... } */
			retry_policy_json TEXT,
			/* 连续失败后是否允许换一个入口继续 */
			failover_enabled INTEGER NOT NULL DEFAULT 0,
			/* 单次执行的超时预算（毫秒）；为空则用桥接层的默认值 */
			timeout_ms INTEGER,
			/* 下次应当触发的时刻；null = 不再自动触发（manual 或 once 已用掉） */
			next_run_at INTEGER,
			last_run_at INTEGER,
			/* 最近一次 run 的结果，列表页直接读，省一次关联查询 */
			last_status TEXT,
			created_at INTEGER,
			updated_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_jobs_due
		 ON harness_jobs (enabled, next_run_at)`,
	);

	// ---------- 运行记录 ----------
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_job_runs (
			id TEXT PRIMARY KEY,
			job_id TEXT REFERENCES harness_jobs(id) ON DELETE CASCADE,
			/* queued / running / waiting（退避或等限额恢复） /
			   succeeded（本轮无错误结束） / failed / blocked（需人工介入） / cancelled */
			status TEXT NOT NULL,
			/* scheduled / manual / startup。
			   不叫 trigger：那是 SQLite 关键字，虽在 fallback 列表里能用作标识符，
			   但没必要为了一个字的可读性去赌解析器的宽容度。 */
			trigger_source TEXT NOT NULL,
			attempt_count INTEGER NOT NULL DEFAULT 0,
			/* 最近一次失败的类别与原文，列表页直接展示 */
			last_failure_kind TEXT,
			last_error TEXT,
			/* 处于 waiting 时的下次尝试时刻 */
			next_attempt_at INTEGER,
			/* 最后一次成功结束时目标入口的产出 */
			result_text TEXT,
			started_at INTEGER,
			finished_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_job_runs_job
		 ON harness_job_runs (job_id, started_at DESC)`,
	);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_job_runs_status
		 ON harness_job_runs (status, next_attempt_at)`,
	);

	// ---------- 尝试明细 ----------
	await ctx.client.execute(`
		CREATE TABLE IF NOT EXISTS harness_job_attempts (
			id TEXT PRIMARY KEY,
			run_id TEXT REFERENCES harness_job_runs(id) ON DELETE CASCADE,
			/* 本次 run 内的序号，从 1 起 */
			seq INTEGER NOT NULL,
			/* 实际执行的入口（failover 后可能与 job.target_harness 不同） */
			harness TEXT NOT NULL,
			/* headless / pty */
			mode TEXT NOT NULL,
			exit_code INTEGER,
			/* errors.ts 的 FailureKind；成功时为 null */
			failure_kind TEXT,
			/* 触发判定的原文片段，UI 可展开自证 */
			evidence TEXT,
			/* 走了原生续接时记录被续接的原生会话 id；为空表示重发了原始指令 */
			resumed_from TEXT,
			/* 关联的审计行 / pty，便于跳转查看 */
			bridge_call_id TEXT,
			pty_id TEXT,
			/* 本次尝试后实际等待了多久才进行下一次（毫秒） */
			wait_ms INTEGER,
			/* 目标入口的产出（截断存储） */
			output TEXT,
			started_at INTEGER,
			finished_at INTEGER
		)
	`);
	await ctx.client.execute(
		`CREATE INDEX IF NOT EXISTS idx_harness_job_attempts_run
		 ON harness_job_attempts (run_id, seq)`,
	);
}
