import path from "node:path";

import StreamZip from "node-stream-zip";
import { JSDOM, VirtualConsole } from "jsdom";

import type { ReaderTocItem } from "../../../shared/ipc-schema";
import type { ChapterContent, FormatHandler, ParsedBook } from "./types";
import { extToMime } from "../coverCache";
import { txtCountWords } from "./txt";

type Manifest = Map<
	string,
	{ href: string; mediaType: string; properties?: string }
>;
type SpineItem = { idref: string; href: string; mediaType: string };

async function openZip(
	absolutePath: string,
): Promise<StreamZip.StreamZipAsync> {
	return new StreamZip.async({ file: absolutePath, storeEntries: true });
}

function safeXmlParse(xml: string): Document {
	const virtualConsole = new VirtualConsole();
	return new JSDOM(xml, { contentType: "text/xml", virtualConsole }).window
		.document as unknown as Document;
}

async function readEntryText(
	zip: StreamZip.StreamZipAsync,
	name: string,
): Promise<string> {
	const buf = await zip.entryData(name);
	return buf.toString("utf-8");
}

async function readEntryBuffer(
	zip: StreamZip.StreamZipAsync,
	name: string,
): Promise<Buffer> {
	return zip.entryData(name);
}

async function findOpfPath(zip: StreamZip.StreamZipAsync): Promise<string> {
	const containerXml = await readEntryText(zip, "META-INF/container.xml");
	const doc = safeXmlParse(containerXml);
	const rootfile =
		doc.querySelector("rootfile") || doc.getElementsByTagName("rootfile")[0];
	const fullPath = rootfile?.getAttribute("full-path");
	if (!fullPath) throw new Error("EPUB container.xml 缺 rootfile");
	return fullPath;
}

function parseOpfManifest(
	opfDoc: Document,
	opfDir: string,
): {
	manifest: Manifest;
	spine: SpineItem[];
	metadata: Record<string, unknown>;
	navHref: string | null;
	ncxHref: string | null;
	coverHref: string | null;
} {
	const manifest: Manifest = new Map();
	const items = Array.from(
		opfDoc.querySelectorAll("manifest > item, item"),
	).filter((el) => el.tagName.toLowerCase().endsWith("item"));

	let navHref: string | null = null;
	let ncxHref: string | null = null;
	let coverHref: string | null = null;

	for (const el of items) {
		const id = el.getAttribute("id") || "";
		const href = el.getAttribute("href") || "";
		const mediaType = el.getAttribute("media-type") || "";
		const properties = el.getAttribute("properties") || undefined;
		if (!id) continue;
		const fullHref = path.posix.join(opfDir, href);
		manifest.set(id, { href: fullHref, mediaType, properties });

		if (properties?.includes("nav")) navHref = fullHref;
		if (mediaType === "application/x-dtbncx+xml") ncxHref = fullHref;
		if (properties?.includes("cover-image")) coverHref = fullHref;
	}

	const spineEls = Array.from(opfDoc.querySelectorAll("spine itemref"));
	const spine: SpineItem[] = [];
	for (const el of spineEls) {
		const idref = el.getAttribute("idref") || "";
		const item = manifest.get(idref);
		if (!item) continue;
		spine.push({ idref, href: item.href, mediaType: item.mediaType });
	}

	const meta: Record<string, unknown> = {};
	const metaEls = Array.from(opfDoc.querySelectorAll("metadata > *"));
	for (const el of metaEls) {
		const key = el.tagName.toLowerCase().replace(/^.*:/, "");
		const value = (el.textContent || "").trim();
		if (!key || !value) continue;
		const existing = meta[key];
		if (Array.isArray(existing)) {
			existing.push(value);
		} else if (existing != null) {
			meta[key] = [existing, value];
		} else {
			meta[key] = value;
		}
	}

	if (!coverHref) {
		const coverMeta = opfDoc.querySelector('metadata > meta[name="cover"]');
		const idref = coverMeta?.getAttribute("content");
		if (idref) {
			const item = manifest.get(idref);
			if (item) coverHref = item.href;
		}
	}

	return { manifest, spine, metadata: meta, navHref, ncxHref, coverHref };
}

