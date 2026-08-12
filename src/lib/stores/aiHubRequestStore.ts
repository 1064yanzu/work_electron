/**
 * AI Hub 跨组件请求通道。
 *
 * 解决的问题：Hub 的接力抽屉把交接包送进某个 Web 站点时，附件与正文两条通道
 * 都可能因为站点 DOM 变动而落空。此时需要让**站点面板自己**在原生视图真正
 * 就绪之后重试注入——发起方无从知道那个时机（视图的挂载由面板负责，是异步的），
 * 定时等待属于竞态。
 *
 * 这里用一个极小的 store 传递「待注入的站点 + 文本」：
 * HandoffDrawer 投递请求 → AiHubPanel 挂载/更新时消费。
 * 消费方负责在注入完成后调 clear()，避免重复注入。
 */

import { useSyncExternalStore } from "react";

export interface AiHubRequest {
	/** 要打开的站点 id */
	siteId: string;
	/** 打开后要填入输入框的文本；不传则只切站点 */
	text?: string;
	/** 用于区分同一站点的多次请求（时间戳递增即可） */
	token: number;
}

class AiHubRequestStore {
	private state: AiHubRequest | null = null;
	private listeners = new Set<() => void>();

	getState = (): AiHubRequest | null => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		for (const listener of this.listeners) listener();
	}

	/** 投递一个「打开站点（并可选注入）」请求。 */
	request(siteId: string, text?: string): void {
		this.state = { siteId, text, token: Date.now() };
		this.emit();
	}

	/** 消费完毕后清空，避免重复注入。 */
	clear(): void {
		if (!this.state) return;
		this.state = null;
		this.emit();
	}
}

export const aiHubRequestStore = new AiHubRequestStore();

/** 订阅当前待处理的 AI Hub 请求。 */
export function useAiHubRequest(): AiHubRequest | null {
	return useSyncExternalStore(
		aiHubRequestStore.subscribe,
		aiHubRequestStore.getState,
		aiHubRequestStore.getState,
	);
}
