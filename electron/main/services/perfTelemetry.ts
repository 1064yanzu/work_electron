/**
 * 主进程性能 telemetry（本地持久化，不上报）
 *
 * 前台每分钟采集一次 RSS / heap / activeHandles / activeRequests / eventLoopLag，
 * 所有窗口隐藏后降频到 5 分钟一次。
 * 写入 SQLite perf_metrics 表，用于在 Settings → About 面板做本地折线图，
 * 帮助用户与开发者排查"是不是又涨内存了"。
 *
 * 保留窗口：固定 7 天（启动时清理过期行）。
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { BrowserWindow } from "electron";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";

const SAMPLE_INTERVAL_MS = 60 * 1000;
const BACKGROUND_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 每 6h 清一次

let sampleTimer: ReturnType<typeof setTimeout> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let loopDelayHistogram: ReturnType<typeof monitorEventLoopDelay> | null = null;

function hasVisibleWindow(): boolean {
	return BrowserWindow.getAllWindows().some(
		(win) => !win.isDestroyed() && win.isVisible(),
	);
}

function getNextSampleDelayMs(): number {
	return hasVisibleWindow()
		? SAMPLE_INTERVAL_MS
		: BACKGROUND_SAMPLE_INTERVAL_MS;
}

async function insertSample(db: DbContext, logger?: Logger): Promise<void> {
	try {
		const mem = process.memoryUsage();
		// process._getActiveHandles() / _getActiveRequests() 是 Node 内部 API，
		// 在多个 Electron + Node 版本上稳定存在；如未来废弃可兜底为 -1。
		const handles =
			typeof (process as any)._getActiveHandles === "function"
				? ((process as any)._getActiveHandles() as unknown[]).length
				: -1;
		const requests =
			typeof (process as any)._getActiveRequests === "function"
				? ((process as any)._getActiveRequests() as unknown[]).length
				: -1;
		let loopLagMs: number | null = null;
		if (loopDelayHistogram) {
			// 取 1 分钟窗口的 P50 作为代表值，毫秒
			loopLagMs = loopDelayHistogram.mean / 1e6;
			loopDelayHistogram.reset();
		}
		await db.client.execute({
			sql: `INSERT OR REPLACE INTO perf_metrics
				(ts, rss, heap_used, heap_total, external, active_handles, active_requests, event_loop_lag_ms)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				Date.now(),
				mem.rss,
				mem.heapUsed,
				mem.heapTotal,
				mem.external,
				handles,
				requests,
				loopLagMs,
			],
		});
	} catch (err) {
		logger?.warn({
			msg: "perfTelemetry sample failed",
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

async function cleanupOldSamples(
	db: DbContext,
	logger?: Logger,
): Promise<void> {
	try {
		const cutoff = Date.now() - RETENTION_MS;
		await db.client.execute({
			sql: "DELETE FROM perf_metrics WHERE ts < ?",
			args: [cutoff],
		});
	} catch (err) {
		logger?.warn({
			msg: "perfTelemetry cleanup failed",
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

export function startPerfTelemetry(db: DbContext, logger?: Logger): void {
	try {
		loopDelayHistogram = monitorEventLoopDelay({ resolution: 50 });
		loopDelayHistogram.enable();
	} catch {
		loopDelayHistogram = null;
	}

	// 启动后 30s 落第一条样本，避免与启动期高负载重合
	const scheduleSample = (delayMs: number) => {
		if (sampleTimer) clearTimeout(sampleTimer);
		sampleTimer = setTimeout(() => {
			void insertSample(db, logger).finally(() => {
				if (!sampleTimer) return;
				scheduleSample(getNextSampleDelayMs());
			});
		}, delayMs);
		sampleTimer.unref?.();
	};
	scheduleSample(30_000);

	// 启动时清理一次过期数据
	void cleanupOldSamples(db, logger);
	if (cleanupTimer) clearInterval(cleanupTimer);
	cleanupTimer = setInterval(() => {
		void cleanupOldSamples(db, logger);
	}, CLEANUP_INTERVAL_MS);
	cleanupTimer.unref?.();
}

export function stopPerfTelemetry(): void {
	if (sampleTimer) {
		clearTimeout(sampleTimer);
		sampleTimer = null;
	}
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
	if (loopDelayHistogram) {
		try {
			loopDelayHistogram.disable();
		} catch {
			// noop
		}
		loopDelayHistogram = null;
	}
}

export async function getRecentPerfMetrics(
	db: DbContext,
	limit = 360,
): Promise<
	Array<{
		ts: number;
		rss: number;
		heap_used: number;
		heap_total: number;
		external: number;
		active_handles: number;
		active_requests: number;
		event_loop_lag_ms?: number;
	}>
> {
	const result = await db.client.execute({
		sql: `SELECT ts, rss, heap_used, heap_total, external, active_handles, active_requests, event_loop_lag_ms
			FROM perf_metrics
			ORDER BY ts DESC
			LIMIT ?`,
		args: [Math.max(1, Math.min(1440, limit))],
	});
	return result.rows.map((row) => ({
		ts: Number(row.ts),
		rss: Number(row.rss),
		heap_used: Number(row.heap_used),
		heap_total: Number(row.heap_total),
		external: Number(row.external),
		active_handles: Number(row.active_handles),
		active_requests: Number(row.active_requests),
		event_loop_lag_ms:
			row.event_loop_lag_ms == null ? undefined : Number(row.event_loop_lag_ms),
	}));
}
