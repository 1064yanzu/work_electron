/**
 * 阅读器音频预取器
 *
 * 设计意图：
 *  - 在段 N 播放期间并行合成段 N+1、N+2，让段间衔接接近无缝
 *  - 使用滑动窗口，跳过远端段；jumpTo / 切章 / settings 变化时清空
 *  - 失败结果不缓存，下次自动重试或回落到同步合成路径
 *
 * 不做的事：
 *  - 不依赖 React、不直接订阅 store —— 由 ReaderSpeechController 决定何时调度
 *  - 不暴露任何 IPC；调用方必须传入完整的 TTSSynthesizeRequest（其 voice/provider
 *    已在外层 resolveSpeakConfig 锁定，避免缓存与最新 settings 漂移）
 *  - 不参与播放：拿到的 RemoteAudioPayload 由 speakPrefetchedTts 消费
 */

import type { RemoteAudioPayload, TTSSynthesizeRequest } from "../tts";
import { synthesizeRemoteAudio } from "../tts";

/** 缓存条目；resolved 后 promise 不再变更，可重复 await */
interface PrefetchEntry {
	promise: Promise<RemoteAudioPayload | null>;
	settled: boolean;
	ok: boolean;
}

export interface AudioPrefetcher {
	/** 启动一段的预合成；同 index 已存在则忽略（除非已失败被剔除） */
	prefetch(index: number, request: TTSSynthesizeRequest): void;
	/**
	 * 取出某段的合成结果。
	 *  - 已 resolved 成功 → 立即返回 payload Promise
	 *  - 仍 pending → 返回 Promise，调用方 await 即可
	 *  - 不存在 / 已失败 → 返回 null，调用方应 fallback 到同步路径
	 */
	take(index: number): Promise<RemoteAudioPayload | null> | null;
	/** 强制移除某段缓存（合成失败、被失效） */
	invalidate(index: number): void;
	/** 滑动窗口：保留 [cursor - behind, cursor + ahead] 之内的缓存，其余丢弃 */
	pruneOutsideWindow(cursor: number, behind: number, ahead: number): void;
	/** 完全清空（settings 变化、stop、切章） */
	clear(): void;
	/** 调试用：当前缓存中的索引集合 */
	readonly cachedIndexes: number[];
}

export function createAudioPrefetcher(): AudioPrefetcher {
	const cache = new Map<number, PrefetchEntry>();

	function prefetch(index: number, request: TTSSynthesizeRequest): void {
		if (cache.has(index)) return;

		const promise: Promise<RemoteAudioPayload | null> = synthesizeRemoteAudio(
			request,
		)
			.then((payload) => {
				const entry = cache.get(index);
				if (entry) {
					entry.settled = true;
					entry.ok = true;
				}
				return payload;
			})
			.catch((err) => {
				console.warn("[audioPrefetcher] synthesize failed", index, err);
				const entry = cache.get(index);
				if (entry) {
					entry.settled = true;
					entry.ok = false;
				}
				// 失败标记为 settled+ok=false；take() 会过滤掉
				return null;
			});

		cache.set(index, { promise, settled: false, ok: false });
	}

	function take(index: number): Promise<RemoteAudioPayload | null> | null {
		const entry = cache.get(index);
		if (!entry) return null;
		// 已知失败 → 直接返回 null，让上层走 fallback
		if (entry.settled && !entry.ok) return null;
		return entry.promise;
	}

	function invalidate(index: number): void {
		cache.delete(index);
	}

	function pruneOutsideWindow(
		cursor: number,
		behind: number,
		ahead: number,
	): void {
		const lo = cursor - behind;
		const hi = cursor + ahead;
		for (const idx of Array.from(cache.keys())) {
			if (idx < lo || idx > hi) cache.delete(idx);
		}
	}

	function clear(): void {
		cache.clear();
	}

	return {
		prefetch,
		take,
		invalidate,
		pruneOutsideWindow,
		clear,
		get cachedIndexes() {
			return Array.from(cache.keys()).sort((a, b) => a - b);
		},
	};
}
