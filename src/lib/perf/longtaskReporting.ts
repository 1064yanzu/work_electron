/**
 * M0.2 渲染端 longtask 观测
 *
 * `PerformanceObserver('longtask')` 常驻监听主线程 >50ms 的任务，
 * 每分钟把「次数 + 累计耗时」汇总一次上报给主进程，写入 perf_events
 * (kind='renderer_longtask')，用于跟 Agent 流式期间的卡顿做 before/after 对比。
 *
 * 不逐条上报（避免 IPC 本身成为新的性能负担），只做本地聚合 + 定时批量上报。
 */
import { invoke } from "../tauriCompat";

const REPORT_INTERVAL_MS = 60_000;

let count = 0;
let totalDurationMs = 0;
let windowStartedAt = 0;
let reportTimer: ReturnType<typeof setInterval> | null = null;
let observer: PerformanceObserver | null = null;

function flush(): void {
	if (count === 0) {
		windowStartedAt = Date.now();
		return;
	}
	const payload = {
		count,
		totalDurationMs: Math.round(totalDurationMs),
		windowMs: Date.now() - windowStartedAt,
	};
	count = 0;
	totalDurationMs = 0;
	windowStartedAt = Date.now();
	void invoke("perf_report_renderer_longtasks", payload).catch(() => {
		// 主进程不可达（启动时序 / 退出阶段）不影响渲染端功能
	});
}

export function installLongtaskReporting(): void {
	if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
		return;
	}
	// longtask entry type 并非所有环境都支持（Electron/Chromium 内核支持良好）
	if (
		!PerformanceObserver.supportedEntryTypes ||
		!PerformanceObserver.supportedEntryTypes.includes("longtask")
	) {
		return;
	}

	windowStartedAt = Date.now();
	try {
		observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				count += 1;
				totalDurationMs += entry.duration;
			}
		});
		observer.observe({ type: "longtask", buffered: false });
	} catch {
		observer = null;
		return;
	}

	reportTimer = setInterval(flush, REPORT_INTERVAL_MS);

	window.addEventListener("beforeunload", () => {
		flush();
	});
}

export function uninstallLongtaskReporting(): void {
	if (reportTimer) {
		clearInterval(reportTimer);
		reportTimer = null;
	}
	if (observer) {
		observer.disconnect();
		observer = null;
	}
}
