/**
 * LLM 流式调用注册表
 *
 * 给每个进行中的流式请求一个 streamId，用 AbortController 联动取消：
 *  - 渲染端在会话切换/卸载时主动 cancel，避免上游 SSE 连接堆叠
 *  - 主进程的 fetch / SSE 解析也会随 signal abort 而立即停止
 *
 * 设计参考 `electron/main/ipc/handlers/agentSdk/runRegistry.ts`：
 * 上限 + 兜底超时清理，防止异常路径下的 entry 残留。
 */

const MAX_REGISTRY_SIZE = 100;
// invoke.ts 中 LLM_STREAM_TIMEOUT_MS = 5 分钟；兜底超时设为 8 分钟（1.6× margin），
// 极端路径下的孤儿 entry 在 8 分钟后强制释放，比原 10 分钟更早回收。
const ENTRY_MAX_LIFETIME_MS = 8 * 60 * 1000;

type Entry = {
	controller: AbortController;
	createdAt: number;
	timer: ReturnType<typeof setTimeout>;
};

class LlmStreamRegistry {
	private entries = new Map<string, Entry>();

	register(streamId: string): AbortController {
		this.unregister(streamId);

		if (this.entries.size >= MAX_REGISTRY_SIZE) {
			this.evictOldest();
		}

		const controller = new AbortController();
		const timer = setTimeout(() => {
			this.cancel(streamId, "registry-timeout");
		}, ENTRY_MAX_LIFETIME_MS);

		this.entries.set(streamId, {
			controller,
			createdAt: Date.now(),
			timer,
		});
		return controller;
	}

	get(streamId: string): AbortController | undefined {
		return this.entries.get(streamId)?.controller;
	}

	/** 主动取消某个流。返回是否成功（streamId 不存在时返回 false） */
	cancel(streamId: string, reason: string = "user-cancelled"): boolean {
		const entry = this.entries.get(streamId);
		if (!entry) return false;
		try {
			entry.controller.abort(new Error(reason));
		} catch {
			// noop
		}
		this.unregister(streamId);
		return true;
	}

	/** 取消所有正在进行的流，返回取消的数量 */
	cancelAll(reason: string = "cancel-all"): number {
		let count = 0;
		for (const id of [...this.entries.keys()]) {
			if (this.cancel(id, reason)) count++;
		}
		return count;
	}

	/** 流结束（成功/失败）后调用，从注册表中移除 */
	unregister(streamId: string): void {
		const entry = this.entries.get(streamId);
		if (!entry) return;
		clearTimeout(entry.timer);
		this.entries.delete(streamId);
	}

	size(): number {
		return this.entries.size;
	}

	private evictOldest(): void {
		let oldestId: string | null = null;
		let oldestTime = Number.POSITIVE_INFINITY;
		for (const [id, entry] of this.entries) {
			if (entry.createdAt < oldestTime) {
				oldestTime = entry.createdAt;
				oldestId = id;
			}
		}
		if (oldestId) this.cancel(oldestId, "registry-evicted");
	}
}

export const llmStreamRegistry = new LlmStreamRegistry();

/**
 * 把多个 AbortSignal 合并为一个：任一 signal abort 即触发新 controller abort。
 * 兼容 Node v20 之前没有 AbortSignal.any 的环境。
 */
export function combineAbortSignals(
	signals: (AbortSignal | undefined)[],
): AbortSignal {
	const controller = new AbortController();
	for (const signal of signals) {
		if (!signal) continue;
		if (signal.aborted) {
			controller.abort(signal.reason);
			return controller.signal;
		}
		signal.addEventListener(
			"abort",
			() => {
				controller.abort(signal.reason);
			},
			{ once: true },
		);
	}
	return controller.signal;
}
