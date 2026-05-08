/**
 * TTS 流式调用注册表
 *
 * 与 electron/main/llm/streamRegistry.ts 同模式，维护一个全局的 streamId → AbortController 表。
 * 渲染端通过 tts_cancel 主动取消，主进程的 fetch 也会随 signal abort 立即终止。
 */

const MAX_REGISTRY_SIZE = 50;
const ENTRY_MAX_LIFETIME_MS = 5 * 60 * 1000;

type Entry = {
	controller: AbortController;
	createdAt: number;
	timer: ReturnType<typeof setTimeout>;
};

class TtsStreamRegistry {
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

	cancelAll(reason: string = "cancel-all"): number {
		let count = 0;
		for (const id of [...this.entries.keys()]) {
			if (this.cancel(id, reason)) count++;
		}
		return count;
	}

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

export const ttsStreamRegistry = new TtsStreamRegistry();
