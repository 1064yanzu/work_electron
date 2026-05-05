/**
 * 飞书出站消息发送器
 *
 * 封装所有发送相关逻辑：
 * - 普通文本（reply / create 双路径）
 * - 卡片（interactive，失败自动降级文本）
 * - 图片（先上传换 image_key 再发送）
 * - 文本+本地图片混合发送
 *
 * 不持有 channel 状态；所有依赖通过构造时注入。
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import * as Lark from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";
import type { RemoteOutboundMessage } from "../../core/types";
import { extractFeishuApiErrorInfo } from "./feishuApiError";
import { extractLocalImagePathsFromText } from "./feishuOutboundImageExtractor";
import { normalizeTargetType, FeishuOutboundRateLimiter } from "./feishuUtils";

function findRequestIdInCardJson(input: string): string | undefined {
	try {
		const parsed = JSON.parse(input);
		const queue: unknown[] = [parsed];
		const visited = new Set<unknown>();
		while (queue.length > 0) {
			const current = queue.shift();
			if (!current || typeof current !== "object") continue;
			if (visited.has(current)) continue;
			visited.add(current);
			if (Array.isArray(current)) {
				for (const item of current) queue.push(item);
				continue;
			}
			const record = current as Record<string, unknown>;
			const requestId = record.requestId;
			if (typeof requestId === "string" && requestId.trim()) {
				return requestId.trim();
			}
			for (const value of Object.values(record)) {
				queue.push(value);
			}
		}
		return undefined;
	} catch {
		return undefined;
	}
}

function buildCardSendFallbackText(cardJson: string): string {
	const requestId = findRequestIdInCardJson(cardJson);
	if (requestId) {
		return [
			"收到交互审批请求（卡片发送失败，已自动降级为文本命令）。",
			`requestId=${requestId}`,
			`/approve ${requestId}`,
			`/reject ${requestId} <reason>`,
		].join("\n");
	}
	return "收到交互审批请求，但卡片发送失败，已降级到文本模式。请发送 /sessions 或 /status 继续操作。";
}

function toStringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export interface FeishuOutboundDeps {
	getClient: () => Lark.Client | null;
	logger: Logger;
	rateLimiter: FeishuOutboundRateLimiter;
	/** 出站文本去重：返回 false 表示重复，应跳过发送 */
	dedupeOutboundText: (targetId: string, text: string) => boolean;
}

export class FeishuOutboundSender {
	constructor(private readonly deps: FeishuOutboundDeps) {}

	private requireClient(): Lark.Client {
		const client = this.deps.getClient();
		if (!client) {
			throw new Error("Feishu channel not initialized");
		}
		return client;
	}

	private async sendRawMessage(
		message: RemoteOutboundMessage,
		msgType: "text" | "interactive" | "image",
		content: string,
	): Promise<void> {
		const client = this.requireClient();
		const receiveIdType = normalizeTargetType(message.target_id);
		if (message.reply_to_message_id) {
			const response = await client.im.message.reply({
				path: { message_id: message.reply_to_message_id },
				data: {
					msg_type: msgType,
					content,
				},
			});
			if (response.code !== 0) {
				const err = new Error(
					response.msg || `Feishu reply failed: ${response.code}`,
				) as Error & { code?: number; msg?: string };
				err.code = response.code;
				err.msg = response.msg;
				throw err;
			}
			return;
		}
		const response = await client.im.message.create({
			params: { receive_id_type: receiveIdType },
			data: {
				receive_id: message.target_id,
				msg_type: msgType,
				content,
			},
		});
		if (response.code !== 0) {
			const err = new Error(
				response.msg || `Feishu send failed: ${response.code}`,
			) as Error & { code?: number; msg?: string };
			err.code = response.code;
			err.msg = response.msg;
			throw err;
		}
	}

	async sendText(message: RemoteOutboundMessage): Promise<void> {
		await this.sendRawMessage(
			message,
			"text",
			JSON.stringify({ text: message.text }),
		);
	}

