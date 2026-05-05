import type { ReaderFormat, ReaderTocItem } from "../../../shared/ipc-schema";

export type ParsedBook = {
	title: string;
	authors: string[];
	language: string | null;
	format: ReaderFormat;
	page_count: number | null;
	word_count: number | null;
	toc: ReaderTocItem[];
	metadata: Record<string, unknown>;
	/** 用于 KB 全文索引的纯文本（拼接所有章节）。 */
	full_text: string;
	cover?: { bytes: Uint8Array; mime: string } | null;
};

export type ChapterContent = {
	id: string;
	title: string;
	html?: string;
	text?: string;
	images?: Array<{ name: string; data_url: string; mime: string }>;
	prev_id: string | null;
	next_id: string | null;
	word_count?: number;
};

/** 单个格式处理器统一接口（按需注册）。 */
export interface FormatHandler {
	readonly format: ReaderFormat;
	/** 解析整本：从原始文件 → 元数据 + TOC + 全文。 */
	parse(absolutePath: string): Promise<ParsedBook>;
	/** 取章节渲染内容（按 toc.href / chapter_id）。 */
	getChapter(
		absolutePath: string,
		chapterId: string,
		toc: ReaderTocItem[],
	): Promise<ChapterContent>;
}

export type FormatRegistry = Partial<Record<ReaderFormat, FormatHandler>>;