function parseNavToToc(html: string, navHrefDir: string): ReaderTocItem[] {
	const dom = new JSDOM(html, { contentType: "application/xhtml+xml" });
	const doc = dom.window.document;
	const navList = doc.querySelector("nav[*|type='toc'] ol, nav ol");
	if (!navList) return [];
	const walk = (ol: Element, level: number): ReaderTocItem[] => {
		const items: ReaderTocItem[] = [];
		const lis = Array.from(ol.children).filter(
			(el) => el.tagName.toLowerCase() === "li",
		);
		for (const li of lis) {
			const link = li.querySelector("a");
			if (!link) continue;
			const label = (link.textContent || "").trim() || "未命名";
			const href = link.getAttribute("href") || "";
			const fullHref = href
				? path.posix.normalize(path.posix.join(navHrefDir, href))
				: "";
			const child = li.querySelector("ol");
			items.push({
				id: fullHref || label,
				label,
				href: fullHref,
				level,
				children: child ? walk(child, level + 1) : undefined,
			});
		}
		return items;
	};
	return walk(navList, 1);
}

function parseNcxToToc(xml: string, ncxDir: string): ReaderTocItem[] {
	const doc = safeXmlParse(xml);
	const navMap =
		doc.querySelector("navMap") || doc.getElementsByTagName("navMap")[0];
	if (!navMap) return [];
	const walk = (parent: Element, level: number): ReaderTocItem[] => {
		const items: ReaderTocItem[] = [];
		const points = Array.from(parent.children).filter(
			(el) => el.tagName.toLowerCase() === "navpoint",
		);
		for (const np of points) {
			const label =
				(np.querySelector("navLabel text")?.textContent || "").trim() ||
				"未命名";
			const src = np.querySelector("content")?.getAttribute("src") || "";
			const fullHref = src
				? path.posix.normalize(path.posix.join(ncxDir, src))
				: "";
			items.push({
				id: fullHref || label,
				label,
				href: fullHref,
				level,
				children: walk(np, level + 1),
			});
		}
		return items;
	};
	return walk(navMap, 1);
}

function flattenToc(items: ReaderTocItem[]): ReaderTocItem[] {
	const out: ReaderTocItem[] = [];
	const walk = (arr: ReaderTocItem[]) => {
		for (const it of arr) {
			out.push(it);
			if (it.children) walk(it.children);
		}
	};
	walk(items);
	return out;
}

function findSpineIndexByHref(spine: SpineItem[], href: string): number {
	const target = href.split("#")[0];
	return spine.findIndex((s) => s.href === target);
}

async function rewriteResources(
	html: string,
	zip: StreamZip.StreamZipAsync,
	chapterDir: string,
): Promise<{ html: string; images: ChapterContent["images"] }> {
	const dom = new JSDOM(html, { contentType: "application/xhtml+xml" });
	const doc = dom.window.document;
	const images: ChapterContent["images"] = [];

	const imgs = Array.from(doc.querySelectorAll("img"));
	for (const img of imgs) {
		const src = img.getAttribute("src");
		if (!src || /^https?:/.test(src) || src.startsWith("data:")) continue;
		const resolved = path.posix.normalize(path.posix.join(chapterDir, src));
		try {
			const buf = await readEntryBuffer(zip, resolved);
			const ext = path.extname(resolved).toLowerCase() || ".png";
			const mime = extToMime(ext);
			const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
			img.setAttribute("src", dataUrl);
			img.setAttribute("loading", "lazy");
			images!.push({ name: resolved, data_url: dataUrl, mime });
		} catch {}
	}

	// 移除外链 CSS / 脚本（避免抽稀阅读体验）
	for (const link of Array.from(
		doc.querySelectorAll("link[rel='stylesheet']"),
	)) {
		link.remove();
	}
	for (const script of Array.from(doc.querySelectorAll("script"))) {
		script.remove();
	}

	return { html: doc.body?.innerHTML || doc.documentElement.outerHTML, images };
}

