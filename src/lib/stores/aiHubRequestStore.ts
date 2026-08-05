/**
 * AI Hub 跨组件请求通道。
 *
 * 解决的问题：会话中枢（左栏 HarnessView）发起「迁移到某个 Web 站点」时，
 * 需要中栏 AiHubPanel **打开指定站点**再注入交接包。但两者没有父子关系，
 * 而 AiHubPanel 自己只按 localStorage 里「上次浏览的站点」决定初始站点——
 * 光调 setMainView("aihub") 会打开错误的站点，注入自然落空。
 *
 * 这里用一个极小的 store 传递「待打开的站点 + 待注入的文本」：
 * HarnessView 投递请求 → AiHubPanel 挂载/更新时消费。
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
