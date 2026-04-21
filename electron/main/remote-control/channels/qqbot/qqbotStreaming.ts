/**
 * QQ Bot Streaming —— 基于 PATCH /messages/{id} 的文本编辑流式
 *
 * - 官方 API 支持编辑 C2C / Group / Channel / DM 消息；实现参考 qqbotApi.editMessage
 * - QQ 编辑频率限制比较保守，这里统一 throttle 到 500ms
 * - 单条消息文本上限 4000 字符，超过时截断并附尾部提示
 */

import type { Logger } from "../../../logging/types";
import {
	mergeStreamingText,
	type ChannelStreamingSession,
	type ChannelStreamingStartOptions,
} from "../../sdk";
import {
	editMessage,
	sendC2CMessage,
	sendGroupMessage,
	sendChannelMessage,
	sendDmMessage,
	type QqbotApiCredentials,
	type QqbotMessageResponse,
} from "./qqbotApi";
import { decodeTarget, type QqbotTargetScope } from "./qqbotUtils";

const EDIT_THROTTLE_MS = 500;
const QQBOT_TEXT_LIMIT = 3800;

type State = {
	scope: QqbotTargetScope;
	targetId: string;
	messageId: string;
	replyToMessageId?: string;
	currentText: string;
};

export class QqbotStreamingSessionImpl implements ChannelStreamingSession {
	private state: State | null = null;
	private closed = false;
	private pendingText: string | null = null;
	private lastEditAt = 0;
	private queue: Promise<void> = Promise.resolve();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly credentials: QqbotApiCredentials,
		private readonly targetId: string,
		private readonly replyToMessageId: string | undefined,
		private readonly logger: Logger,
	) {}

	async start(options?: ChannelStreamingStartOptions): Promise<void> {
		if (this.state) return;
		const initial = options?.title
			? `${options.title}\n⏳ 生成中…`
			: "⏳ 生成中…";
		const decoded = decodeTarget(this.targetId);
		if (!decoded) {
			throw new Error(`qqbot streaming: invalid target ${this.targetId}`);
		}
		const res = await this.sendInitial(decoded.scope, decoded.id, initial);
		if (!res?.id) {
			throw new Error("qqbot streaming: initial message has no id");
		}
		this.state = {
			scope: decoded.scope,
			targetId: decoded.id,
			messageId: res.id,
			replyToMessageId: this.replyToMessageId,
			currentText: initial,
		};
	}

	private async sendInitial(
		scope: QqbotTargetScope,
		id: string,
		content: string,
	): Promise<QqbotMessageResponse> {
		switch (scope) {
			case "c2c":
				return sendC2CMessage({
					credentials: this.credentials,
					openid: id,
					content,
					messageReference: this.replyToMessageId,
					logger: this.logger,
				});
			case "group":
				return sendGroupMessage({
					credentials: this.credentials,
					groupOpenid: id,
					content,
					messageReference: this.replyToMessageId,
					logger: this.logger,
				});
			case "channel":
				return sendChannelMessage({
					credentials: this.credentials,
					channelId: id,
					content,
					logger: this.logger,
				});
			case "dm":
				return sendDmMessage({
					credentials: this.credentials,
					guildId: id,
					content,
					logger: this.logger,
				});
		}
	}

	private async performEdit(text: string): Promise<void> {
		if (!this.state) return;
		if (text === this.state.currentText) return;
		const truncated =
			text.length > QQBOT_TEXT_LIMIT
				? `${text.slice(0, QQBOT_TEXT_LIMIT)}\n\n… (内容超长，已截断)`
				: text;
		try {
			await editMessage({
				credentials: this.credentials,
				scope: this.state.scope,
				targetId: this.state.targetId,
				messageId: this.state.messageId,
				content: truncated,
				logger: this.logger,
			});
			this.state.currentText = truncated;
		} catch (err) {
			this.logger.warn({
				msg: "qqbot streaming edit failed",
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
		const tail = options?.note ? `${body}\n_${options.note}_` : body;
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
		return this.state?.messageId;
	}
}

export function createQqbotStreamingFactory(params: {
	credentials: QqbotApiCredentials;
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
			new QqbotStreamingSessionImpl(
				params.credentials,
				opts.targetId,
				opts.replyToMessageId,
				params.logger,
			),
	};
}