	async sendCard(message: RemoteOutboundMessage): Promise<void> {
		await this.sendRawMessage(message, "interactive", message.text);
	}

	private async sendImageByKey(
		message: RemoteOutboundMessage,
		imageKey: string,
	): Promise<void> {
		await this.sendRawMessage(
			message,
			"image",
			JSON.stringify({ image_key: imageKey }),
		);
	}

	private async uploadImageAsMessageImage(imagePath: string): Promise<string> {
		const client = this.requireClient();
		const normalized = String(imagePath || "").trim();
		if (!normalized) {
			throw new Error("image path is empty");
		}
		const stat = await fsp.stat(normalized);
		if (!stat.isFile()) {
			throw new Error(`not a file: ${normalized}`);
		}
		const uploadResp = await client.im.image.create({
			data: {
				image_type: "message",
				image: fs.createReadStream(normalized),
			},
		});
		const imageKey = toStringOrEmpty(
			(uploadResp as { image_key?: string } | null)?.image_key ??
				(uploadResp as { data?: { image_key?: string } } | null)?.data
					?.image_key,
		);
		if (!imageKey) {
			throw new Error("upload image success but image_key is empty");
		}
		return imageKey;
	}

	private async sendTextAndLocalImages(
		message: RemoteOutboundMessage,
		text: string,
		imagePaths: string[],
	): Promise<void> {
		const sentImagePaths: string[] = [];
		let firstReplyMessageId = message.reply_to_message_id;

		if (text.trim()) {
			await this.sendText({ ...message, text });
			firstReplyMessageId = undefined;
		}

		for (const imagePath of imagePaths) {
			try {
				const imageKey = await this.uploadImageAsMessageImage(imagePath);
				await this.sendImageByKey(
					{
						...message,
						reply_to_message_id: firstReplyMessageId,
					},
					imageKey,
				);
				firstReplyMessageId = undefined;
				sentImagePaths.push(imagePath);
			} catch (error) {
				this.deps.logger.warn({
					msg: "feishu send local image failed",
					imagePath,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		if (imagePaths.length > 0 && sentImagePaths.length === 0 && !text.trim()) {
			await this.sendText({
				...message,
				text: "图片发送失败：请检查 im:resource 权限、图片大小与格式。",
			});
		}
	}

	/**
	 * 主发送入口：根据 message.use_card 走文本或卡片路径。
	 * 卡片失败自动降级文本；文本会先抽取本地图片后混合发送。
	 */
	async send(message: RemoteOutboundMessage): Promise<void> {
		this.requireClient();

		// 等待限流器放行
		await this.deps.rateLimiter.waitForSlot();
		// 普通消息统一走 text，避免 markdown 卡片语法导致 230099 发送失败。
		// 仅审批等显式 use_card 场景才使用 interactive；失败后自动降级文本。
		if (message.use_card) {
			try {
				await this.sendCard(message);
			} catch (error) {
				const info = extractFeishuApiErrorInfo(error);
				this.deps.logger.warn({
					msg: "feishu interactive card send failed, fallback to text",
					code: info.code,
					error:
						info.msg ||
						info.message ||
						(error instanceof Error ? error.message : String(error)),
				});
				const fallbackText = buildCardSendFallbackText(message.text);
				await this.sendText({
					...message,
					text: fallbackText,
					use_card: false,
				});
			}
			return;
		}

		const { imagePaths, cleanedText } = extractLocalImagePathsFromText(
			message.text,
		);
		const outboundText =
			imagePaths.length > 0 && !cleanedText.trim()
				? "图片结果如下："
				: cleanedText;

		if (imagePaths.length > 0) {
			await this.sendTextAndLocalImages(message, outboundText, imagePaths);
		} else if (outboundText.trim()) {
			if (this.deps.dedupeOutboundText(message.target_id, outboundText)) {
				await this.sendText({ ...message, text: outboundText });
			} else {
				this.deps.logger.info({
					msg: "feishu duplicate outbound text skipped",
					targetId: message.target_id,
					textPreview: outboundText.slice(0, 100),
				});
			}
		}
	}
}
