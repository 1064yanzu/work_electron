/**
 * PDF FormatHandler（薄壳）。
 *
 * 实际解析逻辑在 ./pdfParser.ts（纯实现，主进程与 parser worker 共享）。
 * 大 PDF 的全文抽取通过 workers/parserHost 派发到 utilityProcess，
 * worker 不可用时自动降级回主进程内联执行，对调用方接口不变。
 */
import { dispatchParser } from "../../workers/parserHost";
import { parsePdfBook } from "./pdfParser";
import type { ChapterContent, FormatHandler, ParsedBook } from "./types";

/** 大 PDF（几百页扫描件）的全文抽取可能很慢，给宽超时。 */
const PARSE_TIMEOUT_MS = 180_000;

export const pdfFormatHandler: FormatHandler = {
	format: "pdf",

	async parse(absolutePath): Promise<ParsedBook> {
		return dispatchParser<ParsedBook>(
			"pdf_parse",
			{ filePath: absolutePath },
			{
				timeoutMs: PARSE_TIMEOUT_MS,
				inline: () => parsePdfBook(absolutePath),
			},
		);
	},

	async getChapter(_absolutePath, chapterId): Promise<ChapterContent> {
		// PDF 章节由前端 PdfEngine 自渲染（react-pdf），不通过 IPC 取章节文本。
		// 这里返回页码标识，便于前端跳转（chapterId 形如 page-N）。
		const m = chapterId.match(/^page-(\d+)$/);
		const page = m ? Number(m[1]) : 1;
		return {
			id: chapterId,
			title: `第 ${page} 页`,
			text: "",
			prev_id: page > 1 ? `page-${page - 1}` : null,
			next_id: `page-${page + 1}`,
			word_count: 0,
		};
	},
};
