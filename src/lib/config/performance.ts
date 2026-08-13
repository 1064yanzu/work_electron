import { createStore, createUseStoreSelector } from "../stores/createStore";
import { getConfig, setConfig } from "./core";

export type PerformanceTuning = {
	sourceAutoRefreshMs: number;
	remoteSyncIntervalMs: number;
	enableUiDebugLogs: boolean;
	/** 长对话虚拟渲染（>60 条时历史区虚拟化；关闭则全量渲染） */
	chatVirtualization: boolean;
};

const DEFAULT_PERFORMANCE_TUNING: PerformanceTuning = {
	sourceAutoRefreshMs: 10000,
	remoteSyncIntervalMs: 20000,
	enableUiDebugLogs: false,
	chatVirtualization: true,
};

const PERFORMANCE_CONFIG_KEYS = {
	sourceAutoRefreshMs: "performance.sourceAutoRefreshMs",
	remoteSyncIntervalMs: "performance.remoteSyncIntervalMs",
	enableUiDebugLogs: "performance.enableUiDebugLogs",
	chatVirtualization: "performance.chatVirtualization",
} as const;

/**
 * 性能调优项现在由一个 store 承载，而不是裸的模块级变量。
 *
 * 原因：`getCachedPerformanceTuning()` 是同步读快照，组件在渲染期读它拿到的值
 * 不具备响应性——用户在设置面板里改完「长对话虚拟渲染」开关，已挂载的消息列表
 * 不会重新渲染，必须重开会话或重启应用才生效。
 *
 * 改成 store 之后：写入侧（`setPerformanceTuning`，设置面板正在调用的就是它）
 * 和加载侧（`getPerformanceTuning`）都走 `store.setState`，
 * 订阅侧用 `usePerformanceTuningSelector` 即可即时响应，无需改动设置面板。
 */
const performanceStore = createStore<PerformanceTuning>({
	...DEFAULT_PERFORMANCE_TUNING,
});

let cachedPerformanceTuningLoaded = false;

/** 同步读当前快照。非响应式——组件请改用 `usePerformanceTuningSelector`。 */
export function getCachedPerformanceTuning(): PerformanceTuning {
	return performanceStore.getState();
}

/**
 * 订阅式读取性能调优项。设置面板改动后组件会立即重渲染。
 *
 * @example
 * const enabled = usePerformanceTuningSelector((s) => s.chatVirtualization);
 */
export const usePerformanceTuningSelector =
	createUseStoreSelector<PerformanceTuning>(performanceStore);

export function isUiDebugLogsEnabled(): boolean {
	return performanceStore.getState().enableUiDebugLogs;
}

/** 统一的写入口：只有内容真的变了才 setState（createStore 内部也会做 Object.is 兜底）。 */
function commitPerformanceTuning(next: PerformanceTuning) {
	performanceStore.setState((prev) => {
		const unchanged =
			prev.sourceAutoRefreshMs === next.sourceAutoRefreshMs &&
			prev.remoteSyncIntervalMs === next.remoteSyncIntervalMs &&
			prev.enableUiDebugLogs === next.enableUiDebugLogs &&
			prev.chatVirtualization === next.chatVirtualization;
		return unchanged ? prev : next;
	});
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
		return performanceStore.getState();
	}
	try {
		const [
			sourceAutoRefreshMsRaw,
			remoteSyncIntervalMsRaw,
			enableUiDebugLogsRaw,
			chatVirtualizationRaw,
		] = await Promise.all([
			getConfig(PERFORMANCE_CONFIG_KEYS.sourceAutoRefreshMs),
			getConfig(PERFORMANCE_CONFIG_KEYS.remoteSyncIntervalMs),
			getConfig(PERFORMANCE_CONFIG_KEYS.enableUiDebugLogs),
			getConfig(PERFORMANCE_CONFIG_KEYS.chatVirtualization),
		]);
		commitPerformanceTuning({
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
			// 未设置时默认开启
			chatVirtualization:
				typeof chatVirtualizationRaw === "boolean"
					? chatVirtualizationRaw
					: DEFAULT_PERFORMANCE_TUNING.chatVirtualization,
		});
	} catch {
		commitPerformanceTuning({ ...DEFAULT_PERFORMANCE_TUNING });
	}
	cachedPerformanceTuningLoaded = true;
	return performanceStore.getState();
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
		chatVirtualization:
			typeof patch.chatVirtualization === "boolean"
				? patch.chatVirtualization
				: current.chatVirtualization,
	};
	// 先落 store：设置面板里切换开关后，订阅方（如消息列表的虚拟化开关）
	// 无需等待 IPC 往返即可即时生效
	commitPerformanceTuning(next);
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
		setConfig(
			PERFORMANCE_CONFIG_KEYS.chatVirtualization,
			next.chatVirtualization,
		),
	]);
	return next;
}
