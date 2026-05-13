import { Readable } from "node:stream";
import * as Lark from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";

export type FeishuAttachmentMessageType = "file" | "image" | "media" | "audio";

type FeishuAttachmentResourceType = "file" | "image";

export type FeishuBufferedAttachment = {
	messageId: string;
	messageType: FeishuAttachmentMessageType;
	resourceType: FeishuAttachmentResourceType;
	fileKey: string;
	fileName?: string;
	contentType?: string;
	contentLength?: number;
	extractStatus:
		| "extracted"
		| "unsupported"
		| "download_failed"
		| "parse_failed"
		| "empty";
	extractedText?: string;
	detail?: string;
};

type IncomingAttachmentMessage = {
	message_id?: string;
	message_type?: string;
	content?: string;
};

type AttachmentMeta = {
	messageId: string;
	messageType: FeishuAttachmentMessageType;
	resourceType: FeishuAttachmentResourceType;
	fileKey: string;
	fileName?: string;
};

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv"]);
const MAX_ATTACHMENT_TEXT_CHARS = 8_000;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function safeJsonParse(
	raw: string | undefined,
): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		return asRecord(JSON.parse(raw));
	} catch {
		return null;
	}
}

function toStringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getExtension(fileName: string | undefined): string {
	if (!fileName) return "";
	const idx = fileName.lastIndexOf(".");
	if (idx < 0 || idx === fileName.length - 1) return "";
	return fileName.slice(idx).toLowerCase();
}

function parseContentLength(headers: unknown): number | undefined {
	const raw = asRecord(headers)?.["content-length"];
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	if (typeof raw === "string") {
		const value = Number(raw);
		if (Number.isFinite(value) && value >= 0) return value;
	}
	return undefined;
}

function parseContentType(headers: unknown): string | undefined {
	return toStringOrUndefined(asRecord(headers)?.["content-type"]);
}

function parseFileNameFromContentDisposition(
	headers: unknown,
): string | undefined {
	const disposition = toStringOrUndefined(
		asRecord(headers)?.["content-disposition"],
	);
	if (!disposition) return undefined;
	const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
	if (utf8Match?.[1]) {
		try {
			return decodeURIComponent(utf8Match[1]);
		} catch {
			return utf8Match[1];
		}
	}
	const normalMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i);
	if (normalMatch?.[1]) return normalMatch[1];
	return undefined;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		if (Buffer.isBuffer(chunk)) {
			chunks.push(chunk);
			continue;
		}
		if (typeof chunk === "string") {
			chunks.push(Buffer.from(chunk));
			continue;
		}
		chunks.push(Buffer.from(chunk as ArrayBuffer));
	}
	return Buffer.concat(chunks);
}

export class FeishuMessageResourceService {
	constructor(
		private readonly client: Lark.Client,
		private readonly logger: Logger,
	) {}

	/**
	 * 直接按 message_id + file_key 下载附件二进制，供 IM 远控终端 inbound_files
	 * 的 download() 闭包使用。
	 *
	 * resourceType=image 走 image_key（飞书 SDK 对 image 类附件下载用 type=image），
	 * 其他全部走 file。
	 */
	async downloadAttachmentBuffer(params: {
		messageId: string;
		fileKey: string;
		resourceType: FeishuAttachmentResourceType;
	}): Promise<Buffer> {
		const resourceResp = await this.client.im.messageResource.get({
			params: { type: params.resourceType },
			path: {
				message_id: params.messageId,
				file_key: params.fileKey,
			},
		});
		const stream = resourceResp.getReadableStream();
		return streamToBuffer(stream);
	}

	private extractMeta(
		message: IncomingAttachmentMessage,
	): AttachmentMeta | null {
		const messageId = toStringOrUndefined(message.message_id);
		const messageTypeRaw = toStringOrUndefined(
			message.message_type,
		)?.toLowerCase();
		if (!messageId || !messageTypeRaw) return null;
		if (
			messageTypeRaw !== "file" &&
			messageTypeRaw !== "image" &&
			messageTypeRaw !== "media" &&
			messageTypeRaw !== "audio"
		) {
			return null;
		}

		const parsed = safeJsonParse(message.content);
		const fileKey =
			messageTypeRaw === "image"
				? toStringOrUndefined(parsed?.image_key)
				: toStringOrUndefined(parsed?.file_key);
		if (!fileKey) {
			return null;
		}

		return {
			messageId,
			messageType: messageTypeRaw,
			resourceType: messageTypeRaw === "image" ? "image" : "file",
			fileKey,
			fileName: toStringOrUndefined(parsed?.file_name),
		};
	}

