import type { DbContext } from "../db/client";
import { withBatch, yieldToEventLoop } from "../db/batch";

/**
 * D1+D2：`note_chunks_fts_v2`（trigram 中文索引）的启动后分批回填。
 *
 * 迁移 v3（db/migrations/v3Migrations.ts）只负责建表 / 触发器 / 播种游标，
 * 存量行的索引回填在这里做：主窗口创建后的 idle 阶段启动，按 rowid 区间
 * 每批 500 行，一批一个事务（withBatch），批间 setImmediate 让路，避免
 * libsql 同步事务长时间占用主进程。
 *
 * 断点续跑：进度写 app_config `fts_rebuild_cursor`（与批次同事务提交，
 * 崩溃后从游标处继续，不会重复插入）。回填终点是迁移时点记录的
 * `fts_backfill_boundary`（> boundary 的行由触发器实时维护，见迁移文件
 * 头注释里的谓词设计）。全部完成后写 `fts_version=2`，读路径
 * （kb/searchChunks.ts）据此切换到新表。
 */

export const FTS_VERSION_KEY = "fts_version";
const CURSOR_KEY = "fts_rebuild_cursor";
const BOUNDARY_KEY = "fts_backfill_boundary";

/** 单批行数上限；db/batch.ts 建议单批 ≤500，避免大事务造成主进程停顿 */
const BATCH_SIZE = 500;
/** 每处理这么多批打一条进度日志 */
const LOG_EVERY_BATCHES = 20;

type FtsLogger = {
	info: (entry: Record<string, unknown>) => unknown;
	warn: (entry: Record<string, unknown>) => unknown;
};

async function readConfigInt(
	db: DbContext,
	key: string,
): Promise<number | null> {
	const result = await db.client.execute({
		sql: "SELECT value FROM app_config WHERE key = ?",
		args: [key],
	});
	const raw = (result.rows[0] as Record<string, unknown> | undefined)?.value;
	if (raw === undefined || raw === null) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

async function writeConfig(
	db: DbContext,
	key: string,
	value: string,
): Promise<void> {
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [key, value, Date.now()],
	});
}

// ---------------------------------------------------------------------------
// 读路径用的 fts_version（内存缓存；回填完成时同进程内直接翻转）
// ---------------------------------------------------------------------------

let cachedFtsVersion: number | null = null;

/**
 * 当前生效的 FTS 版本：2 = note_chunks_fts_v2（trigram）已回填完成，
 * 其余 = 继续用旧 note_chunks_fts（unicode61）。
 * 结果按进程缓存；本进程内回填完成会主动翻转缓存。
 */
export async function getActiveFtsVersion(db: DbContext): Promise<number> {
	if (cachedFtsVersion !== null) return cachedFtsVersion;
	let version = 1;
	try {
		version = (await readConfigInt(db, FTS_VERSION_KEY)) ?? 1;
	} catch {
		version = 1;
	}
	cachedFtsVersion = version;
	return version;
}

/** 测试用：清掉进程内缓存 */
export function resetFtsVersionCache(): void {
	cachedFtsVersion = null;
}

// ---------------------------------------------------------------------------
// 分批回填
// ---------------------------------------------------------------------------

let backfillRunning = false;

/**
 * 执行（或续跑）trigram FTS 回填。幂等：
 * - fts_version 已是 2 → 直接返回；
 * - 游标已达边界 → 只补写 fts_version=2；
 * - 中途崩溃 → 下次启动从游标处继续。
 */
export async function runFtsBackfill(
	db: DbContext,
	logger?: FtsLogger,
): Promise<void> {
	if (backfillRunning) return;
	backfillRunning = true;
	try {
		await runFtsBackfillInner(db, logger);
	} finally {
		backfillRunning = false;
	}
}

