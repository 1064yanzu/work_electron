/**
 * Slack Streaming —— 基于 chat.update 的流式
 * 思路：先 chat.postMessage 发占位文本（"⏳ Thinking…"），记下 ts+channel；update() 反复 chat.update。
 * 注意：
 * - Slack 对 chat.update 限速较宽松（~50 次/min per workspace），但 per-conversation 建议 throttle 到 500ms
 * - Slack 不支持发送 markdown 块级编辑，但文本本身支持 mrkdwn 语法
 */

import type { App } from "@slack/bolt";
import type { Logger } from "../../../logging/types";
import {
	mergeStreamingText,
	type ChannelStreamingSession,
	type ChannelStreamingStartOptions,
} from "../../sdk";

const EDIT_THROTTLE_MS = 500;

type State = {
	channel: string;
	ts: string;
	currentText: string;
	threadTs?: string;
};

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
		const initial = options?.title
			? `*${options.title}*\n⏳ Thinking…`
			: "⏳ Thinking…";
		try {
			const resp = await this.app.client.chat.postMessage({
				channel: this.channel,
				text: initial,
				mrkdwn: true,
				...(this.threadTs ? { thread_ts: this.threadTs } : {}),
			});
			if (!resp.ts) throw new Error("slack postMessage returned no ts");
			this.state = {
				channel: this.channel,
				ts: resp.ts,
				currentText: initial,
				threadTs: this.threadTs,
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
		try {
			await this.app.client.chat.update({
				channel: this.state.channel,
				ts: this.state.ts,
				text,
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
		this.state = null;
		this.pendingText = null;
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
