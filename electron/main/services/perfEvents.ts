/**
 * M0 度量基建：统一的性能事件落库（perf_events 表）。
 *
 * 三类事件写在同一张表里，用 kind 区分：
 * - 'startup_milestone'：app-lifecycle 各阶段耗时（db init / ipc 注册 / ready-to-show / 后台服务就绪）
 * - 'renderer_longtask'：渲染端 PerformanceObserver('longtask') 每分钟汇总计数
 * - 'slow_ipc'：主进程 IPC 调用超过阈值（>100ms）的次数
 *
 * 保留策略与现有 perfTelemetry.ts 的 perf_metrics 表一致：7 天滚动保留，
 * 每 6h 清理一次，本地持久化、不上报。
 */
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export type PerfEventInput = {
	ts?: number;
	kind: string;
	name: string;
	durationMs?: number | null;
	meta?: Record<string, unknown> | null;
};

export async function recordPerfEvent(
	db: DbContext,
	event: PerfEventInput,
	logger?: Logger,
): Promise<void> {
	return recordPerfEventsBatch(db, [event], logger);
}

export async function recordPerfEventsBatch(
	db: DbContext,
	events: PerfEventInput[],
	logger?: Logger,
): Promise<void> {
	if (events.length === 0) return;
	try {
		await db.client.batch(
			events.map((e) => ({
				sql: `INSERT INTO perf_events (ts, kind, name, duration_ms, meta_json) VALUES (?, ?, ?, ?, ?)`,
				args: [
					e.ts ?? Date.now(),
					e.kind,
					e.name,
					e.durationMs ?? null,
					e.meta ? JSON.stringify(e.meta) : null,
				],
			})),
			"write",
		);
	} catch (err) {
		logger?.warn({
			msg: "perfEvents batch insert failed",
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

export async function cleanupOldPerfEvents(
	db: DbContext,
	logger?: Logger,
): Promise<void> {
	try {
		const cutoff = Date.now() - RETENTION_MS;
		await db.client.execute({
			sql: "DELETE FROM perf_events WHERE ts < ?",
			args: [cutoff],
		});
	} catch (err) {
		logger?.warn({
			msg: "perfEvents cleanup failed",
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

export function startPerfEventsCleanup(db: DbContext, logger?: Logger): void {
	void cleanupOldPerfEvents(db, logger);
	if (cleanupTimer) clearInterval(cleanupTimer);
	cleanupTimer = setInterval(() => {
		void cleanupOldPerfEvents(db, logger);
	}, CLEANUP_INTERVAL_MS);
	cleanupTimer.unref?.();
}

export function stopPerfEventsCleanup(): void {
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
}

export type PerfEventRow = {
	id: number;
	ts: number;
	kind: string;
	name: string;
	duration_ms: number | null;
	meta_json: string | null;
};

export async function getRecentPerfEvents(
	db: DbContext,
	options: { kind?: string; limit?: number } = {},
): Promise<PerfEventRow[]> {
	const limit = Math.max(1, Math.min(2000, options.limit ?? 500));
	const result = options.kind
		? await db.client.execute({
				sql: `SELECT id, ts, kind, name, duration_ms, meta_json FROM perf_events WHERE kind = ? ORDER BY ts DESC LIMIT ?`,
				args: [options.kind, limit],
			})
		: await db.client.execute({
				sql: `SELECT id, ts, kind, name, duration_ms, meta_json FROM perf_events ORDER BY ts DESC LIMIT ?`,
				args: [limit],
			});
	return result.rows.map((row) => ({
		id: Number(row.id),
		ts: Number(row.ts),
		kind: String(row.kind),
		name: String(row.name),
		duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
		meta_json: row.meta_json == null ? null : String(row.meta_json),
	}));
}