async function runFtsBackfillInner(
	db: DbContext,
	logger?: FtsLogger,
): Promise<void> {
	const version = (await readConfigInt(db, FTS_VERSION_KEY)) ?? 1;
	if (version >= 2) {
		cachedFtsVersion = version;
		return;
	}

	const boundary = await readConfigInt(db, BOUNDARY_KEY);
	if (boundary === null) {
		// v3 迁移尚未跑过（理论上不会发生：迁移在 db init 阶段先于本任务）
		logger?.warn({
			msg: "fts backfill skipped: boundary marker missing (v3 migration not applied?)",
		});
		return;
	}

	let cursor = (await readConfigInt(db, CURSOR_KEY)) ?? 0;
	const startedAt = Date.now();
	let batches = 0;

	while (cursor < boundary) {
		const next = Math.min(cursor + BATCH_SIZE, boundary);
		// 同一事务内：插入本区间存量行 + 推进游标。
		// 触发器谓词（见 v3Migrations.ts）保证待回填区的行不会被触发器
		// 抢先写入，因此这里的区间插入不会产生重复索引项。
		await withBatch(db, [
			{
				sql: `INSERT INTO note_chunks_fts_v2(rowid, content)
              SELECT rowid, content FROM note_chunks
              WHERE rowid > ? AND rowid <= ?`,
				args: [cursor, next],
			},
			{
				sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
				args: [CURSOR_KEY, String(next), Date.now()],
			},
		]);
		cursor = next;
		batches += 1;
		if (batches % LOG_EVERY_BATCHES === 0) {
			logger?.info({
				msg: "fts backfill progress",
				cursor,
				boundary,
				elapsedMs: Date.now() - startedAt,
			});
		}
		// 批间让出事件循环，避免连续同步事务饿死主进程
		await yieldToEventLoop();
	}

	await writeConfig(db, FTS_VERSION_KEY, "2");
	cachedFtsVersion = 2;
	logger?.info({
		msg: "fts backfill complete, read path switched to note_chunks_fts_v2",
		boundary,
		batches,
		elapsedMs: Date.now() - startedAt,
	});
}

// ---------------------------------------------------------------------------
// VACUUM 后重置
// ---------------------------------------------------------------------------

/**
 * VACUUM 可能重排无显式 INTEGER PRIMARY KEY 表的 rowid（note_chunks 是 TEXT
 * 主键 + 隐式 rowid），会使 external content FTS 的 rowid↔行映射失真。
 * 旧 note_chunks_fts 按 chunk_id 存储故免疫；v2 表必须整体重建：
 * 1. 读路径先回落旧表（fts_version=1）；
 * 2. 'delete-all' 清空 v2 索引，重播 boundary/cursor；
 * 3. 立即重跑分批回填（batched + idle 让路，不冻结主进程）。
 * 在 dbMaintenance 的 VACUUM 成功后调用。
 */
export async function resetFtsAfterVacuum(
	db: DbContext,
	logger?: FtsLogger,
): Promise<void> {
	try {
		await writeConfig(db, FTS_VERSION_KEY, "1");
		cachedFtsVersion = 1;
		await db.client.execute(
			`INSERT INTO note_chunks_fts_v2(note_chunks_fts_v2) VALUES('delete-all')`,
		);
		const max = await db.client.execute(
			`SELECT COALESCE(MAX(rowid), 0) AS m FROM note_chunks`,
		);
		const boundary = Number(
			(max.rows[0] as Record<string, unknown> | undefined)?.m ?? 0,
		);
		await writeConfig(db, BOUNDARY_KEY, String(boundary));
		await writeConfig(db, CURSOR_KEY, "0");
		logger?.info({
			msg: "fts v2 reset after vacuum, re-backfill starting",
			boundary,
		});
	} catch (err) {
		// v2 表不存在（v3 迁移未跑）等场景：读路径已回落旧表，不影响功能
		logger?.warn({
			msg: "fts v2 reset after vacuum failed",
			error: err instanceof Error ? err.message : String(err),
		});
		return;
	}
	await runFtsBackfill(db, logger);
}
