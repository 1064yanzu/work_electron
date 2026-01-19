import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { sanitizeHtml } from "./sanitizeHtml";

export type ExtractedArticle = {
	text: string;
	html: string | null;
	title?: string;
	byline?: string;
	excerpt?: string;
};

function absolutizeUrl(baseUrl: string, raw: string): string {
	try {
		return new URL(raw, baseUrl).toString();
	} catch {
		return raw;
	}
}

function absolutizeHtmlResourceUrls(html: string, baseUrl: string): string {
	try {
		const virtualConsole = new VirtualConsole();
		const dom = new JSDOM(`<body>${html}</body>`, {
			url: baseUrl,
			virtualConsole,
		});
		const doc = dom.window.document as unknown as Document;
		for (const el of Array.from(doc.querySelectorAll("a[href]"))) {
			const href = el.getAttribute("href");
			if (!href) continue;
			el.setAttribute("href", absolutizeUrl(baseUrl, href));
		}
		for (const el of Array.from(doc.querySelectorAll("img[src]"))) {
			const src = el.getAttribute("src");
			if (!src) continue;
			el.setAttribute("src", absolutizeUrl(baseUrl, src));
		}
		for (const el of Array.from(doc.querySelectorAll("source[srcset]"))) {
			const srcset = el.getAttribute("srcset");
			if (!srcset) continue;
			const next = srcset
				.split(",")
				.map((part: string) => part.trim())
				.filter(Boolean)
				.map((part: string) => {
					const [u, ...rest] = part.split(/\s+/);
					if (!u) return part;
					return [absolutizeUrl(baseUrl, u), ...rest].join(" ").trim();
				})
				.join(", ");
			el.setAttribute("srcset", next);
		}
		return doc.body?.innerHTML || html;
	} catch {
		return html;
	}
}

export function extractArticleFromHtml(input: {
	html: string;
	url: string;
	titleHint?: string;
}): ExtractedArticle {
	const rawHtml = input.html?.trim() || "";
	if (!rawHtml) return { text: "", html: null };

	try {
		const virtualConsole = new VirtualConsole();
		const dom = new JSDOM(sanitizeHtml(rawHtml), {
			url: input.url,
			virtualConsole,
		});
		const reader = new Readability(dom.window.document as unknown as Document, {
			charThreshold: 250,
		});
		const parsed = reader.parse();

		if (!parsed) {
			return { text: "", html: null };
		}

		const contentHtml = parsed.content?.trim() || "";
		const safeHtml = contentHtml
			? sanitizeHtml(absolutizeHtmlResourceUrls(contentHtml, input.url))
			: null;
		const text = (parsed.textContent || "").trim();

		return {
			text,
			html: safeHtml,
			title: (parsed.title || input.titleHint || "").trim() || undefined,
			byline: (parsed.byline || "").trim() || undefined,
			excerpt: (parsed.excerpt || "").trim() || undefined,
		};
	} catch {
		return { text: "", html: null };
	}
}
