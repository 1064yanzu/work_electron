import type { ReaderTocItem } from "../../../lib/api/reader";

function flattenToc(toc: ReaderTocItem[]): ReaderTocItem[] {
	const out: ReaderTocItem[] = [];
	const walk = (items: ReaderTocItem[]) => {
		for (const item of items) {
			out.push(item);
			if (item.children) walk(item.children);
		}
	};
	walk(toc);
	return out;
}

export function normalizeReaderHref(value: string): string {
	const withoutQuery = value.split("?")[0] ?? value;
	const decoded = (() => {
		try {
			return decodeURIComponent(withoutQuery);
		} catch {
			return withoutQuery;
		}
	})();
	return decoded.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function dirname(value: string): string {
	const base = value.split("#")[0] ?? value;
	const idx = base.lastIndexOf("/");
	return idx >= 0 ? base.slice(0, idx) : "";
}

function collapsePathSegments(value: string): string {
	const [pathname, fragment] = value.split("#", 2);
	const stack: string[] = [];
	for (const segment of pathname.split("/")) {
		if (!segment || segment === ".") continue;
		if (segment === "..") stack.pop();
		else stack.push(segment);
	}
	return `${stack.join("/")}${fragment ? `#${fragment}` : ""}`;
}

function findTocHref(
	toc: ReaderTocItem[],
	normalizedHref: string,
): string | null {
	const normalizedBase = normalizedHref.split("#")[0] ?? normalizedHref;
	const items = flattenToc(toc);
	const exact = items.find(
		(item) => normalizeReaderHref(item.href || item.id) === normalizedHref,
	);
	if (exact) return exact.href;

	const baseMatch = items.find((item) => {
		const itemHref = normalizeReaderHref(item.href || item.id);
		return itemHref.split("#")[0] === normalizedBase;
	});
	if (!baseMatch) return null;

	return normalizedHref.includes("#") ? normalizedHref : baseMatch.href;
}

export function resolveReaderInternalHref({
	rawHref,
	currentChapterId,
	requestedChapterId,
	toc,
}: {
	rawHref: string;
	currentChapterId: string | undefined;
	requestedChapterId: string | null | undefined;
	toc: ReaderTocItem[];
}): string | null {
	const href = rawHref.trim();
	if (!href || /^(https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(href)) {
		return null;
	}

	const directHref = normalizeReaderHref(href);
	const directTocHref = findTocHref(toc, directHref);
	if (directTocHref) return directTocHref;

	const current = requestedChapterId || currentChapterId || "";
	const currentBase = normalizeReaderHref(current).split("#")[0] ?? "";
	const resolved = href.startsWith("#")
		? `${currentBase}${href}`
		: href.startsWith("/")
			? directHref
			: collapsePathSegments(`${dirname(currentBase)}/${directHref}`);

	const normalized = normalizeReaderHref(resolved);
	return findTocHref(toc, normalized) || normalized;
}

export function findReaderAnchorTarget(
	article: HTMLElement,
	fragment: string,
): HTMLElement | null {
	const decoded = (() => {
		try {
			return decodeURIComponent(fragment);
		} catch {
			return fragment;
		}
	})();
	const candidates = [fragment, decoded].filter(Boolean);
	for (const candidate of candidates) {
		const idEscaped =
			typeof CSS !== "undefined" && typeof CSS.escape === "function"
				? CSS.escape(candidate)
				: candidate.replace(/["\\]/g, "\\$&");
		const attrEscaped = candidate.replace(/["\\]/g, "\\$&");
		const target = article.querySelector<HTMLElement>(
			`#${idEscaped}, [name="${attrEscaped}"]`,
		);
		if (target) return target;
	}
	return null;
}

export function getReaderScrollContainer(engine: HTMLElement): HTMLElement {
	if (engine.classList.contains("reader-engine--paged")) return engine;
	return (engine.closest(".reader-main") as HTMLElement | null) ?? engine;
}

export function scrollToReaderTarget(
	engine: HTMLElement,
	target: HTMLElement,
	behavior: ScrollBehavior,
) {
	const scroll = getReaderScrollContainer(engine);
	const scrollRect = scroll.getBoundingClientRect();
	const targetRect = target.getBoundingClientRect();
	if (scroll === engine && engine.classList.contains("reader-engine--paged")) {
		const left = scroll.scrollLeft + targetRect.left - scrollRect.left - 32;
		scroll.scrollTo({ left: Math.max(0, left), top: 0, behavior });
		return;
	}

	const top = scroll.scrollTop + targetRect.top - scrollRect.top - 32;
	scroll.scrollTo({ left: 0, top: Math.max(0, top), behavior });
}

/**
 * 找到 article 容器内"第 offset 个可见字符"所属的块级元素。
 *
 * 用途：高亮 / 书签 click 跳转 — locator 形如 `chapter:xxx:offset:1234`，
 * 1234 是该字符在 article.textContent 中的位置；我们要把它对应到
 * 真正可滚动的祖先块级元素（p / h2 / blockquote / li / ...），交给
 * scrollToReaderTarget 滚到视口。
 *
 * 实现：用 TreeWalker 走 textNode，累计字符长度找到包含 offset 的节点，
 * 然后回溯到第一个块级祖先（找不到则用 textNode.parentElement 兜底）。
 */
const READER_BLOCK_TAGS = new Set([
	"P",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"BLOCKQUOTE",
	"LI",
	"PRE",
	"DIV",
	"SECTION",
	"ARTICLE",
	"FIGURE",
]);

function findBlockAncestor(
	article: HTMLElement,
	node: Node,
): HTMLElement | null {
	let cur: Node | null =
		node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
	while (cur && cur !== article) {
		if (cur.nodeType === Node.ELEMENT_NODE) {
			const el = cur as HTMLElement;
			if (READER_BLOCK_TAGS.has(el.tagName)) return el;
		}
		cur = cur.parentNode;
	}
	if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
		return node.parentElement;
	}
	return null;
}

export function findReaderOffsetElement(
	article: HTMLElement,
	offset: number,
): HTMLElement | null {
	if (offset < 0) return null;
	const walker = article.ownerDocument!.createTreeWalker(
		article,
		NodeFilter.SHOW_TEXT,
	);
	let acc = 0;
	let last: Text | null = null;
	let node = walker.nextNode() as Text | null;
	while (node) {
		const len = node.nodeValue?.length ?? 0;
		if (acc + len >= offset) {
			return findBlockAncestor(article, node);
		}
		acc += len;
		last = node;
		node = walker.nextNode() as Text | null;
	}
	// offset 超出文本总长 → 退回最后一段
	if (last) return findBlockAncestor(article, last);
	return null;
}
