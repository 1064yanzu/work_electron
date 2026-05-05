import path from "node:path";

import mammoth from "mammoth";
import { JSDOM, VirtualConsole } from "jsdom";

import type { ReaderTocItem } from "../../../shared/ipc-schema";
import type { ChapterContent, FormatHandler, ParsedBook } from "./types";
import { txtCountWords } from "./txt";

function ensureHeadingIds(doc: Document): void {
	const headings = Array.from(doc.querySelectorAll("h1, h2, h3"));
	headings.forEach((h, idx) => {
		if (!h.id) h.id = `h-${idx}`;
	});
}

function buildToc(doc: Document): ReaderTocItem[] {
	const headings = Array.from(
		doc.querySelectorAll("h1, h2, h3"),
	) as HTMLElement[];
	return headings.map((h, idx) => ({
		id: h.id || `h-${idx}`,
		label: (h.textContent || "").trim() || `章节 ${idx + 1}`,
		href: h.id || `h-${idx}`,
		level: Number(h.tagName.replace("H", "")) || 1,
	}));
}

function splitByHeadings(doc: Document): Array<{
	id: string;
	title: string;
	html: string;
	text: string;
}> {
	const body = doc.body;
	if (!body) return [];
	const children = Array.from(body.children);

	const isH = (el: Element) => /^H[1-3]$/.test(el.tagName);
	const sections: Array<{ id: string; title: string; nodes: Element[] }> = [];
	let cur: { id: string; title: string; nodes: Element[] } = {
		id: "h-intro",
		title: "正文开头",
		nodes: [],
	};
	for (const el of children) {
		if (isH(el)) {
			if (cur.nodes.length > 0 || sections.length === 0) sections.push(cur);
			cur = {
				id: el.id || `h-${sections.length}`,
				title: (el.textContent || "").trim() || "未命名章节",
				nodes: [el],
			};
		} else {
			cur.nodes.push(el);
		}
	}
	if (cur.nodes.length > 0) sections.push(cur);

	return sections.map((s) => ({
		id: s.id,
		title: s.title,
		html: s.nodes.map((n) => n.outerHTML).join("\n"),
		text: s.nodes.map((n) => n.textContent || "").join("\n"),
	}));
}

export const docxFormatHandler: FormatHandler = {
	format: "docx",

	async parse(absolutePath): Promise<ParsedBook> {
		const result = await mammoth.convertToHtml({ path: absolutePath });
		const html = result.value || "";

		const virtualConsole = new VirtualConsole();
		const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
			virtualConsole,
		});
		const doc = dom.window.document;
		ensureHeadingIds(doc);

		const toc = buildToc(doc);
		const fullText = doc.body?.textContent || "";

		return {
			title: path.basename(absolutePath, path.extname(absolutePath)),
			authors: [],
			language: null,
			format: "docx",
			page_count: null,
			word_count: txtCountWords(fullText),
			toc,
			metadata: {
				docx_warnings: result.messages?.map((m) => m.message) ?? [],
			},
			full_text: fullText,
			cover: null,
		};
	},

	async getChapter(absolutePath, chapterId): Promise<ChapterContent> {
		const result = await mammoth.convertToHtml({ path: absolutePath });
		const html = result.value || "";
		const virtualConsole = new VirtualConsole();
		const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
			virtualConsole,
		});
		const doc = dom.window.document;
		ensureHeadingIds(doc);
		const sections = splitByHeadings(doc);

		if (sections.length === 0) {
			return {
				id: "h-intro",
				title: "正文",
				html,
				text: doc.body?.textContent || "",
				prev_id: null,
				next_id: null,
				word_count: txtCountWords(doc.body?.textContent || ""),
			};
		}
		let idx = sections.findIndex((s) => s.id === chapterId);
		if (idx < 0) idx = 0;
		const s = sections[idx];
		return {
			id: s.id,
			title: s.title,
			html: s.html,
			text: s.text,
			prev_id: idx > 0 ? sections[idx - 1].id : null,
			next_id: idx < sections.length - 1 ? sections[idx + 1].id : null,
			word_count: txtCountWords(s.text),
		};
	},
};
