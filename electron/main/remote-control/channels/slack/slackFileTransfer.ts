/**
 * Slack 渠道文件上下行能力（IM 远控终端 /cli get 出站）。
 *
 * 使用 @slack/web-api 的 files.uploadV2：
 *   - 一次性 Buffer 上传到 channel
 *   - initial_comment 当 caption
 *   - thread_ts 当 reply context（若调用方提供）
 */

import type { App } from "@slack/bolt";
import type { Logger } from "../../../logging/types";
import type { ChannelFileSendParams, ChannelFileTransfer } from "../../sdk";

export type SlackFileTransferOptions = {
	app: App;
	logger: Logger;
	enabled: () => boolean;
};

export function createSlackFileTransfer(
	opts: SlackFileTransferOptions,
): ChannelFileTransfer {
	const { app, logger, enabled } = opts;
	return {
		isEnabled: enabled,
		async sendFile(params: ChannelFileSendParams): Promise<void> {
			try {
				if (params.replyToMessageId) {
					await app.client.files.uploadV2({
						channel_id: params.targetId,
						filename: params.fileName,
						file: params.data,
						initial_comment: params.caption,
						thread_ts: params.replyToMessageId,
					});
				} else {
					await app.client.files.uploadV2({
						channel_id: params.targetId,
						filename: params.fileName,
						file: params.data,
						initial_comment: params.caption,
					});
				}
			} catch (err) {
				logger.warn({
					msg: "slack file send failed",
					error: err instanceof Error ? err.message : String(err),
					fileName: params.fileName,
				});
				throw err;
			}
		},
	};
}
