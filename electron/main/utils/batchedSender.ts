/**
 * BatchedSender
 * 把同一通道上的高频 webContents.send 合并到下一个 I/O 周期一次性发送，
 * 大幅降低 structured clone 与渲染端 setState 的频率。
 *
 * 渲染端通过 src/lib/tauriEventCompat.ts 的 listen() 自动展开 items 数组，
 * 因此 IPC 消费方代码无需修改。
 */
import type { BrowserWindow } from "electron";
import { sendToLiveWebContents } from "./safeWebContentsSend";

export interface BatchedSenderOptions {
	/** 强制 flush 的累计字节阈值（按 JSON.stringify 估算） */
	maxBytes?: number;
	/** 强制 flush 的累计条数阈值 */
	maxCount?: number;
	/** 强制 flush 的最大延迟（兜底，避免 setImmediate 在饱和事件循环里被一直推后） */
	maxDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<BatchedSenderOptions> = {
	maxBytes: 64 * 1024,
	maxCount: 256,
	maxDelayMs: 16,
};

export class BatchedSender<T> {
	private buffer: T[] = [];
	private bufferedBytes = 0;
	private flushScheduled = false;
	private maxDelayTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly options: Required<BatchedSenderOptions>;

	constructor(
		private readonly channel: string,
		private readonly getMainWindow: () => BrowserWindow | null,
		options?: BatchedSenderOptions,
	) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	/** 入队一条事件；按需调度 flush */
	send(item: T): void {
		this.buffer.push(item);
		this.bufferedBytes += estimateBytes(item);

		if (
			this.bufferedBytes >= this.options.maxBytes ||
			this.buffer.length >= this.options.maxCount
		) {
			this.flush();
			return;
		}

		this.scheduleFlush();
	}

	/** 立即 flush（用于关键边界，如 done=true） */
	flush(): void {
		if (this.maxDelayTimer) {
			clearTimeout(this.maxDelayTimer);
			this.maxDelayTimer = null;
		}
		this.flushScheduled = false;

		if (this.buffer.length === 0) return;

		const items = this.buffer;
		this.buffer = [];
		this.bufferedBytes = 0;

		const win = this.getMainWindow();
		if (!win || win.isDestroyed()) return;
		sendToLiveWebContents(win, this.channel, { items });
	}

	/** 主进程退出/窗口关闭时调用 */
	dispose(): void {
		this.flush();
		if (this.maxDelayTimer) {
			clearTimeout(this.maxDelayTimer);
			this.maxDelayTimer = null;
		}
	}

	private scheduleFlush(): void {
		if (this.flushScheduled) return;
		this.flushScheduled = true;

		setImmediate(() => {
			if (this.flushScheduled) this.flush();
		});

		if (!this.maxDelayTimer) {
			this.maxDelayTimer = setTimeout(() => {
				this.maxDelayTimer = null;
				this.flush();
			}, this.options.maxDelayMs);
		}
	}
}

function estimateBytes(value: unknown): number {
	if (value == null) return 8;
	if (typeof value === "string") return value.length * 2;
	if (typeof value === "number" || typeof value === "boolean") return 8;
	try {
		return JSON.stringify(value).length * 2;
	} catch {
		return 256;
	}
}
