/**
 * Slack Typing —— 基于 reactions.add
 * Slack 没有公开的 typing API；我们在用户发来的锚点消息上加一个 hourglass_flowing_sand 表情作为 typing 指示。
 */

import type { App } from "@slack/bolt";
import type { Logger } from "../../../logging/types";
import type { ChannelTypingSession } from "../../sdk";

const TYPING_EMOJI = "hourglass_flowing_sand";

export class SlackTypingSessionImpl implements ChannelTypingSession {
	private active = false;

	constructor(
		private readonly app: App,
		private readonly channel: string,
		private readonly ts: string,
		private readonly logger: Logger,
	) {}

	async start(): Promise<void> {
		if (this.active) return;
		try {
			await this.app.client.reactions.add({
				channel: this.channel,
				timestamp: this.ts,
				name: TYPING_EMOJI,
			});
			this.active = true;
		} catch (err) {
			this.logger.info({
				msg: "slack typing add failed (ignored)",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	async ping(): Promise<void> {
		// reaction 无超时，不需要 ping
	}

	async stop(): Promise<void> {
		if (!this.active) return;
		try {
			await this.app.client.reactions.remove({
				channel: this.channel,
				timestamp: this.ts,
				name: TYPING_EMOJI,
			});
		} catch (err) {
			this.logger.info({
				msg: "slack typing remove failed (ignored)",
				error: err instanceof Error ? err.message : String(err),
			});
		}
		this.active = false;
	}

	isActive(): boolean {
		return this.active;
	}
}

export function createSlackTypingFactory(params: {
	app: App;
	logger: Logger;
	enabled: () => boolean;
}) {
	return {
		isEnabled: params.enabled,
		openSession: (opts: { targetId: string; anchorMessageId?: string }) => {
			if (!opts.anchorMessageId) {
				throw new Error(
					"slack typing requires anchorMessageId (user message ts)",
				);
			}
			return new SlackTypingSessionImpl(
				params.app,
				opts.targetId,
				opts.anchorMessageId,
				params.logger,
			);
		},
	};
}