export const epubFormatHandler: FormatHandler = {
	format: "epub",

	async parse(absolutePath): Promise<ParsedBook> {
		const zip = await openZip(absolutePath);
		try {
			const opfPath = await findOpfPath(zip);
			const opfDir = path.posix.dirname(opfPath);
			const opfText = await readEntryText(zip, opfPath);
			const opfDoc = safeXmlParse(opfText);
			const { manifest, spine, metadata, navHref, ncxHref, coverHref } =
				parseOpfManifest(opfDoc, opfDir);

			let toc: ReaderTocItem[] = [];
			if (navHref) {
				try {
					const navHtml = await readEntryText(zip, navHref);
					toc = parseNavToToc(navHtml, path.posix.dirname(navHref));
				} catch {}
			}
			if (toc.length === 0 && ncxHref) {
				try {
					const ncxXml = await readEntryText(zip, ncxHref);
					toc = parseNcxToToc(ncxXml, path.posix.dirname(ncxHref));
				} catch {}
			}
			if (toc.length === 0) {
				// 退化：用 spine 顺序
				toc = spine.map((s, idx) => ({
					id: s.href,
					label: `章节 ${idx + 1}`,
					href: s.href,
					level: 1,
				}));
			}

			// 标题 / 作者
			const title =
				(typeof metadata.title === "string" ? metadata.title : "") ||
				(Array.isArray(metadata.title) ? String(metadata.title[0]) : "") ||
				path.basename(absolutePath, path.extname(absolutePath));
			const creator = metadata.creator;
			const authors = Array.isArray(creator)
				? creator.map((c) => String(c))
				: typeof creator === "string"
					? [creator]
					: [];
			const language =
				typeof metadata.language === "string"
					? metadata.language
					: Array.isArray(metadata.language)
						? String(metadata.language[0])
						: null;

			// 全文（用于 KB 全文索引）
			const fullTextParts: string[] = [];
			for (const item of spine) {
				try {
					const html = await readEntryText(zip, item.href);
					const dom = new JSDOM(html, { contentType: "application/xhtml+xml" });
					fullTextParts.push(dom.window.document.body?.textContent || "");
				} catch {}
			}
			const fullText = fullTextParts.join("\n\n").trim();

			// 封面：优先 coverHref，其次 manifest 内 image 类型 + 文件名包含 cover
			let cover: ParsedBook["cover"] = null;
			let resolvedCoverHref = coverHref;
			if (!resolvedCoverHref) {
				for (const [, item] of manifest) {
					if (item.mediaType.startsWith("image/") && /cover/i.test(item.href)) {
						resolvedCoverHref = item.href;
						break;
					}
				}
			}
			if (resolvedCoverHref) {
				try {
					const buf = await readEntryBuffer(zip, resolvedCoverHref);
					const ext = path.extname(resolvedCoverHref).toLowerCase() || ".png";
					cover = { bytes: new Uint8Array(buf), mime: extToMime(ext) };
				} catch {}
			}

			return {
				title,
				authors,
				language,
				format: "epub",
				page_count: spine.length,
				word_count: txtCountWords(fullText),
				toc,
				metadata: { ...metadata, _spine_count: spine.length, _opf: opfPath },
				full_text: fullText,
				cover,
			};
		} finally {
			await zip.close();
		}
	},

	async getChapter(absolutePath, chapterId, toc): Promise<ChapterContent> {
		const zip = await openZip(absolutePath);
		try {
			const opfPath = await findOpfPath(zip);
			const opfDir = path.posix.dirname(opfPath);
			const opfText = await readEntryText(zip, opfPath);
			const opfDoc = safeXmlParse(opfText);
			const { spine } = parseOpfManifest(opfDoc, opfDir);
			const flatToc = flattenToc(toc);

			let targetHref = chapterId.split("#")[0];
			if (!targetHref) targetHref = spine[0]?.href || "";
			let idx = findSpineIndexByHref(spine, targetHref);

			// 用 toc 兜底（chapterId 来自 toc.href）
			if (idx < 0 && flatToc.length > 0) {
				const tocItem = flatToc.find((t) => t.href === chapterId);
				if (tocItem) idx = findSpineIndexByHref(spine, tocItem.href);
			}
			if (idx < 0) idx = 0;
			const item = spine[idx];
			if (!item) {
				return {
					id: chapterId,
					title: "未找到章节",
					html: "",
					text: "",
					prev_id: null,
					next_id: null,
					word_count: 0,
				};
			}

			const rawHtml = await readEntryText(zip, item.href);
			const chapterDir = path.posix.dirname(item.href);
			const { html, images } = await rewriteResources(rawHtml, zip, chapterDir);
			const dom = new JSDOM(rawHtml, { contentType: "application/xhtml+xml" });
			const text = dom.window.document.body?.textContent || "";

			const titleFromToc = flatToc.find((t) => t.href === item.href)?.label;
			const titleFromDoc = (
				dom.window.document.querySelector("h1, h2, title")?.textContent || ""
			).trim();

			return {
				id: item.href,
				title: titleFromToc || titleFromDoc || `章节 ${idx + 1}`,
				html,
				text,
				images,
				prev_id: idx > 0 ? spine[idx - 1].href : null,
				next_id: idx < spine.length - 1 ? spine[idx + 1].href : null,
				word_count: txtCountWords(text),
			};
		} finally {
			await zip.close();
		}
	},
};
