/**
 * Telegram Streaming —— 基于 editMessageText 的流式输出
 *
 * 思路：首次 send 发送占位文本，拿到 message_id；后续 update() 调用 editMessageText。
 * 注意事项：
 * - Telegram 对 editMessageText 的限流约为 30 次/秒且总 100 次/分钟，需要 throttle
 * - 同样的 text 不能连续 edit（会返回 `message is not modified`），需跳过
 */

import type { Bot } from "grammy";
import type { Logger } from "../../../logging/types";
import {
	mergeStreamingText,
	type ChannelStreamingSession,
	type ChannelStreamingStartOptions,
} from "../../sdk";

const EDIT_THROTTLE_MS = 700; // 约每秒 1.4 次，留出余量；实际限速 100/min
const FINAL_NOTE_PREFIX = "\n\n— ";

type State = {
	messageId: number;
	chatId: number | string;
	currentText: string;
	sequence: number;
};

export class TelegramStreamingSessionImpl implements ChannelStreamingSession {
	private state: State | null = null;
	private closed = false;
	private queue: Promise<void> = Promise.resolve();
	private pendingText: string | null = null;
	private lastEditAt = 0;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly bot: Bot,
		private readonly chatId: number | string,
		private readonly replyToMessageId: number | undefined,
		private readonly logger: Logger,
	) {}

	async start(options?: ChannelStreamingStartOptions): Promise<void> {
		if (this.state) return;
		const initial = options?.title
			? `**${options.title}**\n\n⏳ Thinking…`
			: "⏳ Thinking…";
		try {
			const sent = await this.bot.api.sendMessage(this.chatId, initial, {
				parse_mode: "Markdown",
				...(this.replyToMessageId
					? {
							reply_parameters: { message_id: this.replyToMessageId },
						}
					: {}),
			});
			this.state = {
				messageId: sent.message_id,
				chatId: this.chatId,
				currentText: initial,
				sequence: 0,
			};
		} catch (err) {
			this.logger.warn({
				msg: "telegram streaming start failed",
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	}

	private async performEdit(text: string): Promise<void> {
		if (!this.state) return;
		if (text === this.state.currentText) return;
		try {
			await this.bot.api.editMessageText(
				this.state.chatId,
				this.state.messageId,
				text,
				{ parse_mode: "Markdown" },
			);
			this.state.currentText = text;
			this.state.sequence += 1;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// 尝试不带 Markdown 再发一次
			if (msg.includes("can't parse entities")) {
				try {
					await this.bot.api.editMessageText(
						this.state.chatId,
						this.state.messageId,
						text,
					);
					this.state.currentText = text;
					this.state.sequence += 1;
					return;
				} catch (err2) {
					this.logger.warn({
						msg: "telegram streaming edit retry (no markdown) failed",
						error: err2 instanceof Error ? err2.message : String(err2),
					});
				}
			}
			// message is not modified —— 静默
			if (!msg.includes("message is not modified")) {
				this.logger.warn({
					msg: "telegram streaming edit failed",
					error: msg,
				});
			}
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
					if (pending) {
						void this.update(pending);
					}
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
		const merged = finalText
			? mergeStreamingText(accumulated, finalText)
			: accumulated;
		const tail = options?.note
			? `${merged}${FINAL_NOTE_PREFIX}${options.note}`
			: merged;
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
		return this.state ? String(this.state.messageId) : undefined;
	}
}

export function createTelegramStreamingFactory(params: {
	bot: Bot;
	logger: Logger;
	enabled: () => boolean;
}) {
	return {
		isEnabled: params.enabled,
		openSession: (opts: {
			targetId: string;
			threadId?: string;
			replyToMessageId?: string;
		}) => {
			const chatId: number | string = /^-?\d+$/.test(opts.targetId)
				? Number(opts.targetId)
				: opts.targetId;
			const replyMsgId = opts.replyToMessageId
				? Number(opts.replyToMessageId)
				: undefined;
			return new TelegramStreamingSessionImpl(
				params.bot,
				chatId,
				Number.isFinite(replyMsgId) ? (replyMsgId as number) : undefined,
				params.logger,
			);
		},
	};
}
