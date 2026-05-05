import type { ReaderFormat } from "../../../shared/ipc-schema";
import type { FormatHandler, FormatRegistry } from "./types";

import { pdfFormatHandler } from "./pdf";
import { epubFormatHandler } from "./epub";
import { txtFormatHandler } from "./txt";
import { markdownFormatHandler } from "./markdown";
import { htmlFormatHandler } from "./html";
import { docxFormatHandler } from "./docx";
import { cbzFormatHandler } from "./cbz";
import { mobiFormatHandler, azw3FormatHandler } from "./mobi";

export {
	detectFormatByExt,
	isReaderSupportedExt,
	listReaderExtensions,
} from "./detect";
export type { ChapterContent, FormatHandler, ParsedBook } from "./types";

const handlers: FormatRegistry = {
	pdf: pdfFormatHandler,
	epub: epubFormatHandler,
	txt: txtFormatHandler,
	md: markdownFormatHandler,
	html: htmlFormatHandler,
	docx: docxFormatHandler,
	cbz: cbzFormatHandler,
	mobi: mobiFormatHandler,
	azw3: azw3FormatHandler,
};

export function getFormatHandler(format: ReaderFormat): FormatHandler {
	const h = handlers[format];
	if (!h) throw new Error(`UNSUPPORTED_READER_FORMAT:${format}`);
	return h;
}

export function isFormatSupported(format: ReaderFormat): boolean {
	return Boolean(handlers[format]);
}
