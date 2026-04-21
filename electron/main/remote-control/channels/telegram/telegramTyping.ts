/**
 * Telegram Typing Indicator —— 基于 sendChatAction("typing")
 * Telegram 的 typing 状态 6 秒超时，需要每 5 秒 ping 一次保持活跃。
 */

import type { Bot } from "grammy";
import type { Logger } from "../../../logging/types";
import type { ChannelTypingSession } from "../../sdk";

const PING_INTERVAL_MS = 5_000;

export class TelegramTypingSessionImpl implements ChannelTypingSession {
	private active = false;
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly bot: Bot,
		private readonly chatId: number | string,
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
		try {
			await this.bot.api.sendChatAction(this.chatId, "typing");
		} catch (err) {
			this.logger.info({
				msg: "telegram typing ping failed (ignored)",
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

export function createTelegramTypingFactory(params: {
	bot: Bot;
	logger: Logger;
	enabled: () => boolean;
}) {
	return {
		isEnabled: params.enabled,
		openSession: (opts: { targetId: string }) => {
			const chatId: number | string = /^-?\d+$/.test(opts.targetId)
				? Number(opts.targetId)
				: opts.targetId;
			return new TelegramTypingSessionImpl(params.bot, chatId, params.logger);
		},
	};
}
