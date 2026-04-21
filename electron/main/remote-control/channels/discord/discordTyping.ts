/**
 * Discord Typing —— 基于 TextChannel#sendTyping()
 * Discord 的 typing 状态 10 秒超时，需要每 8 秒 ping。
 */

import type { Client } from "discord.js";
import type { Logger } from "../../../logging/types";
import type { ChannelTypingSession } from "../../sdk";

const PING_INTERVAL_MS = 8_000;

export class DiscordTypingSessionImpl implements ChannelTypingSession {
	private active = false;
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly client: Client,
		private readonly channelId: string,
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
			const channel = await this.client.channels
				.fetch(this.channelId)
				.catch(() => null);
			if (!channel) return;
			// discord.js 里 TextChannel / DMChannel 有 sendTyping
			const typed = channel as { sendTyping?: () => Promise<void> };
			await typed.sendTyping?.();
		} catch (err) {
			this.logger.info({
				msg: "discord typing ping failed (ignored)",
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

export function createDiscordTypingFactory(params: {
	client: Client;
	logger: Logger;
	enabled: () => boolean;
}) {
	return {
		isEnabled: params.enabled,
		openSession: (opts: { targetId: string }) =>
			new DiscordTypingSessionImpl(params.client, opts.targetId, params.logger),
	};
}
