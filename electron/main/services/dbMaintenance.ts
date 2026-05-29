/**
 * SQLite 维护：周期性 VACUUM 回收已删除记录占用的空间。
 *
 * 设计要点：
 * - 启动时（应用 idle 后）检查 freelist 占比，超阈值时跑完整 VACUUM
 * - 每 24h 周期 tick，仅在 freelist 比例超过阈值时才跑，避免无碎片时做空 VACUUM
 * - VACUUM 需要全库写锁，整个过程异步执行；放在 idle 阶段避免阻塞主路径
 * - 时间戳存在 app_config 表的 `last_vacuum_at` 键里
 *
 * 用户场景：长时间使用后大量删除 sessions / cards / outputs 后磁盘不释放。
 */
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";

const CONFIG_KEY = "last_vacuum_at";
const VACUUM_MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const FREELIST_RATIO_THRESHOLD = 0.2; // freelist 占比超过 20% 触发
const FREELIST_IMMEDIATE_RATIO_THRESHOLD = 0.35; // 删除量很大时不等 7 天
const TICK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 每 24h 检查一次

let tickTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function readLastVacuumAt(db: DbContext): Promise<number> {
	try {
		const result = await db.client.execute({
			sql: "SELECT value FROM app_config WHERE key = ?",
			args: [CONFIG_KEY],
		});
		const raw = result.rows[0]?.value;
		if (typeof raw !== "string") return 0;
		const n = Number.parseInt(raw, 10);
		return Number.isFinite(n) ? n : 0;
	} catch {
		return 0;
	}
}

async function writeLastVacuumAt(db: DbContext, ts: number): Promise<void> {
	try {
		await db.client.execute({
			sql: "INSERT INTO app_config(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
			args: [CONFIG_KEY, String(ts), ts],
		});
	} catch {
		// 写失败不致命：下次启动可能会重复触发，VACUUM 本身幂等
	}
}

async function computeFreelistRatio(db: DbContext): Promise<number> {
	try {
		const pageCount = await db.client.execute("PRAGMA page_count");
		const freelist = await db.client.execute("PRAGMA freelist_count");
		const total = Number(pageCount.rows[0]?.page_count ?? 0);
		const free = Number(freelist.rows[0]?.freelist_count ?? 0);
		if (!Number.isFinite(total) || total <= 0) return 0;
		if (!Number.isFinite(free) || free <= 0) return 0;
		return free / total;
	} catch {
		return 0;
	}
}

async function runVacuumIfDue(db: DbContext, logger?: Logger): Promise<void> {
	if (isRunning) return;
	isRunning = true;
	try {
		const lastAt = await readLastVacuumAt(db);
		const now = Date.now();
		const overdue = now - lastAt >= VACUUM_MIN_INTERVAL_MS;
		const ratio = await computeFreelistRatio(db);
		const fragmented = ratio >= FREELIST_RATIO_THRESHOLD;
		const heavilyFragmented = ratio >= FREELIST_IMMEDIATE_RATIO_THRESHOLD;
		const shouldVacuum =
			fragmented && (overdue || lastAt === 0 || heavilyFragmented);
		if (!shouldVacuum) return;

		const started = Date.now();
		logger?.info({
			msg: "SQLite VACUUM starting",
			overdue,
			fragmented,
			heavilyFragmented,
			freelistRatio: Number(ratio.toFixed(3)),
		});
		await db.client.execute("VACUUM");
		await writeLastVacuumAt(db, now);
		logger?.info({
			msg: "SQLite VACUUM finished",
			durationMs: Date.now() - started,
		});
	} catch (err) {
		logger?.warn({
			msg: "SQLite VACUUM failed",
			error: err instanceof Error ? err.message : String(err),
		});
	} finally {
		isRunning = false;
	}
}

export function startDbMaintenance(db: DbContext, logger?: Logger): void {
	// idle 触发一次首检
	const handle = setImmediate(() => {
		void runVacuumIfDue(db, logger);
	});
	handle.unref?.();

	if (tickTimer) clearInterval(tickTimer);
	tickTimer = setInterval(() => {
		void runVacuumIfDue(db, logger);
	}, TICK_INTERVAL_MS);
	tickTimer.unref?.();
}

export function stopDbMaintenance(): void {
	if (tickTimer) {
		clearInterval(tickTimer);
		tickTimer = null;
	}
}
