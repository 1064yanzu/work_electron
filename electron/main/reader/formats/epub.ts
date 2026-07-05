/**
 * EPUB FormatHandler（薄壳）。
 *
 * 实际解析逻辑在 ./epubParser.ts（纯实现，主进程与 parser worker 共享）。
 * 这里通过 workers/parserHost 的 dispatchParser 优先把 JSDOM 重解析派发到
 * utilityProcess，worker 不可用时自动降级回主进程内联执行，
 * 对调用方（formats/index.ts、bookService、contentIngest）接口不变。
 */

import type { ChapterContent, FormatHandler, ParsedBook } from "./types";
import { dispatchParser } from "../../workers/parserHost";
import { getEpubChapter, parseEpub } from "./epubParser";

/** 整本解析可能涉及几百章 JSDOM + 封面/全文抽取，给宽超时。 */
const PARSE_TIMEOUT_MS = 180_000;
/** 单章解析较轻。 */
const CHAPTER_TIMEOUT_MS = 30_000;

export const epubFormatHandler: FormatHandler = {
	format: "epub",

	async parse(absolutePath): Promise<ParsedBook> {
		return dispatchParser<ParsedBook>(
			"epub_parse",
			{ filePath: absolutePath },
			{
				timeoutMs: PARSE_TIMEOUT_MS,
				inline: () => parseEpub(absolutePath),
			},
		);
	},

	async getChapter(absolutePath, chapterId, toc): Promise<ChapterContent> {
		return dispatchParser<ChapterContent>(
			"epub_get_chapter",
			{ filePath: absolutePath, chapterId, toc },
			{
				timeoutMs: CHAPTER_TIMEOUT_MS,
				inline: () => getEpubChapter(absolutePath, chapterId, toc),
			},
		);
	},
};
