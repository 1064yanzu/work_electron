/**
 * 入站 / 出站文件转码工具。
 *
 * 入站（IM → pty）：
 *   channel 在 RemoteInboundMessage.inbound_files 给一组 download() 闭包；
 *   PtyBridgeService 把它们顺序拉下来、写入 cwd/.uploads/，并向 pty 注入一行
 *   提示告诉用户文件已落盘。
 *
 * 出站（pty → IM）：
 *   `/cli get <path>` 解析 cwd 下相对路径，读到 buffer 后调用渠道的
 *   ChannelFileTransfer.sendFile() 推回 IM。会做安全检查阻止跳出 cwd 与超大文件。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ChannelFileTransfer } from "../../sdk";
import type { RemoteInboundFileRef } from "../types";

export type SaveInboundResult = {
	saved: { filename: string; absPath: string; bytes: number }[];
	skipped: { filename: string; reason: string }[];
};

const UPLOADS_DIR_NAME = ".uploads";

function sanitizeFilename(input: string): string {
	const base = path.basename(input).replace(/[\x00-\x1f]/g, "");
	const safe = base.replace(/[^\w.\-+@()一-龥]+/g, "_").slice(0, 120);
	return safe || `file_${Date.now()}`;
}

async function ensureDir(absDir: string): Promise<void> {
	await fs.mkdir(absDir, { recursive: true });
}

export async function saveInboundFiles(
	cwd: string,
	files: RemoteInboundFileRef[],
	limits: { maxBytes: number },
): Promise<SaveInboundResult> {
	const uploadsDir = path.join(cwd, UPLOADS_DIR_NAME);
	await ensureDir(uploadsDir);
	const saved: SaveInboundResult["saved"] = [];
	const skipped: SaveInboundResult["skipped"] = [];
	for (const file of files) {
		const filename = sanitizeFilename(file.filename || `file_${Date.now()}`);
		const known = file.bytes ?? 0;
		if (known && known > limits.maxBytes) {
			skipped.push({
				filename,
				reason: `文件大小 ${known} 字节超过上限 ${limits.maxBytes}`,
			});
			continue;
		}
		let buffer: Buffer;
		try {
			buffer = await file.download();
		} catch (error) {
			skipped.push({
				filename,
				reason: `下载失败：${error instanceof Error ? error.message : String(error)}`,
			});
			continue;
		}
		if (buffer.byteLength > limits.maxBytes) {
			skipped.push({
				filename,
				reason: `下载后字节数 ${buffer.byteLength} 超过上限 ${limits.maxBytes}`,
			});
			continue;
		}
		// 同名冲突时追加时间戳后缀
		let target = path.join(uploadsDir, filename);
		try {
			const stat = await fs.stat(target).catch(() => null);
			if (stat) {
				const ext = path.extname(filename);
				const base = filename.slice(0, filename.length - ext.length);
				target = path.join(uploadsDir, `${base}_${Date.now()}${ext}`);
			}
			await fs.writeFile(target, buffer);
			saved.push({
				filename: path.basename(target),
				absPath: target,
				bytes: buffer.byteLength,
			});
		} catch (error) {
			skipped.push({
				filename,
				reason: `落盘失败：${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}
	return { saved, skipped };
}

export type LoadOutboundFileResult =
	| {
			ok: true;
			absPath: string;
			data: Buffer;
			mimeType?: string;
	  }
	| {
			ok: false;
			reason: string;
	  };

const MIME_BY_EXT: Record<string, string> = {
	".txt": "text/plain",
	".md": "text/markdown",
	".json": "application/json",
	".yaml": "application/x-yaml",
	".yml": "application/x-yaml",
	".log": "text/plain",
	".html": "text/html",
	".csv": "text/csv",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".pdf": "application/pdf",
	".zip": "application/zip",
};

export async function loadOutboundFile(
	cwd: string,
	relativePath: string,
	limits: { maxBytes: number },
): Promise<LoadOutboundFileResult> {
	const cleaned = relativePath.replace(/^['"]+|['"]+$/g, "").trim();
	if (!cleaned) return { ok: false, reason: "未提供文件路径" };
	const cwdReal = await fs.realpath(cwd).catch(() => cwd);
	const target = path.resolve(cwdReal, cleaned);
	const targetReal = await fs.realpath(target).catch(() => target);
	if (
		!targetReal.startsWith(
			cwdReal.endsWith(path.sep) ? cwdReal : cwdReal + path.sep,
		)
	) {
		return {
			ok: false,
			reason: "路径越界，只能读取当前 cwd 下的文件",
		};
	}
	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(targetReal);
	} catch {
		return { ok: false, reason: "文件不存在或不可访问" };
	}
	if (!stat.isFile()) return { ok: false, reason: "目标不是普通文件" };
	if (stat.size > limits.maxBytes) {
		return {
			ok: false,
			reason: `文件 ${stat.size} 字节超过上限 ${limits.maxBytes}（可在设置面板调整）`,
		};
	}
	const data = await fs.readFile(targetReal);
	const ext = path.extname(targetReal).toLowerCase();
	return {
		ok: true,
		absPath: targetReal,
		data,
		mimeType: MIME_BY_EXT[ext],
	};
}

/**
 * 渠道未实现 fileTransfer 时回退提示文本。
 */
export function notSupportedFileTransfer(channelId: string): string {
	return `渠道 ${channelId} 暂未启用文件上下行，请在设置面板检查或换个渠道。`;
}

export async function sendFileViaChannel(
	transfer: ChannelFileTransfer,
	params: {
		targetId: string;
		fileName: string;
		data: Buffer;
		mimeType?: string;
		caption?: string;
		replyToMessageId?: string;
	},
): Promise<void> {
	await transfer.sendFile(params);
}
