import { getPerformanceTuning, isUiDebugLogsEnabled } from "../config";

let preloadPromise: Promise<void> | null = null;

export function preloadUiDebugSetting() {
	if (preloadPromise) return preloadPromise;
	preloadPromise = getPerformanceTuning()
		.then(() => undefined)
		.catch(() => undefined);
	return preloadPromise;
}

export function debugUiLog(...args: unknown[]) {
	if (!isUiDebugLogsEnabled()) return;
	console.log(...args);
}

export function debugUiWarn(...args: unknown[]) {
	if (!isUiDebugLogsEnabled()) return;
	console.warn(...args);
}
