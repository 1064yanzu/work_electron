/**
 * 飞书渠道文件上下行能力（IM 远控终端 /cli get 出站）。
 *
 * - 图片（jpg/png/webp/gif/bmp）→ im.image.create + msg_type=image
 * - 其它文件 → im.file.create(file_type=<推断>) + msg_type=file
 * - 同时支持回复（reply）以及群/单聊（create）两条路径
 *
 * `caption` 字段：飞书 file/image 消息不支持原生 caption，所以会在发送文件后
 * 单独追加一条 text 消息作为补充说明。
 */

import type { Client } from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";
import type { ChannelFileSendParams, ChannelFileTransfer } from "../../sdk";

type FeishuFileType = "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";

const EXT_TO_FILE_TYPE: Record<string, FeishuFileType> = {
	".opus": "opus",
	".mp4": "mp4",
	".mov": "mp4",
	".m4v": "mp4",
	".pdf": "pdf",
	".doc": "doc",
	".docx": "doc",
	".xls": "xls",
	".xlsx": "xls",
	".ppt": "ppt",
	".pptx": "ppt",
};

const IMAGE_EXTS = new Set([
	".jpg",
	".jpeg",
	".png",
	".webp",
	".gif",
	".bmp",
	".tif",
	".tiff",
	".ico",
]);

function lowerExt(filename: string): string {
	const idx = filename.lastIndexOf(".");
	if (idx < 0) return "";
	return filename.slice(idx).toLowerCase();
}

function isImage(filename: string, mimeType?: string): boolean {
	if (mimeType && mimeType.toLowerCase().startsWith("image/")) return true;
	return IMAGE_EXTS.has(lowerExt(filename));
}

function resolveFileType(filename: string): FeishuFileType {
	return EXT_TO_FILE_TYPE[lowerExt(filename)] ?? "stream";
}

export type FeishuFileTransferOptions = {
	client: Client;
	logger: Logger;
	enabled: () => boolean;
	resolveReceiveIdType: (
		targetId: string,
	) => "chat_id" | "open_id" | "user_id" | "union_id" | "email";
};

export function createFeishuFileTransfer(
	opts: FeishuFileTransferOptions,
): ChannelFileTransfer {
	const { client, logger, enabled, resolveReceiveIdType } = opts;

	async function uploadImage(buffer: Buffer): Promise<string | null> {
		try {
			const res = await client.im.image.create({
				data: { image_type: "message", image: buffer },
			});
			return res?.image_key ?? null;
		} catch (error) {
			logger.warn({
				msg: "feishu image upload failed",
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	async function uploadFile(
		filename: string,
		buffer: Buffer,
	): Promise<string | null> {
		try {
			const res = await client.im.file.create({
				data: {
					file_type: resolveFileType(filename),
					file_name: filename,
					file: buffer,
				},
			});
			return res?.file_key ?? null;
		} catch (error) {
			logger.warn({
				msg: "feishu file upload failed",
				error: error instanceof Error ? error.message : String(error),
				filename,
			});
			return null;
		}
	}

	async function sendInteractiveMessage(
		params: ChannelFileSendParams,
		msgType: "file" | "image",
		content: string,
	): Promise<void> {
		const targetId = params.targetId;
		const receiveIdType = resolveReceiveIdType(targetId);
		if (params.replyToMessageId) {
			await client.im.message.reply({
				path: { message_id: params.replyToMessageId },
				data: { msg_type: msgType, content },
			});
		} else {
			await client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: targetId,
					msg_type: msgType,
					content,
				},
			});
		}
	}

	async function sendCaption(params: ChannelFileSendParams): Promise<void> {
		if (!params.caption) return;
		const receiveIdType = resolveReceiveIdType(params.targetId);
		try {
			await client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: params.targetId,
					msg_type: "text",
					content: JSON.stringify({ text: params.caption }),
				},
			});
		} catch (error) {
			logger.warn({
				msg: "feishu file caption send failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return {
		isEnabled: enabled,
		async sendFile(params: ChannelFileSendParams): Promise<void> {
			if (isImage(params.fileName, params.mimeType)) {
				const imageKey = await uploadImage(params.data);
				if (!imageKey) {
					throw new Error("飞书图片上传失败");
				}
				await sendInteractiveMessage(
					params,
					"image",
					JSON.stringify({ image_key: imageKey }),
				);
			} else {
				const fileKey = await uploadFile(params.fileName, params.data);
				if (!fileKey) {
					throw new Error("飞书文件上传失败");
				}
				await sendInteractiveMessage(
					params,
					"file",
					JSON.stringify({ file_key: fileKey }),
				);
			}
			await sendCaption(params);
		},
	};
}
