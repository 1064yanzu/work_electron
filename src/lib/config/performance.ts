import { getConfig, setConfig } from "./core";

export type PerformanceTuning = {
	sourceAutoRefreshMs: number;
	remoteSyncIntervalMs: number;
	enableUiDebugLogs: boolean;
};

const DEFAULT_PERFORMANCE_TUNING: PerformanceTuning = {
	sourceAutoRefreshMs: 10000,
	remoteSyncIntervalMs: 20000,
	enableUiDebugLogs: false,
};

const PERFORMANCE_CONFIG_KEYS = {
	sourceAutoRefreshMs: "performance.sourceAutoRefreshMs",
	remoteSyncIntervalMs: "performance.remoteSyncIntervalMs",
	enableUiDebugLogs: "performance.enableUiDebugLogs",
} as const;

let cachedPerformanceTuning: PerformanceTuning = {
	...DEFAULT_PERFORMANCE_TUNING,
};
let cachedPerformanceTuningLoaded = false;

export function getCachedPerformanceTuning(): PerformanceTuning {
	return cachedPerformanceTuning;
}

export function isUiDebugLogsEnabled(): boolean {
	return cachedPerformanceTuning.enableUiDebugLogs;
}

function normalizeInterval(
	value: unknown,
	defaultValue: number,
	min: number,
	max: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return defaultValue;
	return Math.max(min, Math.min(max, Math.floor(value)));
}

export async function getPerformanceTuning(
	forceRefresh = false,
): Promise<PerformanceTuning> {
	if (cachedPerformanceTuningLoaded && !forceRefresh) {
		return cachedPerformanceTuning;
	}
	try {
		const [
			sourceAutoRefreshMsRaw,
			remoteSyncIntervalMsRaw,
			enableUiDebugLogsRaw,
		] = await Promise.all([
			getConfig(PERFORMANCE_CONFIG_KEYS.sourceAutoRefreshMs),
			getConfig(PERFORMANCE_CONFIG_KEYS.remoteSyncIntervalMs),
			getConfig(PERFORMANCE_CONFIG_KEYS.enableUiDebugLogs),
		]);
		cachedPerformanceTuning = {
			sourceAutoRefreshMs: normalizeInterval(
				sourceAutoRefreshMsRaw,
				DEFAULT_PERFORMANCE_TUNING.sourceAutoRefreshMs,
				2000,
				60_000,
			),
			remoteSyncIntervalMs: normalizeInterval(
				remoteSyncIntervalMsRaw,
				DEFAULT_PERFORMANCE_TUNING.remoteSyncIntervalMs,
				5000,
				120_000,
			),
			enableUiDebugLogs: Boolean(enableUiDebugLogsRaw),
		};
	} catch {
		cachedPerformanceTuning = { ...DEFAULT_PERFORMANCE_TUNING };
	}
	cachedPerformanceTuningLoaded = true;
	return cachedPerformanceTuning;
}

export async function setPerformanceTuning(
	patch: Partial<PerformanceTuning>,
): Promise<PerformanceTuning> {
	const current = await getPerformanceTuning();
	const next: PerformanceTuning = {
		sourceAutoRefreshMs: normalizeInterval(
			patch.sourceAutoRefreshMs ?? current.sourceAutoRefreshMs,
			DEFAULT_PERFORMANCE_TUNING.sourceAutoRefreshMs,
			2000,
			60_000,
		),
		remoteSyncIntervalMs: normalizeInterval(
			patch.remoteSyncIntervalMs ?? current.remoteSyncIntervalMs,
			DEFAULT_PERFORMANCE_TUNING.remoteSyncIntervalMs,
			5000,
			120_000,
		),
		enableUiDebugLogs:
			typeof patch.enableUiDebugLogs === "boolean"
				? patch.enableUiDebugLogs
				: current.enableUiDebugLogs,
	};
	cachedPerformanceTuning = next;
	cachedPerformanceTuningLoaded = true;
	await Promise.all([
		setConfig(
			PERFORMANCE_CONFIG_KEYS.sourceAutoRefreshMs,
			next.sourceAutoRefreshMs,
		),
		setConfig(
			PERFORMANCE_CONFIG_KEYS.remoteSyncIntervalMs,
			next.remoteSyncIntervalMs,
		),
		setConfig(
			PERFORMANCE_CONFIG_KEYS.enableUiDebugLogs,
			next.enableUiDebugLogs,
		),
	]);
	return next;
}
