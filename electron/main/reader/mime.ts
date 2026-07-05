/**
 * 纯 MIME/扩展名映射工具。
 *
 * 独立成模块的原因：epub 解析逻辑（formats/epubParser.ts）会同时被
 * 主进程与 parser utilityProcess worker 引用，worker 侧不能沿
 * coverCache → storage → cacheRoots 的链路把 electron 模块拉进 bundle。
 * 本文件必须保持零依赖（不 import electron、不 import 任何业务模块）。
 */

export function mimeToExt(mime: string): string {
	const m = mime.toLowerCase();
	if (m.includes("png")) return ".png";
	if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
	if (m.includes("webp")) return ".webp";
	if (m.includes("gif")) return ".gif";
	return ".png";
}

export function extToMime(ext: string): string {
	const e = ext.toLowerCase();
	if (e === ".png") return "image/png";
	if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
	if (e === ".webp") return "image/webp";
	if (e === ".gif") return "image/gif";
	if (e === ".svg") return "image/svg+xml";
	return "application/octet-stream";
}
