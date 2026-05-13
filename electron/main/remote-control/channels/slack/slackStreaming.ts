/**
 * Slack Streaming —— 基于 chat.update 的流式 + Block Kit Actions
 *
 * 特性：
 * - chat.postMessage 发占位文本 + 可选 ButtonGroup blocks
 * - update() 反复 chat.update，每次都带上 blocks
 * - terminalShortcuts → blocks[]，由 handleBlockActions 反射回 /cli
 * - format=ansi 包成 mrkdwn codeblock（Slack 不直接渲染 ANSI 但 codeblock 等宽显示）
 *
 * 限制：
 * - chat.update 限速宽松（~50/min），per-conversation throttle 500ms
 * - blocks 数 ≤ 50，每个 actions block 内 elements ≤ 25，整体加在一起最稳是 ≤ 25 个按钮
 */

import type { App } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import type { Logger } from "../../../logging/types";
import {
	mergeStreamingText,
	type ChannelStreamingSession,
	type ChannelStreamingStartOptions,
	type TerminalShortcutAction,
} from "../../sdk";

const EDIT_THROTTLE_MS = 500;
const MAX_BUTTONS_PER_ROW = 5;
const MAX_ROWS = 5;
const MAX_ACTION_ID_LEN = 255;

type State = {
	channel: string;
	ts: string;
	currentText: string;
	currentShortcuts: TerminalShortcutAction[];
	threadTs?: string;
	format: "plain" | "ansi" | "markdown";
};

