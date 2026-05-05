/**
 * 飞书 WebSocket 重连状态机
 *
 * 负责：
 * - 重连尝试计数（达到 MAX_RECONNECT_ATTEMPTS 后停止重连）
 * - 退避延迟（线性退避，封顶 6 倍基础延迟）
 * - stop() 时取消未触发的定时器
 *
 * 触发实际重连交给外部回调（避免和 WSClient 创建/销毁逻辑耦合）。
 */

import type { Logger } from "../../../logging/types";

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export interface FeishuReconnectDeps {
	logger: Logger;
	/** 是否已 stop（避免对已停止的 channel 触发重连） */
	isStopped: () => boolean;
	/** 达到上限时上报最终失败状态 */
	onGiveUp: (reason: string) => void;
	/** 触发实际重连：清理 wsClient + 重新 startWebSocket */
	doReconnect: () => void;
}

export class FeishuReconnectScheduler {
	private attempts = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly deps: FeishuReconnectDeps) {}

	/** 成功建连后调用：重置尝试计数 */
	reset(): void {
		this.attempts = 0;
	}

	/** 当前尝试次数 */
	getAttempts(): number {
		return this.attempts;
	}

	/** 计划下一次重连 */
	schedule(): void {
		if (this.deps.isStopped()) return;
		if (this.attempts >= MAX_RECONNECT_ATTEMPTS) {
			this.deps.logger.error({
				msg: `feishu websocket 重连次数已达上限 (${MAX_RECONNECT_ATTEMPTS})`,
			});
			this.deps.onGiveUp(`重连失败：已尝试 ${MAX_RECONNECT_ATTEMPTS} 次`);
			return;
		}

		this.attempts++;
		const delay = RECONNECT_DELAY_MS * Math.min(this.attempts, 6);

		this.deps.logger.info({
			msg: `feishu websocket 将在 ${delay}ms 后重连 (第 ${this.attempts} 次)`,
		});

		this.timer = setTimeout(() => {
			this.timer = null;
			if (this.deps.isStopped()) return;
			this.deps.doReconnect();
		}, delay);
	}

	/** 取消未触发的重连定时器 */
	cancel(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}
