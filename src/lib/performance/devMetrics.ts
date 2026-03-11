interface DevMetricEntry {
	name: string;
	durationMs: number;
	detail?: Record<string, unknown>;
	ts: number;
}

declare global {
	interface Window {
		__IPO_DEV_METRICS__?: DevMetricEntry[];
	}
}

const MAX_METRICS = 200;

function canRecordMetric() {
	return import.meta.env.DEV && typeof window !== "undefined";
}

export function recordDevMetric(
	name: string,
	durationMs: number,
	detail?: Record<string, unknown>,
) {
	if (!canRecordMetric()) return;
	const entry: DevMetricEntry = {
		name,
		durationMs,
		detail,
		ts: Date.now(),
	};
	const queue = window.__IPO_DEV_METRICS__ ?? [];
	queue.push(entry);
	if (queue.length > MAX_METRICS) {
		queue.splice(0, queue.length - MAX_METRICS);
	}
	window.__IPO_DEV_METRICS__ = queue;
	console.info(`[perf] ${name}: ${durationMs.toFixed(1)}ms`, detail ?? {});
}

export function measureNextPaint(
	name: string,
	startedAt: number,
	detail?: Record<string, unknown>,
) {
	if (!canRecordMetric()) return;
	requestAnimationFrame(() => {
		recordDevMetric(name, performance.now() - startedAt, detail);
	});
}

export function measureAsyncDuration<T>(
	name: string,
	promise: Promise<T>,
	detail?: Record<string, unknown>,
): Promise<T> {
	if (!canRecordMetric()) return promise;
	const startedAt = performance.now();
	return promise.finally(() => {
		recordDevMetric(name, performance.now() - startedAt, detail);
	});
}
