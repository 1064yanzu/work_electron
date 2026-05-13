/**
 * Discord Streaming —— 基于 message.edit 的流式 + ActionRow Button + ANSI codeblock
 *
 * 特性：
 * - channel.send 发占位；update() 调用 sentMessage.edit(text + components)
 * - terminalShortcuts 渲染为 ActionRow + Button，并通过 interactionCreate
 *   触发 customId 回流，由 channel 反射回 onInboundMessage
 * - format=ansi 自动包成 ```​ansi codeblock，让 Discord 渲染 ANSI SGR
 * - update/close 都重发 components，避免按钮在切到下一帧后丢失
 *
 * 限制：
 * - Discord 单条消息文本上限 2000 字符
 * - 一行最多 5 个按钮，最多 5 行（25 个）
 * - customId 必须 ≤ 100 字符
 */

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type Client,
	type Message,
} from "discord.js";
import type { Logger } from "../../../logging/types";
import {
	mergeStreamingText,
	type ChannelStreamingSession,
	type ChannelStreamingStartOptions,
	type TerminalShortcutAction,
} from "../../sdk";

const EDIT_THROTTLE_MS = 400;
const DISCORD_MESSAGE_LIMIT = 1990; // 留 10 字符缓冲
const MAX_BUTTONS_PER_ROW = 5;
const MAX_ROWS = 5;
const MAX_CUSTOM_ID_LEN = 100;

type State = {
	message: Message;
	currentText: string;
	currentShortcuts: TerminalShortcutAction[];
	format: "plain" | "ansi" | "markdown";
};

function styleToButtonStyle(
	style: TerminalShortcutAction["style"],
): ButtonStyle {
	if (style === "danger") return ButtonStyle.Danger;
	if (style === "secondary") return ButtonStyle.Secondary;
	return ButtonStyle.Primary;
}

function encodeCustomId(action: TerminalShortcutAction, index: number): string {
	// customId 编码：pty:<idx>:<kind>[:payload]
	// 解析时由 discordChannel.handleButtonInteraction 反向走回 PtyBridge
	switch (action.kind) {
		case "key":
			return `pty:${index}:key:${action.key}`.slice(0, MAX_CUSTOM_ID_LEN);
		case "stop":
			return `pty:${index}:stop`;
		case "text":
			// Discord customId 限制 100 字符，text 太长就截断
			return `pty:${index}:text:${action.text}`.slice(0, MAX_CUSTOM_ID_LEN);
		case "scroll": {
			const amt = action.amount ? `:${action.amount}` : "";
			return `pty:${index}:scroll:${action.dir}${amt}`.slice(
				0,
				MAX_CUSTOM_ID_LEN,
			);
		}
		case "more":
			return `pty:${index}:more`;
		case "confirm":
			return `pty:${index}:confirm`;
		case "cancel":
			return `pty:${index}:cancel`;
	}
}

function buildShortcutComponents(
	shortcuts: TerminalShortcutAction[],
): ActionRowBuilder<ButtonBuilder>[] {
	if (!shortcuts || shortcuts.length === 0) return [];
	const limited = shortcuts.slice(0, MAX_BUTTONS_PER_ROW * MAX_ROWS);
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < limited.length; i += MAX_BUTTONS_PER_ROW) {
		const slice = limited.slice(i, i + MAX_BUTTONS_PER_ROW);
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (let j = 0; j < slice.length; j++) {
			const action = slice[j];
			const button = new ButtonBuilder()
				.setCustomId(encodeCustomId(action, i + j))
				.setLabel(action.label.slice(0, 80))
				.setStyle(styleToButtonStyle(action.style));
			row.addComponents(button);
		}
		rows.push(row);
	}
	return rows;
}

/**
 * 把内容按 format 包装：
 * - ansi   → 用 ```​ansi codeblock 包起来，让 Discord 渲染 ANSI SGR
 * - 其它   → 原样
 *
 * codeblock 不能嵌套含 ``` 的内容，否则会破坏。这里粗暴 replace 三个反引号
 * 为转义形式（虽然不完美但避免崩）。
 */
function wrapContent(
	text: string,
	format: "plain" | "ansi" | "markdown",
): string {
	if (format !== "ansi") return text;
	const safe = text.replace(/```/g, "``​`");
	return `\`\`\`ansi\n${safe}\n\`\`\``;
}

function truncate(text: string): string {
	if (text.length <= DISCORD_MESSAGE_LIMIT) return text;
	return `${text.slice(0, DISCORD_MESSAGE_LIMIT)}\n\n… (_内容超长，已截断_)`;
}

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
		const format = options?.format ?? "plain";
		const heading = options?.title ? `**${options.title}**\n` : "";
		const placeholder = `${heading}⏳ Thinking…`;
		const shortcuts = options?.terminalShortcuts ?? [];

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
				components?: ActionRowBuilder<ButtonBuilder>[];
				reply?: { messageReference: string };
			}) => Promise<Message>;
		};
		try {
			const message = await sendable.send({
				content: placeholder,
				components: buildShortcutComponents(shortcuts),
				...(this.replyToMessageId
					? { reply: { messageReference: this.replyToMessageId } }
					: {}),
			});
			this.state = {
				message,
				currentText: placeholder,
				currentShortcuts: shortcuts,
				format,
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
		const wrapped = truncate(wrapContent(text, this.state.format));
		try {
			await this.state.message.edit({
				content: wrapped,
				components: buildShortcutComponents(this.state.currentShortcuts),
			});
			this.state.currentText = text;
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
		// 关闭时把按钮清空，避免之后还能点
		try {
			await this.state.message.edit({
				content: truncate(wrapContent(tail, this.state.format)),
				components: [],
			});
		} catch (err) {
			this.logger.warn({
				msg: "discord streaming close strip components failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
		this.state = null;
		this.pendingText = null;
	}

	async updateShortcuts(shortcuts: TerminalShortcutAction[]): Promise<void> {
		if (!this.state || this.closed) return;
		this.state.currentShortcuts = shortcuts;
		try {
			await this.state.message.edit({
				content: truncate(
					wrapContent(this.state.currentText, this.state.format),
				),
				components: buildShortcutComponents(shortcuts),
			});
		} catch (err) {
			this.logger.warn({
				msg: "discord streaming updateShortcuts failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
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
