/**
 * ChatPersistScheduler —— localStorage 后端的写盘调度。
 *
 * 从 `chat/store.ts` 里抽出来的一段自成体系的逻辑：ChatStore 本身关心的是
 * 「会话/消息怎么变」，而「什么时候真正写盘」是另一件事，掺在一起让 store
 * 多了 4 个字段（saveScheduled / lastSaveTime / saveTimeout / idleSaveId）和
 * 3 个私有方法，且这些字段在 flush 路径上还要被小心地逐个复位。
 *
 * 调度策略（行为与抽取前完全一致）：
 * - `immediate`：取消已排队的节流定时器，立刻进入 idle 队列。
 *   不同步写是为了避免在用户交互（点击/输入）当帧引入卡顿。
 * - `normal` / `streaming`：按各自的节流窗口合并写入。
 *   流式期间用大得多的窗口（2s vs 500ms），否则每个 chunk 都要序列化整棵会话树。
 * - 真正落盘尽量放进 `requestIdleCallback`（1.5s 超时兜底），避免和打字/滚动抢主线程；
 *   环境不支持时退化为同步写。
 * - `flush()`：取消所有排队，立即同步写。用于 beforeunload / 页面隐藏，
 *   这时候没有"下一帧"了，必须同步。
 */

export type ChatPersistMode = "normal" | "streaming" | "immediate";

export interface ChatPersistSchedulerOptions {
	/** 实际写盘动作（同步）。 */
	save: () => void;
	/** normal 模式节流窗口 */
	throttleMs?: number;
	/** streaming 模式节流窗口 */
	streamingThrottleMs?: number;
	/** requestIdleCallback 的超时兜底 */
	idleTimeoutMs?: number;
}

const DEFAULT_THROTTLE_MS = 500;
const DEFAULT_STREAMING_THROTTLE_MS = 2000;
const DEFAULT_IDLE_TIMEOUT_MS = 1500;

type IdleWindow = Window & {
	requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
	cancelIdleCallback?: (handle: number) => void;
};

export class ChatPersistScheduler {
	private scheduled = false;
	private lastSaveTime = 0;
	private timeout: ReturnType<typeof setTimeout> | null = null;
	private idleHandle: number | null = null;

	private readonly save: () => void;
	private readonly throttleMs: number;
	private readonly streamingThrottleMs: number;
	private readonly idleTimeoutMs: number;

	constructor(options: ChatPersistSchedulerOptions) {
		this.save = options.save;
		this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
		this.streamingThrottleMs =
			options.streamingThrottleMs ?? DEFAULT_STREAMING_THROTTLE_MS;
		this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
	}

	schedule(mode: ChatPersistMode) {
		if (mode === "immediate") {
			this.clearTimeout();
			this.queueIdleSave();
			return;
		}

		const throttleMs =
			mode === "streaming" ? this.streamingThrottleMs : this.throttleMs;

		const now = Date.now();
		if (now - this.lastSaveTime >= throttleMs) {
			this.queueIdleSave();
			return;
		}

		// 已有排队的尾沿写入，本次合并进去
		if (this.timeout !== null) return;

		this.timeout = setTimeout(
			() => {
				this.timeout = null;
				this.queueIdleSave();
			},
			throttleMs - (now - this.lastSaveTime),
		);
	}

	/** 取消所有排队并立即同步写盘。 */
	flush() {
		this.cancel();
		this.save();
		this.lastSaveTime = Date.now();
	}

	/** 只取消排队，不写盘。 */
	cancel() {
		this.clearTimeout();
		this.clearIdle();
		this.scheduled = false;
	}

	private queueIdleSave() {
		if (this.scheduled) return;
		this.scheduled = true;

		const run = () => {
			this.scheduled = false;
			this.idleHandle = null;
			this.save();
			this.lastSaveTime = Date.now();
		};

		const w = typeof window !== "undefined" ? (window as IdleWindow) : null;
		if (w && typeof w.requestIdleCallback === "function") {
			// 优先用空闲时间，避免阻塞打字/滚动
			this.idleHandle = w.requestIdleCallback(run, {
				timeout: this.idleTimeoutMs,
			});
			return;
		}

		// environment 不支持 requestIdleCallback：退化为同步写
		run();
	}

	private clearTimeout() {
		if (this.timeout === null) return;
		clearTimeout(this.timeout);
		this.timeout = null;
	}

	private clearIdle() {
		if (this.idleHandle === null) return;
		const w = typeof window !== "undefined" ? (window as IdleWindow) : null;
		if (w && typeof w.cancelIdleCallback === "function") {
			w.cancelIdleCallback(this.idleHandle);
		}
		this.idleHandle = null;
	}
}
