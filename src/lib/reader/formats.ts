/**
 * 与后端 electron/main/reader/formats/detect.ts 中 EXT_TO_FORMAT 保持同步：
 * 任何一边新增或删除支持格式时，请同时更新另一边。
 */
const READER_EXTENSIONS: ReadonlySet<string> = new Set([
	"pdf",
	"epub",
	"mobi",
	"azw",
	"azw3",
	"kfx",
	"txt",
	"log",
	"html",
	"htm",
	"xhtml",
	"md",
	"markdown",
	"docx",
	"cbz",
]);

function normalizeExt(value: string): string {
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return "";
	const idx = trimmed.lastIndexOf(".");
	const ext = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
	return ext;
}

/** 判断给定的扩展名或文件名是否被阅读器支持。 */
export function isReaderSupportedFile(nameOrExt: string): boolean {
	const ext = normalizeExt(nameOrExt);
	return ext.length > 0 && READER_EXTENSIONS.has(ext);
}