function encodeActionId(action: TerminalShortcutAction, index: number): string {
	switch (action.kind) {
		case "key":
			return `pty:${index}:key:${action.key}`.slice(0, MAX_ACTION_ID_LEN);
		case "stop":
			return `pty:${index}:stop`;
		case "text":
			return `pty:${index}:text:${action.text}`.slice(0, MAX_ACTION_ID_LEN);
		case "scroll": {
			const amt = action.amount ? `:${action.amount}` : "";
			return `pty:${index}:scroll:${action.dir}${amt}`.slice(
				0,
				MAX_ACTION_ID_LEN,
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

function styleToSlackStyle(
	style: TerminalShortcutAction["style"],
): "primary" | "danger" | undefined {
	if (style === "danger") return "danger";
	if (style === "primary") return "primary";
	return undefined;
}

function buildShortcutBlocks(
	shortcuts: TerminalShortcutAction[],
): KnownBlock[] {
	if (!shortcuts || shortcuts.length === 0) return [];
	const limited = shortcuts.slice(0, MAX_BUTTONS_PER_ROW * MAX_ROWS);
	const blocks: KnownBlock[] = [];
	for (let i = 0; i < limited.length; i += MAX_BUTTONS_PER_ROW) {
		const slice = limited.slice(i, i + MAX_BUTTONS_PER_ROW);
		const elements = slice.map((action, j) => {
			const slackStyle = styleToSlackStyle(action.style);
			const element: {
				type: "button";
				action_id: string;
				text: { type: "plain_text"; text: string };
				style?: "primary" | "danger";
			} = {
				type: "button",
				action_id: encodeActionId(action, i + j),
				text: { type: "plain_text", text: action.label.slice(0, 75) },
			};
			if (slackStyle) element.style = slackStyle;
			return element;
		});
		blocks.push({
			type: "actions",
			elements,
		} as KnownBlock);
	}
	return blocks;
}

function wrapContent(
	text: string,
	format: "plain" | "ansi" | "markdown",
): string {
	if (format !== "ansi") return text;
	// Slack 不解析 ANSI 序列；包成 codeblock 至少保证等宽对齐
	return `\`\`\`\n${text}\n\`\`\``;
}

function buildTextBlock(text: string): KnownBlock {
	// Slack mrkdwn section 限制 3000 字符
	const truncated =
		text.length > 2950
			? `${text.slice(0, 2950)}\n\n… (_内容超长，已截断_)`
			: text;
	return {
		type: "section",
		text: { type: "mrkdwn", text: truncated },
	} as KnownBlock;
}

export class SlackStreamingSessionImpl implements ChannelStreamingSession {
	private state: State | null = null;
	private closed = false;
	private pendingText: string | null = null;
	private lastEditAt = 0;
	private queue: Promise<void> = Promise.resolve();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly app: App,
		private readonly channel: string,
		private readonly threadTs: string | undefined,
		private readonly logger: Logger,
	) {}

	async start(options?: ChannelStreamingStartOptions): Promise<void> {
		if (this.state) return;
		const format = options?.format ?? "plain";
		const heading = options?.title ? `*${options.title}*\n` : "";
		const placeholder = `${heading}⏳ Thinking…`;
		const shortcuts = options?.terminalShortcuts ?? [];
		const blocks: KnownBlock[] = [
			buildTextBlock(wrapContent(placeholder, format)),
			...buildShortcutBlocks(shortcuts),
		];

		try {
			const resp = await this.app.client.chat.postMessage({
				channel: this.channel,
				text: placeholder, // 回退 fallback
				mrkdwn: true,
				blocks,
				...(this.threadTs ? { thread_ts: this.threadTs } : {}),
			});
			if (!resp.ts) throw new Error("slack postMessage returned no ts");
			this.state = {
				channel: this.channel,
				ts: resp.ts,
				currentText: placeholder,
				currentShortcuts: shortcuts,
				threadTs: this.threadTs,
				format,
			};
		} catch (err) {
			this.logger.warn({
				msg: "slack streaming start failed",
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	}

	private async performUpdate(text: string): Promise<void> {
		if (!this.state) return;
		if (text === this.state.currentText) return;
		const wrapped = wrapContent(text, this.state.format);
		const blocks: KnownBlock[] = [
			buildTextBlock(wrapped),
			...buildShortcutBlocks(this.state.currentShortcuts),
		];
		try {
			await this.app.client.chat.update({
				channel: this.state.channel,
				ts: this.state.ts,
				text: wrapped,
				blocks,
			});
			this.state.currentText = text;
		} catch (err) {
			this.logger.warn({
				msg: "slack streaming update failed",
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
			await this.performUpdate(merged);
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
		const tail = options?.note ? `${body}\n_${options.note}_` : body;
		if (tail && tail !== this.state.currentText) {
			await this.performUpdate(tail);
		}
		// 结束时把 actions blocks 拆掉
		try {
			const wrapped = wrapContent(tail, this.state.format);
			await this.app.client.chat.update({
				channel: this.state.channel,
				ts: this.state.ts,
				text: wrapped,
				blocks: [buildTextBlock(wrapped)],
			});
		} catch (err) {
			this.logger.warn({
				msg: "slack streaming close strip blocks failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
		this.state = null;
		this.pendingText = null;
	}

	async updateShortcuts(shortcuts: TerminalShortcutAction[]): Promise<void> {
		if (!this.state || this.closed) return;
		this.state.currentShortcuts = shortcuts;
		const wrapped = wrapContent(this.state.currentText, this.state.format);
		const blocks: KnownBlock[] = [
			buildTextBlock(wrapped),
			...buildShortcutBlocks(shortcuts),
		];
		try {
			await this.app.client.chat.update({
				channel: this.state.channel,
				ts: this.state.ts,
				text: wrapped,
				blocks,
			});
		} catch (err) {
			this.logger.warn({
				msg: "slack streaming updateShortcuts failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	isActive(): boolean {
		return this.state !== null && !this.closed;
	}

	getMessageId(): string | undefined {
		return this.state?.ts;
	}
}

export function createSlackStreamingFactory(params: {
	app: App;
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
			new SlackStreamingSessionImpl(
				params.app,
				opts.targetId,
				opts.threadId ?? opts.replyToMessageId,
				params.logger,
			),
	};
}
