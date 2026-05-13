/**
 * Telegram Streaming —— 基于 editMessageText 的流式输出 + inline_keyboard 按钮
 *
 * 特性：
 * - 占位文本 + 可选 reply_markup (InlineKeyboardMarkup)
 * - update() 调用 editMessageText（带 reply_markup 保留按钮）
 * - updateShortcuts() 通过 editMessageReplyMarkup 单独更新按钮
 * - format=ansi 时把内容包成 ``` codeblock（Telegram 不渲染 ANSI 但等宽显示）
 *
 * 限制：
 * - Telegram 对 editMessageText ~100 次/min，throttle 700ms
 * - inline_keyboard 一行最多 8 个按钮，按钮文字 ≤ 64 字符
 * - callback_data ≤ 64 字节
 */

import type { Bot } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import type { Logger } from "../../../logging/types";
import {
	mergeStreamingText,
	type ChannelStreamingSession,
	type ChannelStreamingStartOptions,
	type TerminalShortcutAction,
} from "../../sdk";

const EDIT_THROTTLE_MS = 700;
const FINAL_NOTE_PREFIX = "\n\n— ";
const MAX_BUTTONS_PER_ROW = 4;
const MAX_ROWS = 8;
const MAX_CALLBACK_LEN = 64;

type State = {
	messageId: number;
	chatId: number | string;
	currentText: string;
	currentShortcuts: TerminalShortcutAction[];
	format: "plain" | "ansi" | "markdown";
	sequence: number;
};

function encodeCallback(action: TerminalShortcutAction, index: number): string {
	let raw: string;
	switch (action.kind) {
		case "key":
			raw = `pty:${index}:key:${action.key}`;
			break;
		case "stop":
			raw = `pty:${index}:stop`;
			break;
		case "text":
			raw = `pty:${index}:text:${action.text}`;
			break;
		case "scroll": {
			const amt = action.amount ? `:${action.amount}` : "";
			raw = `pty:${index}:scroll:${action.dir}${amt}`;
			break;
		}
		case "more":
			raw = `pty:${index}:more`;
			break;
		case "confirm":
			raw = `pty:${index}:confirm`;
			break;
		case "cancel":
			raw = `pty:${index}:cancel`;
			break;
	}
	// callback_data 必须 ≤ 64 字节
	return raw.length > MAX_CALLBACK_LEN ? raw.slice(0, MAX_CALLBACK_LEN) : raw;
}

function buildInlineKeyboard(
	shortcuts: TerminalShortcutAction[],
): InlineKeyboardMarkup | undefined {
	if (!shortcuts || shortcuts.length === 0) return undefined;
	const limited = shortcuts.slice(0, MAX_BUTTONS_PER_ROW * MAX_ROWS);
	const rows: { text: string; callback_data: string }[][] = [];
	for (let i = 0; i < limited.length; i += MAX_BUTTONS_PER_ROW) {
		const slice = limited.slice(i, i + MAX_BUTTONS_PER_ROW);
		const row = slice.map((action, j) => ({
			text: action.label.slice(0, 64),
			callback_data: encodeCallback(action, i + j),
		}));
		rows.push(row);
	}
	return { inline_keyboard: rows };
}

function wrapContent(
	text: string,
	format: "plain" | "ansi" | "markdown",
): { text: string; parseMode: "Markdown" | undefined } {
	if (format === "ansi") {
		// Telegram 不渲染 ANSI 序列；用 pre block 让其等宽展示
		return { text: `\`\`\`\n${text}\n\`\`\``, parseMode: "Markdown" };
	}
	if (format === "markdown") {
		return { text, parseMode: "Markdown" };
	}
	return { text, parseMode: "Markdown" };
}

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
		const format = options?.format ?? "markdown";
		const heading = options?.title ? `**${options.title}**\n\n` : "";
		const placeholder = `${heading}⏳ Thinking…`;
		const shortcuts = options?.terminalShortcuts ?? [];
		const replyMarkup = buildInlineKeyboard(shortcuts);

		try {
			const sent = await this.bot.api.sendMessage(this.chatId, placeholder, {
				parse_mode: "Markdown",
				...(replyMarkup ? { reply_markup: replyMarkup } : {}),
				...(this.replyToMessageId
					? { reply_parameters: { message_id: this.replyToMessageId } }
					: {}),
			});
			this.state = {
				messageId: sent.message_id,
				chatId: this.chatId,
				currentText: placeholder,
				currentShortcuts: shortcuts,
				format,
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
		const { text: body, parseMode } = wrapContent(text, this.state.format);
		const replyMarkup = buildInlineKeyboard(this.state.currentShortcuts);
		try {
			await this.bot.api.editMessageText(
				this.state.chatId,
				this.state.messageId,
				body,
				{
					...(parseMode ? { parse_mode: parseMode } : {}),
					...(replyMarkup ? { reply_markup: replyMarkup } : {}),
				},
			);
			this.state.currentText = text;
			this.state.sequence += 1;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("can't parse entities")) {
				// Markdown 失败，去掉 parse_mode 再试
				try {
					await this.bot.api.editMessageText(
						this.state.chatId,
						this.state.messageId,
						body,
						{
							...(replyMarkup ? { reply_markup: replyMarkup } : {}),
						},
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
		// 关闭时移除按钮
		try {
			await this.bot.api.editMessageReplyMarkup(
				this.state.chatId,
				this.state.messageId,
				{ reply_markup: { inline_keyboard: [] } },
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!msg.includes("message is not modified")) {
				this.logger.warn({
					msg: "telegram streaming close strip keyboard failed",
					error: msg,
				});
			}
		}
		this.state = null;
		this.pendingText = null;
	}

	async updateShortcuts(shortcuts: TerminalShortcutAction[]): Promise<void> {
		if (!this.state || this.closed) return;
		this.state.currentShortcuts = shortcuts;
		const replyMarkup = buildInlineKeyboard(shortcuts);
		try {
			await this.bot.api.editMessageReplyMarkup(
				this.state.chatId,
				this.state.messageId,
				{
					reply_markup: replyMarkup ?? { inline_keyboard: [] },
				},
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!msg.includes("message is not modified")) {
				this.logger.warn({
					msg: "telegram streaming updateShortcuts failed",
					error: msg,
				});
			}
		}
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
