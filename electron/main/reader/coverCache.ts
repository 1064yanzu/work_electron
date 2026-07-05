import fs from "node:fs/promises";
import path from "node:path";

import { ensureReaderDirs, getCoverPath } from "./storage";
import { mimeToExt } from "./mime";

// MIME 映射已抽到纯模块 ./mime（供 parser worker 共享），这里保留 re-export 兼容旧引用。
export { extToMime, mimeToExt } from "./mime";

/** 写入封面 PNG 字节，返回最终路径。 */
export async function saveCoverBytes(
	bookId: string,
	bytes: Uint8Array,
	ext = ".png",
): Promise<string> {
	await ensureReaderDirs();
	const dest = getCoverPath(bookId, ext);
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.writeFile(dest, bytes);
	return dest;
}

/** 写入封面 base64（自动识别后缀），返回最终路径。 */
export async function saveCoverBase64(
	bookId: string,
	base64: string,
	mime?: string,
): Promise<string> {
	const ext = mimeToExt(mime || "image/png");
	const cleaned = base64.replace(/^data:[^;]+;base64,/, "");
	const bytes = Buffer.from(cleaned, "base64");
	return saveCoverBytes(bookId, bytes, ext);
}

export async function readCoverIfExists(
	bookId: string,
): Promise<{ path: string; bytes: Buffer } | null> {
	for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
		const p = getCoverPath(bookId, ext);
		try {
			const bytes = await fs.readFile(p);
			return { path: p, bytes };
		} catch {}
	}
	return null;
}
