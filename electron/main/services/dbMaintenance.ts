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
import { BrowserWindow } from "electron";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { cleanExpiredAgentSessions } from "./agentRetention";
import { cleanExpiredConversationLogs } from "./conversationLogRetention";
import { runDataLifecycleCleanup } from "./dataLifecycle";
import { resetFtsAfterVacuum } from "../kb/ftsRebuild";

const WAL_CHECKPOINT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 每 24h 做一次 TRUNCATE checkpoint，给 -wal 文件封顶

function hasVisibleWindow(): boolean {
	return BrowserWindow.getAllWindows().some(
		(win) => !win.isDestroyed() && win.isVisible(),
	);
}

/**
 * B7：WAL 模式下 -wal 文件会持续增长直到 checkpoint。
 * 常规读写会触发被动 checkpoint，但为避免极端场景下 -wal 文件无限增长，
 * 这里每 24h 主动做一次 TRUNCATE checkpoint（把 -wal 内容写回主库文件并截断）。
 */
async function runWalCheckpoint(db: DbContext, logger?: Logger): Promise<void> {
	if (!db.walEnabled) return;
	try {
		await db.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
	} catch (err) {
		logger?.warn({
			msg: "WAL checkpoint failed",
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

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
	// libsql file 模式下 VACUUM 是同步执行的，需要全库写锁——有可见窗口时执行会
	// 冻结主进程 event loop，进而冻结整个 UI。挪到「所有窗口隐藏或即将退出」时机，
	// 错过的窗口留给下一次 24h tick（VACUUM 本身幂等，不会丢数据）。
	if (hasVisibleWindow()) return;
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
		// D1+D2 跟进项：VACUUM 可能重排 note_chunks 的隐式 rowid，
		// 会使 external content 的 note_chunks_fts_v2 rowid 映射失真。
		// 重置回填游标并触发 idle 重回填（期间读路径自动回落旧 FTS 表）。
		await resetFtsAfterVacuum(db, logger);
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

	// B4：conversations 审计日志轮转——启动后延迟一次（后台、不阻塞启动链路）
	const conversationLogTimer = setTimeout(() => {
		void cleanExpiredConversationLogs(logger);
	}, 30_000);
	conversationLogTimer.unref?.();

	// D3/D6/D10：数据生命周期清理（孤儿/软删/回收站/访问记录/本地备份修剪）——
	// 启动后延迟一次；24h tick 常驻。内部逐步骤容错，失败只 warn。
	const dataLifecycleTimer = setTimeout(() => {
		void runDataLifecycleCleanup(db, logger);
	}, 60_000);
	dataLifecycleTimer.unref?.();

	let lastWalCheckpointAt = 0;
	if (tickTimer) clearInterval(tickTimer);
	tickTimer = setInterval(() => {
		void runVacuumIfDue(db, logger);
		// agent 会话保留策略：每次 tick 时顺便清理过期会话
		void cleanExpiredAgentSessions(db, logger).catch((err) => {
			logger?.warn({
				msg: "Agent retention cleanup failed",
				error: err instanceof Error ? err.message : String(err),
			});
		});
		// B4：conversations 审计日志轮转（内部自吞异常，保留 14 天）
		void cleanExpiredConversationLogs(logger);
		// D3/D6/D10：数据生命周期清理（内部逐步骤容错，绝不抛出）
		void runDataLifecycleCleanup(db, logger);
		const now = Date.now();
		if (now - lastWalCheckpointAt >= WAL_CHECKPOINT_INTERVAL_MS) {
			lastWalCheckpointAt = now;
			void runWalCheckpoint(db, logger);
		}
	}, TICK_INTERVAL_MS);
	tickTimer.unref?.();
}

export function stopDbMaintenance(): void {
	if (tickTimer) {
		clearInterval(tickTimer);
		tickTimer = null;
	}
}
