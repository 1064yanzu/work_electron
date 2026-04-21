/**
 * Discord Streaming —— 基于 message.edit 的流式
 * 思路：channel.send 发占位；update() 调用 sentMessage.edit(text)。
 * 限制：
 * - Discord 单条消息文本上限 2000 字符
 * - 超过上限则发新消息（分段）
 */

import type { Client, Message } from "discord.js";
import type { Logger } from "../../../logging/types";
import {
	mergeStreamingText,
	type ChannelStreamingSession,
	type ChannelStreamingStartOptions,
} from "../../sdk";

const EDIT_THROTTLE_MS = 400;
const DISCORD_MESSAGE_LIMIT = 1990; // 留 10 字符缓冲

type State = {
	message: Message;
	currentText: string;
};

export class DiscordStreamingSessionImpl implements ChannelStreamingSession {
	private state: State | null = null;
	private closed = false;
	private pendingText: string | null = null;
	private lastEditAt = 0;
	private queue: Promise<void> = Promise.resolve();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly client: Client,
		private readonly channelId: string,
		private readonly replyToMessageId: string | undefined,
		private readonly logger: Logger,
	) {}

	async start(options?: ChannelStreamingStartOptions): Promise<void> {
		if (this.state) return;
		const initial = options?.title
			? `**${options.title}**\n⏳ Thinking…`
			: "⏳ Thinking…";

		const channel = await this.client.channels
			.fetch(this.channelId)
			.catch(() => null);
		if (!channel || !("send" in channel)) {
			throw new Error(
				`discord streaming: channel ${this.channelId} not sendable`,
			);
		}
		const sendable = channel as {
			send: (opts: {
				content: string;
				reply?: { messageReference: string };
			}) => Promise<Message>;
		};
		try {
			const message = await sendable.send({
				content: initial,
				...(this.replyToMessageId
					? { reply: { messageReference: this.replyToMessageId } }
					: {}),
			});
			this.state = {
				message,
				currentText: initial,
			};
		} catch (err) {
			this.logger.warn({
				msg: "discord streaming start failed",
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	}

	private async performEdit(text: string): Promise<void> {
		if (!this.state) return;
		if (text === this.state.currentText) return;
		const truncated =
			text.length > DISCORD_MESSAGE_LIMIT
				? `${text.slice(0, DISCORD_MESSAGE_LIMIT)}\n\n… (_内容超长，已截断_)`
				: text;
		try {
			await this.state.message.edit({ content: truncated });
			this.state.currentText = truncated;
		} catch (err) {
			this.logger.warn({
				msg: "discord streaming edit failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	async update(text: string): Promise<void> {
		if (!this.state || this.closed) return;
		const merged = mergeStreamingText(
			this.pendingText ?? this.state.currentText,
			text,
		);
		if (!merged || merged === this.state.currentText) return;

		const now = Date.now();
		if (now - this.lastEditAt < EDIT_THROTTLE_MS) {
			this.pendingText = merged;
			if (!this.flushTimer) {
				this.flushTimer = setTimeout(() => {
					this.flushTimer = null;
					const pending = this.pendingText;
					this.pendingText = null;
					if (pending) void this.update(pending);
				}, EDIT_THROTTLE_MS);
			}
			return;
		}
		this.pendingText = null;
		this.lastEditAt = now;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.queue = this.queue.then(async () => {
			if (!this.state || this.closed) return;
			await this.performEdit(merged);
		});
		await this.queue;
	}

	async close(finalText?: string, options?: { note?: string }): Promise<void> {
		if (!this.state || this.closed) return;
		this.closed = true;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		await this.queue;
		const accumulated = mergeStreamingText(
			this.state.currentText,
			this.pendingText ?? undefined,
		);
		const body = finalText
			? mergeStreamingText(accumulated, finalText)
			: accumulated;
		const tail = options?.note ? `${body}\n*${options.note}*` : body;
		if (tail && tail !== this.state.currentText) {
			await this.performEdit(tail);
		}
		this.state = null;
		this.pendingText = null;
	}

	isActive(): boolean {
		return this.state !== null && !this.closed;
	}

	getMessageId(): string | undefined {
		return this.state?.message.id;
	}
}

export function createDiscordStreamingFactory(params: {
	client: Client;
	logger: Logger;
	enabled: () => boolean;
}) {
	return {
		isEnabled: params.enabled,
		openSession: (opts: {
			targetId: string;
			threadId?: string;
			replyToMessageId?: string;
		}) =>
			new DiscordStreamingSessionImpl(
				params.client,
				opts.targetId,
				opts.replyToMessageId,
				params.logger,
			),
	};
}
