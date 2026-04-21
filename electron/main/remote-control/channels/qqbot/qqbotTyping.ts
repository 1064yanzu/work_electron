/**
 * QQ Bot Typing —— 基于 C2C 的 InputNotify（input_notify 协议）
 *
 * QQ 官方 API 的 typing 指示仅在 C2C 私聊可用（msg_type=6 + input_notify）。
 * 协议说明：input_second 指定持续时长，客户端会显示「正在输入」提示。
 *
 * 群 / 频道场景没有 typing 协议，直接 no-op。
 */

import type { Logger } from "../../../logging/types";
import type { ChannelTypingSession } from "../../sdk";
import { sendC2CInputNotify, type QqbotApiCredentials } from "./qqbotApi";
import { decodeTarget } from "./qqbotUtils";

const PING_INTERVAL_MS = 45_000; // 低于 60s 协议上限
const DEFAULT_INPUT_SECOND = 60;

export class QqbotTypingSessionImpl implements ChannelTypingSession {
	private active = false;
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly credentials: QqbotApiCredentials,
		private readonly targetId: string,
		private readonly logger: Logger,
	) {}

	async start(): Promise<void> {
		if (this.active) return;
		this.active = true;
		await this.ping();
		this.timer = setInterval(() => {
			void this.ping();
		}, PING_INTERVAL_MS);
	}

	async ping(): Promise<void> {
		if (!this.active) return;
		const decoded = decodeTarget(this.targetId);
		if (!decoded || decoded.scope !== "c2c") {
			// Non-c2c scopes have no native typing API — stay idle.
			return;
		}
		try {
			await sendC2CInputNotify({
				credentials: this.credentials,
				openid: decoded.id,
				inputSecond: DEFAULT_INPUT_SECOND,
				logger: this.logger,
			});
		} catch (err) {
			this.logger.info({
				msg: "qqbot typing ping failed (ignored)",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	async stop(): Promise<void> {
		this.active = false;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	isActive(): boolean {
		return this.active;
	}
}

export function createQqbotTypingFactory(params: {
	credentials: QqbotApiCredentials;
	logger: Logger;
	enabled: () => boolean;
}) {
	return {
		isEnabled: params.enabled,
		openSession: (opts: { targetId: string }) =>
			new QqbotTypingSessionImpl(
				params.credentials,
				opts.targetId,
				params.logger,
			),
	};
}
