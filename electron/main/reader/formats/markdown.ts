import fs from "node:fs/promises";
import path from "node:path";

import type { ReaderTocItem } from "../../../shared/ipc-schema";
import type { ChapterContent, FormatHandler, ParsedBook } from "./types";
import { txtCountWords } from "./txt";

/**
 * 简易 Markdown → 章节切分（按 H1/H2）。无外部依赖，
 * 渲染端会再做一次完整的 markdown → html，所以这里仅做 chapter 拆分与摘要。
 */
function parseMarkdownChapters(md: string): Array<{
	id: string;
	title: string;
	level: number;
	body: string;
}> {
	const lines = md.split(/\r?\n/);
	const chapters: Array<{
		id: string;
		title: string;
		level: number;
		body: string;
	}> = [];

	let buf: string[] = [];
	let title = "前言";
	let level = 0;
	let inFence = false;

	const flush = () => {
		const text = buf.join("\n");
		if (text.trim().length === 0 && chapters.length > 0 && level === 0) return;
		chapters.push({
			id: `c${chapters.length}`,
			title,
			level: level || 1,
			body: text,
		});
	};

	for (const line of lines) {
		if (/^```/.test(line.trim())) inFence = !inFence;
		if (!inFence) {
			const m = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
			if (m) {
				flush();
				title = m[2].trim();
				level = m[1].length;
				buf = [line];
				continue;
			}
		}
		buf.push(line);
	}
	flush();

	if (chapters.length === 0) {
		chapters.push({ id: "c0", title: "正文", level: 1, body: md });
	}
	return chapters;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 极简 Markdown → HTML：标题 / 段落 / 列表 / 代码块。完整渲染交给前端 react-markdown。 */
function naiveMarkdownToHtml(md: string): string {
	const lines = md.split(/\r?\n/);
	const out: string[] = [];
	let inFence = false;
	let fenceLang = "";
	let buf: string[] = [];

	const flushFence = () => {
		out.push(
			`<pre class="code-block" data-lang="${escapeHtml(fenceLang)}"><code>${escapeHtml(buf.join("\n"))}</code></pre>`,
		);
		buf = [];
		fenceLang = "";
	};

	for (const line of lines) {
		const fenceMatch = line.match(/^```(.*)$/);
		if (fenceMatch) {
			if (inFence) {
				flushFence();
				inFence = false;
			} else {
				inFence = true;
				fenceLang = fenceMatch[1].trim();
			}
			continue;
		}
		if (inFence) {
			buf.push(line);
			continue;
		}
		const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
		if (h) {
			out.push(`<h${h[1].length}>${escapeHtml(h[2])}</h${h[1].length}>`);
			continue;
		}
		if (/^\s*$/.test(line)) {
			out.push("");
			continue;
		}
		const li = line.match(/^[-*+]\s+(.+)$/);
		if (li) {
			out.push(`<li>${escapeHtml(li[1])}</li>`);
			continue;
		}
		out.push(`<p>${escapeHtml(line)}</p>`);
	}
	if (inFence) flushFence();

	return out
		.join("\n")
		.replace(/(<li>[\s\S]*?<\/li>(\n|$))+/g, (match) => `<ul>${match}</ul>`);
}

export const markdownFormatHandler: FormatHandler = {
	format: "md",

	async parse(absolutePath): Promise<ParsedBook> {
		const md = await fs.readFile(absolutePath, "utf-8");
		const chapters = parseMarkdownChapters(md);
		const toc: ReaderTocItem[] = chapters.map((c) => ({
			id: c.id,
			label: c.title,
			href: c.id,
			level: c.level,
		}));

		// 抽取标题：首个 H1 → 文件名兜底
		const firstH1 = md.match(/^\s*#\s+(.+?)\s*$/m);
		const title =
			firstH1?.[1].trim() ||
			path.basename(absolutePath, path.extname(absolutePath));

		return {
			title,
			authors: [],
			language: null,
			format: "md",
			page_count: null,
			word_count: txtCountWords(md),
			toc,
			metadata: {},
			full_text: md,
			cover: null,
		};
	},

	async getChapter(absolutePath, chapterId): Promise<ChapterContent> {
		const md = await fs.readFile(absolutePath, "utf-8");
		const chapters = parseMarkdownChapters(md);
		const idx = chapters.findIndex((c) => c.id === chapterId);
		const chapter = idx >= 0 ? chapters[idx] : chapters[0];
		const html = naiveMarkdownToHtml(chapter.body);
		return {
			id: chapter.id,
			title: chapter.title,
			html,
			text: chapter.body,
			prev_id: idx > 0 ? chapters[idx - 1].id : null,
			next_id:
				idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1].id : null,
			word_count: txtCountWords(chapter.body),
		};
	},
};
