/**
 * Telegram 渠道文件上下行能力（IM 远控终端 /cli get 出站）。
 *
 * grammy 提供：
 *   - bot.api.sendDocument(chatId, InputFile) ：通用文件
 *   - bot.api.sendPhoto(chatId, InputFile)    ：图片（更好的预览）
 *
 * caption 字段直接挂在 send 调用上。Telegram 单文件 50MB（bot 限 20MB）。
 */

import { InputFile, type Bot } from "grammy";
import type { Logger } from "../../../logging/types";
import type { ChannelFileSendParams, ChannelFileTransfer } from "../../sdk";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);

function lowerExt(filename: string): string {
	const idx = filename.lastIndexOf(".");
	if (idx < 0) return "";
	return filename.slice(idx).toLowerCase();
}

function isImage(filename: string, mimeType?: string): boolean {
	if (mimeType && mimeType.toLowerCase().startsWith("image/")) {
		// gif 在 Telegram 走 sendAnimation 更合适，但作为 sendPhoto 也能展开
		return true;
	}
	return IMAGE_EXTS.has(lowerExt(filename));
}

export type TelegramFileTransferOptions = {
	bot: Bot;
	logger: Logger;
	enabled: () => boolean;
};

export function createTelegramFileTransfer(
	opts: TelegramFileTransferOptions,
): ChannelFileTransfer {
	const { bot, logger, enabled } = opts;
	return {
		isEnabled: enabled,
		async sendFile(params: ChannelFileSendParams): Promise<void> {
			const chatId = /^-?\d+$/.test(params.targetId)
				? Number(params.targetId)
				: params.targetId;
			const input = new InputFile(params.data, params.fileName);
			const replyParams = params.replyToMessageId
				? {
						reply_parameters: { message_id: Number(params.replyToMessageId) },
					}
				: {};
			const captionParams = params.caption ? { caption: params.caption } : {};
			try {
				if (isImage(params.fileName, params.mimeType)) {
					await bot.api.sendPhoto(chatId, input, {
						...captionParams,
						...replyParams,
					});
				} else {
					await bot.api.sendDocument(chatId, input, {
						...captionParams,
						...replyParams,
					});
				}
			} catch (err) {
				logger.warn({
					msg: "telegram file send failed",
					error: err instanceof Error ? err.message : String(err),
					fileName: params.fileName,
				});
				throw err;
			}
		},
	};
}
