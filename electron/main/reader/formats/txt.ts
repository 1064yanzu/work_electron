import fs from "node:fs/promises";
import path from "node:path";

import type { ReaderTocItem } from "../../../shared/ipc-schema";
import type { ChapterContent, FormatHandler, ParsedBook } from "./types";

const TXT_CHUNK_CHARS = 6_000;

function detectEncoding(_buf: Buffer): "utf-8" {
	return "utf-8";
}

function splitTextIntoChapters(content: string): {
	chapters: Array<{ id: string; title: string; text: string }>;
	totalWords: number;
} {
	const lines = content.split(/\r?\n/);
	const chapters: Array<{ id: string; title: string; text: string }> = [];

	const HEADING_RE =
		/^(第[一二三四五六七八九十百千零〇\d]+[章节回卷篇部话讲]|chapter\s+\d+|序章|前言|引言|楔子|尾声|后记|附录|致谢|目录)/i;
	let currentTitle = "正文开头";
	let currentLines: string[] = [];

	const flush = () => {
		const text = currentLines.join("\n").trim();
		if (text.length === 0 && chapters.length > 0) return;
		chapters.push({
			id: `c${chapters.length}`,
			title: currentTitle,
			text,
		});
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (HEADING_RE.test(trimmed) && trimmed.length < 80) {
			flush();
			currentTitle = trimmed;
			currentLines = [];
			continue;
		}
		currentLines.push(line);
	}
	flush();

	if (chapters.length === 0) {
		// 没有匹配章节标题：按字数切片
		for (let i = 0, idx = 0; i < content.length; i += TXT_CHUNK_CHARS, idx++) {
			chapters.push({
				id: `c${idx}`,
				title: `第 ${idx + 1} 部分`,
				text: content.slice(i, i + TXT_CHUNK_CHARS),
			});
		}
	}

	const totalWords = countWords(content);
	return { chapters, totalWords };
}

function countWords(text: string): number {
	const cjk = (text.match(/[一-龥]/g) || []).length;
	const ascii = (text.match(/[A-Za-z0-9]+/g) || []).length;
	return cjk + ascii;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(text: string): string {
	const paragraphs = text
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean);
	if (paragraphs.length === 0) {
		const lines = text
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);
		return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n");
	}
	return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
}

export const txtFormatHandler: FormatHandler = {
	format: "txt",

	async parse(absolutePath): Promise<ParsedBook> {
		const buf = await fs.readFile(absolutePath);
		const encoding = detectEncoding(buf);
		const content = buf.toString(encoding);
		const { chapters, totalWords } = splitTextIntoChapters(content);

		const toc: ReaderTocItem[] = chapters.map((c) => ({
			id: c.id,
			label: c.title,
			href: c.id,
			level: 1,
		}));

		const baseName = path.basename(absolutePath, path.extname(absolutePath));

		return {
			title: baseName,
			authors: [],
			language: null,
			format: "txt",
			page_count: null,
			word_count: totalWords,
			toc,
			metadata: { source_encoding: encoding },
			full_text: content,
			cover: null,
		};
	},

	async getChapter(absolutePath, chapterId): Promise<ChapterContent> {
		const buf = await fs.readFile(absolutePath);
		const content = buf.toString(detectEncoding(buf));
		const { chapters } = splitTextIntoChapters(content);
		const idx = chapters.findIndex((c) => c.id === chapterId);
		const chapter = idx >= 0 ? chapters[idx] : chapters[0];
		const html = textToHtml(chapter.text);
		return {
			id: chapter.id,
			title: chapter.title,
			html,
			text: chapter.text,
			prev_id: idx > 0 ? chapters[idx - 1].id : null,
			next_id:
				idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1].id : null,
			word_count: countWords(chapter.text),
		};
	},
};

export { countWords as txtCountWords, splitTextIntoChapters };
