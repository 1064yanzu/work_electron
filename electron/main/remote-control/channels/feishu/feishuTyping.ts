/**
 * 飞书 Typing Indicator —— 用 message reaction "Typing" emoji 实现
 * 移植自：openclaw-main/extensions/feishu/src/typing.ts
 *
 * 调整：
 * - 去掉 openclaw 的 runtime-api 依赖
 * - 日志走 Logger
 * - 与 ChannelTypingSession 接口对齐
 */

import type { Client } from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";
import type { ChannelTypingSession } from "../../sdk";

// 飞书 emoji 类型，用于 typing 指示。
// 参考：https://open.feishu.cn/document/server-docs/im-v1/message-reaction/emojis-introduce
const TYPING_EMOJI = "Typing";

/**
 * 飞书 API 触发 backoff 的错误码：
 * - 99991400: rate limit（每秒太多请求）
 * - 99991403: 月配额超限
 * - 429: 标准 HTTP 429
 */
const FEISHU_BACKOFF_CODES = new Set([99991400, 99991403, 429]);

export class FeishuBackoffError extends Error {
	constructor(public readonly code: number) {
		super(`feishu api backoff: code ${code}`);
		this.name = "FeishuBackoffError";
	}
}

function isFeishuBackoffError(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const response = (
		err as { response?: { status?: number; data?: { code?: number } } }
	).response;
	if (response) {
		if (response.status === 429) return true;
		if (
			typeof response.data?.code === "number" &&
			FEISHU_BACKOFF_CODES.has(response.data.code)
		) {
			return true;
		}
	}
	const code = (err as { code?: number }).code;
	if (typeof code === "number" && FEISHU_BACKOFF_CODES.has(code)) return true;
	return false;
}

function extractBackoffCode(response: unknown): number | undefined {
	if (typeof response !== "object" || response === null) return undefined;
	const code = (response as { code?: number }).code;
	if (typeof code === "number" && FEISHU_BACKOFF_CODES.has(code)) return code;
	return undefined;
}

// ─── Session 实现 ─────────────────────────────────────

export class FeishuTypingSessionImpl implements ChannelTypingSession {
	private reactionId: string | null = null;
	private active = false;
	private backoffTripped = false;

	constructor(
		private readonly client: Client,
		private readonly anchorMessageId: string,
		private readonly logger: Logger,
	) {}

	async start(): Promise<void> {
		if (this.active || this.backoffTripped) return;
		try {
			const response = await this.client.im.messageReaction.create({
				path: { message_id: this.anchorMessageId },
				data: { reaction_type: { emoji_type: TYPING_EMOJI } },
			});
			const backoffCode = extractBackoffCode(response);
			if (backoffCode !== undefined) {
				this.backoffTripped = true;
				this.logger.warn({
					msg: "feishu typing backoff detected, stopping keepalive",
					code: backoffCode,
				});
				throw new FeishuBackoffError(backoffCode);
			}
			this.reactionId =
				(response as unknown as { data?: { reaction_id?: string } }).data
					?.reaction_id ?? null;
			this.active = true;
		} catch (err) {
			if (isFeishuBackoffError(err)) {
				this.backoffTripped = true;
				this.logger.warn({
					msg: "feishu typing backoff, stopping keepalive",
					error: err instanceof Error ? err.message : String(err),
				});
				return;
			}
			// 非关键错误静默处理
			this.logger.info({
				msg: "feishu typing start failed (ignored)",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	async ping(): Promise<void> {
		// 飞书 reaction 没有 timeout，不需要 ping
	}

	async stop(): Promise<void> {
		if (!this.active || !this.reactionId || this.backoffTripped) {
			this.active = false;
			this.reactionId = null;
			return;
		}
		try {
			await this.client.im.messageReaction.delete({
				path: {
					message_id: this.anchorMessageId,
					reaction_id: this.reactionId,
				},
			});
		} catch (err) {
			if (isFeishuBackoffError(err)) {
				this.logger.warn({ msg: "feishu typing remove backoff" });
			} else {
				this.logger.info({
					msg: "feishu typing remove failed (ignored)",
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
		this.active = false;
		this.reactionId = null;
	}

	isActive(): boolean {
		return this.active;
	}
}

export function createFeishuTypingFactory(params: {
	client: Client;
	logger: Logger;
	enabled: () => boolean;
}) {
	return {
		isEnabled: params.enabled,
		openSession: (opts: { targetId: string; anchorMessageId?: string }) => {
			// 飞书 typing 必须挂在一条具体消息上
			if (!opts.anchorMessageId) {
				throw new Error(
					"feishu typing requires anchorMessageId (user message id)",
				);
			}
			return new FeishuTypingSessionImpl(
				params.client,
				opts.anchorMessageId,
				params.logger,
			);
		},
	};
}
