import fs from "node:fs/promises";
import path from "node:path";

import { JSDOM, VirtualConsole } from "jsdom";

import type { ReaderTocItem } from "../../../shared/ipc-schema";
import type { ChapterContent, FormatHandler, ParsedBook } from "./types";
import { txtCountWords } from "./txt";

function buildTocFromHeadings(doc: Document): ReaderTocItem[] {
	const headings = Array.from(
		doc.querySelectorAll("h1, h2, h3"),
	) as HTMLHeadingElement[];

	const toc: ReaderTocItem[] = [];
	headings.forEach((el, idx) => {
		const id = el.id || `h-${idx}`;
		if (!el.id) el.id = id;
		toc.push({
			id,
			label: (el.textContent || "").trim() || `章节 ${idx + 1}`,
			href: id,
			level: Number(el.tagName.replace("H", "")) || 1,
		});
	});
	return toc;
}

function splitDocByHeadings(doc: Document): Array<{
	id: string;
	title: string;
	html: string;
	text: string;
}> {
	const body = doc.body;
	if (!body) return [];

	const allChildren = Array.from(body.children);
	const sections: Array<{ id: string; title: string; nodes: Element[] }> = [];

	let current: { id: string; title: string; nodes: Element[] } = {
		id: "h-intro",
		title: "前言",
		nodes: [],
	};

	const isHeading = (el: Element) => /^H[1-3]$/.test(el.tagName);

	for (const el of allChildren) {
		if (isHeading(el)) {
			if (current.nodes.length > 0 || sections.length === 0) {
				sections.push(current);
			}
			const id = el.id || `h-${sections.length}`;
			el.id = id;
			current = {
				id,
				title: (el.textContent || "").trim() || "未命名章节",
				nodes: [el],
			};
		} else {
			current.nodes.push(el);
		}
	}
	if (current.nodes.length > 0) sections.push(current);

	return sections.map((s) => {
		const html = s.nodes.map((n) => n.outerHTML).join("\n");
		const text = s.nodes.map((n) => n.textContent || "").join("\n");
		return { id: s.id, title: s.title, html, text };
	});
}

export const htmlFormatHandler: FormatHandler = {
	format: "html",

	async parse(absolutePath): Promise<ParsedBook> {
		const html = await fs.readFile(absolutePath, "utf-8");
		const virtualConsole = new VirtualConsole();
		const dom = new JSDOM(html, { virtualConsole });
		const doc = dom.window.document;

		// 优先用 readability 提取主内容
		let mainHtml = doc.documentElement.outerHTML;
		try {
			const { Readability } = await import("@mozilla/readability");
			const article = new Readability(doc.cloneNode(true) as Document).parse();
			if (article?.content) mainHtml = article.content;
		} catch {}

		const cleanedDom = new JSDOM(mainHtml, { virtualConsole });
		const cleanedDoc = cleanedDom.window.document;

		const title =
			(doc.querySelector("title")?.textContent || "").trim() ||
			path.basename(absolutePath, path.extname(absolutePath));

		const language = doc.documentElement.getAttribute("lang") || null;
		const toc = buildTocFromHeadings(cleanedDoc);

		const fullText = cleanedDoc.body?.textContent || "";

		return {
			title,
			authors: [],
			language,
			format: "html",
			page_count: null,
			word_count: txtCountWords(fullText),
			toc,
			metadata: {},
			full_text: fullText,
			cover: null,
		};
	},

	async getChapter(
		absolutePath,
		chapterId,
		_toc: ReaderTocItem[],
	): Promise<ChapterContent> {
		const html = await fs.readFile(absolutePath, "utf-8");
		const virtualConsole = new VirtualConsole();
		const dom = new JSDOM(html, { virtualConsole });
		let mainHtml = dom.window.document.documentElement.outerHTML;
		try {
			const { Readability } = await import("@mozilla/readability");
			const article = new Readability(
				dom.window.document.cloneNode(true) as Document,
			).parse();
			if (article?.content) mainHtml = article.content;
		} catch {}
		const cleanedDom = new JSDOM(mainHtml, { virtualConsole });
		const sections = splitDocByHeadings(cleanedDom.window.document);

		if (sections.length === 0) {
			return {
				id: "h-intro",
				title: "正文",
				html: cleanedDom.window.document.body?.innerHTML || "",
				text: cleanedDom.window.document.body?.textContent || "",
				prev_id: null,
				next_id: null,
				word_count: txtCountWords(
					cleanedDom.window.document.body?.textContent || "",
				),
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
