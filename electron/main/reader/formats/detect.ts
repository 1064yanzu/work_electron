import path from "node:path";
import type { ReaderFormat } from "../../../shared/ipc-schema";

const EXT_TO_FORMAT: Record<string, ReaderFormat> = {
	".pdf": "pdf",
	".epub": "epub",
	".mobi": "mobi",
	".azw": "azw3",
	".azw3": "azw3",
	".kfx": "azw3",
	".txt": "txt",
	".log": "txt",
	".html": "html",
	".htm": "html",
	".xhtml": "html",
	".md": "md",
	".markdown": "md",
	".docx": "docx",
	".cbz": "cbz",
};

export function detectFormatByExt(filePath: string): ReaderFormat | null {
	const ext = path.extname(filePath).toLowerCase();
	return EXT_TO_FORMAT[ext] ?? null;
}

export function isReaderSupportedExt(ext: string): boolean {
	const e = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
	return Object.prototype.hasOwnProperty.call(EXT_TO_FORMAT, e);
}

export function listReaderExtensions(): string[] {
	return Object.keys(EXT_TO_FORMAT).map((e) => e.replace(/^\./, ""));
}
