/**
 * Discord 渠道文件上下行能力（IM 远控终端 /cli get 出站）。
 *
 * - discord.js: channel.send({ files: [{ attachment: Buffer, name }] })
 * - caption 走在同一条 send 的 content 字段（Discord 支持）
 */

import type { Client, Message } from "discord.js";
import type { Logger } from "../../../logging/types";
import type { ChannelFileSendParams, ChannelFileTransfer } from "../../sdk";

export type DiscordFileTransferOptions = {
	client: Client;
	logger: Logger;
	enabled: () => boolean;
};

export function createDiscordFileTransfer(
	opts: DiscordFileTransferOptions,
): ChannelFileTransfer {
	const { client, logger, enabled } = opts;
	return {
		isEnabled: enabled,
		async sendFile(params: ChannelFileSendParams): Promise<void> {
			const channel = await client.channels
				.fetch(params.targetId)
				.catch(() => null);
			if (!channel || !("send" in channel)) {
				throw new Error(`discord: channel ${params.targetId} not sendable`);
			}
			const sendable = channel as {
				send: (opts: {
					content?: string;
					files: { attachment: Buffer; name: string }[];
					reply?: { messageReference: string };
				}) => Promise<Message>;
			};
			try {
				await sendable.send({
					content: params.caption,
					files: [{ attachment: params.data, name: params.fileName }],
					...(params.replyToMessageId
						? { reply: { messageReference: params.replyToMessageId } }
						: {}),
				});
			} catch (err) {
				logger.warn({
					msg: "discord file send failed",
					error: err instanceof Error ? err.message : String(err),
					fileName: params.fileName,
				});
				throw err;
			}
		},
	};
}
