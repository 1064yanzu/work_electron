/**
 * 飞书消息动作集合（reactions / pin / edit）
 * 参考：openclaw-main/extensions/feishu/src/{reactions,pins,send}.ts
 *
 * 每个动作都封装为独立方法，供 ChannelActions 组合调用。
 */

import type { Client } from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";
import type { ChannelActions, ChannelOutboundMessage } from "../../sdk";
import { ChannelActionUnsupportedError } from "../../sdk";

export function createFeishuActions(params: {
	client: Client;
	sendTextLegacy: (message: ChannelOutboundMessage) => Promise<void>;
	sendCardLegacy: (message: ChannelOutboundMessage) => Promise<void>;
	logger: Logger;
}): ChannelActions {
	const { client, sendTextLegacy, sendCardLegacy, logger } = params;

	return {
		send: async (message) => {
			if (message.kind === "card" && message.cardJson) {
				await sendCardLegacy(message);
			} else if (message.kind === "edit" && message.editTargetMessageId) {
				if (!message.text && !message.cardJson) {
					throw new Error("edit requires text or cardJson");
				}
				const content =
					message.cardJson ?? JSON.stringify({ text: message.text ?? "" });
				try {
					await client.im.message.update({
						path: { message_id: message.editTargetMessageId },
						data: {
							content,
							msg_type: message.cardJson ? "interactive" : "text",
						} as unknown as { content: string; msg_type: string },
					});
				} catch (err) {
					logger.warn({
						msg: "feishu edit failed",
						error: err instanceof Error ? err.message : String(err),
					});
					throw err;
				}
			} else {
				await sendTextLegacy(message);
			}
			return {};
		},

		edit: async (params) => {
			const content =
				params.cardJson ?? JSON.stringify({ text: params.text ?? "" });
			try {
				await client.im.message.update({
					path: { message_id: params.messageId },
					data: {
						content,
						msg_type: params.cardJson ? "interactive" : "text",
					} as unknown as { content: string; msg_type: string },
				});
			} catch (err) {
				logger.warn({
					msg: "feishu action edit failed",
					error: err instanceof Error ? err.message : String(err),
				});
				throw err;
			}
		},

		delete: async (params) => {
			try {
				await client.im.message.delete({
					path: { message_id: params.messageId },
				});
			} catch (err) {
				logger.warn({
					msg: "feishu action delete failed",
					error: err instanceof Error ? err.message : String(err),
				});
				throw err;
			}
		},

		react: async (params) => {
			try {
				const response = await client.im.messageReaction.create({
					path: { message_id: params.messageId },
					data: { reaction_type: { emoji_type: params.emoji } },
				});
				const reactionId = (
					response as unknown as { data?: { reaction_id?: string } }
				).data?.reaction_id;
				return { reactionId };
			} catch (err) {
				logger.warn({
					msg: "feishu action react failed",
					error: err instanceof Error ? err.message : String(err),
				});
				throw err;
			}
		},

		unreact: async (params) => {
			try {
				// Feishu 的删除需要 reactionId；如果传入 emoji，我们先 list 再找到
				let reactionId = params.emojiOrReactionId;
				// 判断是否可能是 reaction_id（包含短横线或很长，反之像 emoji）
				if (reactionId.length < 20 && !reactionId.includes("-")) {
					const list = await client.im.messageReaction.list({
						path: { message_id: params.messageId },
						params: {
							reaction_type: reactionId,
							page_size: 50,
						} as unknown as { reaction_type: string; page_size: number },
					});
					const items =
						(
							list as unknown as {
								data?: { items?: Array<{ reaction_id?: string }> };
							}
						).data?.items ?? [];
					const first = items[0]?.reaction_id;
					if (!first) return;
					reactionId = first;
				}
				await client.im.messageReaction.delete({
					path: {
						message_id: params.messageId,
						reaction_id: reactionId,
					},
				});
			} catch (err) {
				logger.warn({
					msg: "feishu action unreact failed",
					error: err instanceof Error ? err.message : String(err),
				});
				throw err;
			}
		},

		pin: async (params) => {
			try {
				const response = await client.im.pin.create({
					data: { message_id: params.messageId },
				});
				const pinId = (
					response as unknown as { data?: { pin?: { create_time?: string } } }
				).data?.pin?.create_time;
				return { pinId };
			} catch (err) {
				logger.warn({
					msg: "feishu action pin failed",
					error: err instanceof Error ? err.message : String(err),
				});
				throw err;
			}
		},

		unpin: async (params) => {
			try {
				await client.im.pin.delete({
					path: { message_id: params.messageId },
				});
			} catch (err) {
				logger.warn({
					msg: "feishu action unpin failed",
					error: err instanceof Error ? err.message : String(err),
				});
				throw err;
			}
		},
	};
}

/**
 * 当上层请求一个我们明确不支持的动作时可抛此错误。
 */
export function feishuUnsupported(action: string): never {
	throw new ChannelActionUnsupportedError("feishu", action);
}