	private extractTextFromBuffer(
		meta: AttachmentMeta,
		buffer: Buffer,
	): Pick<
		FeishuBufferedAttachment,
		"extractStatus" | "extractedText" | "detail"
	> {
		if (meta.messageType !== "file") {
			return {
				extractStatus: "unsupported",
				detail: "该资源类型不做文本提取，仅保留元信息。",
			};
		}
		const extension = getExtension(meta.fileName);
		if (!TEXT_EXTENSIONS.has(extension)) {
			return {
				extractStatus: "unsupported",
				detail: `文件扩展名 ${extension || "(无扩展名)"} 暂不支持文本提取。`,
			};
		}
		try {
			const rawText = buffer.toString("utf-8");
			const trimmed = rawText.trim();
			if (!trimmed) {
				return {
					extractStatus: "empty",
					detail: "文件内容为空，未注入正文。",
				};
			}
			let text = trimmed;
			if (text.length > MAX_ATTACHMENT_TEXT_CHARS) {
				text = text.slice(0, MAX_ATTACHMENT_TEXT_CHARS);
				return {
					extractStatus: "extracted",
					extractedText: text,
					detail: `文本已截断到 ${MAX_ATTACHMENT_TEXT_CHARS} 字符。`,
				};
			}
			return {
				extractStatus: "extracted",
				extractedText: text,
			};
		} catch (error) {
			return {
				extractStatus: "parse_failed",
				detail: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async fetchBufferedAttachment(
		message: IncomingAttachmentMessage,
	): Promise<FeishuBufferedAttachment | null> {
		const meta = this.extractMeta(message);
		if (!meta) return null;

		try {
			const resourceResp = await this.client.im.messageResource.get({
				params: { type: meta.resourceType },
				path: {
					message_id: meta.messageId,
					file_key: meta.fileKey,
				},
			});
			const stream = resourceResp.getReadableStream();
			const buffer = await streamToBuffer(stream);
			const contentType = parseContentType(resourceResp.headers);
			const contentLength =
				parseContentLength(resourceResp.headers) ?? buffer.byteLength;
			const headerName = parseFileNameFromContentDisposition(
				resourceResp.headers,
			);
			const fileName = meta.fileName || headerName;
			const extraction = this.extractTextFromBuffer(
				{
					...meta,
					fileName,
				},
				buffer,
			);
			return {
				messageId: meta.messageId,
				messageType: meta.messageType,
				resourceType: meta.resourceType,
				fileKey: meta.fileKey,
				fileName,
				contentType,
				contentLength,
				extractStatus: extraction.extractStatus,
				extractedText: extraction.extractedText,
				detail: extraction.detail,
			};
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			this.logger.warn({
				msg: "feishu attachment download failed",
				messageId: meta.messageId,
				fileKey: meta.fileKey,
				error: detail,
			});
			return {
				messageId: meta.messageId,
				messageType: meta.messageType,
				resourceType: meta.resourceType,
				fileKey: meta.fileKey,
				fileName: meta.fileName,
				extractStatus: "download_failed",
				detail,
			};
		}
	}

	buildContextBlock(attachments: FeishuBufferedAttachment[]): string {
		if (!attachments.length) return "";
		const lines: string[] = ["[系统上下文：飞书附件]"];
		for (const [index, item] of attachments.entries()) {
			lines.push(`附件 ${index + 1}:`);
			lines.push(`- 来源消息: ${item.messageId}`);
			lines.push(`- 消息类型: ${item.messageType}`);
			lines.push(`- 资源键: ${item.fileKey}`);
			if (item.fileName) {
				lines.push(`- 文件名: ${item.fileName}`);
			}
			if (typeof item.contentLength === "number") {
				lines.push(`- 文件大小: ${item.contentLength} bytes`);
			}
			if (item.contentType) {
				lines.push(`- Content-Type: ${item.contentType}`);
			}
			lines.push(`- 提取状态: ${item.extractStatus}`);
			if (item.detail) {
				lines.push(`- 说明: ${item.detail}`);
			}
			if (item.extractedText) {
				lines.push("- 文本内容:");
				lines.push("```text");
				lines.push(item.extractedText);
				lines.push("```");
			}
		}
		return lines.join("\n");
	}
}
