// 富文本内容渲染器 - 安全渲染 HTML 内容（保留图片/视频等多媒体）

import DOMPurify from "dompurify";
import { useMemo } from "react";

interface RichContentRendererProps {
	html: string;
	className?: string;
}

// DOMPurify 配置
const PURIFY_CONFIG = {
	ALLOWED_TAGS: [
		// 文本格式
		"p",
		"br",
		"span",
		"div",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"strong",
		"b",
		"em",
		"i",
		"u",
		"s",
		"del",
		"ins",
		"blockquote",
		"pre",
		"code",
		// 列表
		"ul",
		"ol",
		"li",
		// 表格
		"table",
		"thead",
		"tbody",
		"tr",
		"th",
		"td",
		// 多媒体
		"img",
		"video",
		"audio",
		"source",
		"picture",
		"figure",
		"figcaption",
		"iframe",
		// 链接
		"a",
		// 其他
		"hr",
		"sup",
		"sub",
		"mark",
	],
	ALLOWED_ATTR: [
		"class",
		"id",
		"style",
		"href",
		"target",
		"rel",
		"src",
		"srcset",
		"sizes",
		"alt",
		"title",
		"width",
		"height",
		"poster",
		"controls",
		"autoplay",
		"muted",
		"loop",
		"playsinline",
		"preload",
		"loading",
		"referrerpolicy",
		"frameborder",
		"allowfullscreen",
		"allow",
		"colspan",
		"rowspan",
		"data-src",
		"data-original",
		"data-lazy-src",
		"data-url",
		"data-actualsrc",
		"data-srcset",
		"data-lazy-srcset",
	],
	ALLOWED_URI_REGEXP:
		/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|asset):|data:|blob:|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
	ALLOW_DATA_ATTR: true,
	ADD_ATTR: ["target"],
};

/**
 * 处理懒加载属性，确保图片能正确显示
 */
function processLazyLoad(html: string): string {
	const lazyAttrs = [
		"data-src",
		"data-original",
		"data-lazy-src",
		"data-url",
		"data-actualsrc",
	];
	let processed = html;

	// 为没有 src 或 src 为空的 img 标签添加 src
	lazyAttrs.forEach((attr) => {
		const regex = new RegExp(
			`<img([^>]*?)${attr}="([^"]+)"([^>]*?)(?:src=""|src="#"|(?!src=))([^>]*?)>`,
			"gi",
		);
		processed = processed.replace(
			regex,
			(match, before, lazySrc, middle, after) => {
				if (match.includes('src="data:') || match.includes("src='data:")) {
					return match;
				}
				return `<img${before}${attr}="${lazySrc}"${middle}src="${lazySrc}"${after}>`;
			},
		);
	});

	return processed;
}

/**
 * 智能处理 HTML 结构，确保语义化标签正确
 * - 将 div 包裹的文本转换为 p 标签
 * - 识别中文标题模式（如"一、研究背景"）并转换为 h2/h3
 * - 确保段落之间有正确的间距
 */
function normalizeHtmlStructure(html: string): string {
	if (typeof window === "undefined" || typeof DOMParser === "undefined") {
		return html;
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	const body = doc.body;

	// 元信息段落：摘要、关键词、作者简介（允许前面有空格）
	const metaKeyPattern = /^\s*(摘要|关键词|作者简介)\s*[：:]/;
	// 一级标题："一、" "二、" 或 "第一章" 等（允许后面有空格）
	const headingPrimaryPattern = /^\s*[一二三四五六七八九十百千]+\s*[、.．]/;
	const headingChapterPattern = /^\s*第[一二三四五六七八九十百千零]+[章节篇部]/;
	// 二级标题："（一）" "（二）" 等
	const headingSecondaryPattern = /^\s*[（(][一二三四五六七八九十百千]+[）)]/;
	const blockTags = new Set(["P", "DIV", "SECTION", "ARTICLE"]);

	// 将直接位于 body 下的纯文本节点转换为段落
	Array.from(body.childNodes).forEach((node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent?.trim();
			if (text) {
				const p = doc.createElement("p");
				p.textContent = text;
				body.insertBefore(p, node);
				body.removeChild(node);
			} else {
				body.removeChild(node);
			}
		}
	});

	const hasBlockChildren = (el: Element) =>
		Array.from(el.children).some((child) => blockTags.has(child.tagName));

	// 将不包含子块元素的 div 视为段落
	Array.from(body.querySelectorAll("div")).forEach((div) => {
		if (!hasBlockChildren(div)) {
			const p = doc.createElement("p");
			p.innerHTML = div.innerHTML;
			div.replaceWith(p);
		}
	});

	const applyParagraphStyle = (el: HTMLElement, indent: boolean) => {
		el.style.textIndent = indent ? "2em" : "0";
		el.style.margin = indent ? "1.4rem 0" : "0.4rem 0";
		el.style.lineHeight = "1.9";
		el.style.display = "block";
	};

	const paragraphs = Array.from(body.querySelectorAll("p")) as HTMLElement[];

	paragraphs.forEach((paragraph) => {
		const textRaw = paragraph.textContent || "";
		const text = textRaw.trim();
		if (!text) return;

		const normalized = text.replace(/\[[0-9]+\]/g, "").trim();

		// 元信息段落：摘要、关键词、作者简介（不受位置限制）
		if (metaKeyPattern.test(normalized)) {
			paragraph.setAttribute("data-meta-paragraph", "true");
			applyParagraphStyle(paragraph, false);
			paragraph.style.fontWeight = "600";
			paragraph.style.color = "#1F2933";
			paragraph.style.fontSize = "0.95rem";
			return;
		}

		if (
			headingPrimaryPattern.test(normalized) ||
			headingChapterPattern.test(normalized)
		) {
			paragraph.setAttribute("data-cn-heading", "major");
			paragraph.style.textIndent = "0";
			paragraph.style.margin = "2.4rem 0 1rem 0";
			paragraph.style.fontWeight = "700";
			paragraph.style.fontSize = "1.2rem";
			paragraph.style.lineHeight = "1.5";
			return;
		}

		if (headingSecondaryPattern.test(normalized)) {
			paragraph.setAttribute("data-cn-heading", "minor");
			paragraph.style.textIndent = "0";
			paragraph.style.margin = "1.8rem 0 0.75rem 0";
			paragraph.style.fontWeight = "600";
			paragraph.style.fontSize = "1.05rem";
			paragraph.style.lineHeight = "1.5";
			return;
		}

		applyParagraphStyle(paragraph, true);
	});

	return body.innerHTML;
}

export function RichContentRenderer({
	html,
	className = "",
}: RichContentRendererProps) {
	const sanitizedHtml = useMemo(() => {
		const processed = processLazyLoad(html);
		return DOMPurify.sanitize(processed, PURIFY_CONFIG);
	}, [html]);

	return (
		<div
			className={className}
			dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
		/>
	);
}

// 带样式的富文本渲染器
export function RichContentWithStyles({
	html,
	className = "",
}: RichContentRendererProps) {
	const sanitizedHtml = useMemo(() => {
		let processed = processLazyLoad(html);
		processed = normalizeHtmlStructure(processed);
		return DOMPurify.sanitize(processed, PURIFY_CONFIG);
	}, [html]);

	return (
		<article
			className={`
        prose prose-zinc dark:prose-invert max-w-none

        /* 标题样式 */
        prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-text-primary dark:prose-headings:text-surface
        prose-h1:text-3xl prose-h1:leading-tight prose-h1:mt-10 prose-h1:mb-6 prose-h1:border-b prose-h1:border-border dark:prose-h1:border-dark-border prose-h1:pb-3
        prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
        prose-h3:text-xl prose-h3:mt-7 prose-h3:mb-3
        prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-2.5

        /* 段落样式 */
        prose-p:text-base prose-p:leading-[1.9] prose-p:my-5 prose-p:text-text-secondary dark:prose-p:text-cream-200 prose-p:tracking-wide

        /* 图片样式 */
        prose-img:rounded-2xl prose-img:shadow-[0_20px_45px_rgba(0,0,0,0.08)] prose-img:my-8 prose-img:mx-auto prose-img:max-w-full

        /* 视频样式 */
        prose-video:rounded-2xl prose-video:shadow-lg prose-video:my-8 prose-video:mx-auto

        /* 链接样式 */
        prose-a:text-focus dark:prose-a:text-focus prose-a:no-underline hover:prose-a:underline

        /* 引用块样式 */
        prose-blockquote:border-l-[3px] prose-blockquote:border-cream-400 dark:prose-blockquote:border-cream-500
        prose-blockquote:pl-5 prose-blockquote:py-2 prose-blockquote:my-6
        prose-blockquote:italic prose-blockquote:text-text-secondary dark:prose-blockquote:text-text-light
        prose-blockquote:bg-warm-50/70 dark:prose-blockquote:bg-surface/5 prose-blockquote:rounded-r-2xl

        /* 代码样式 */
        prose-pre:bg-console-canvas dark:prose-pre:bg-black prose-pre:text-sm prose-pre:text-surface prose-pre:rounded-2xl prose-pre:my-6 prose-pre:px-6 prose-pre:py-4
        prose-code:text-text-primary dark:prose-code:text-surface
        prose-code:bg-warm-200/80 dark:prose-code:bg-surface/10 prose-code:px-2 prose-code:py-0.5 prose-code:rounded-lg
        prose-code:before:content-none prose-code:after:content-none prose-code:font-medium

        /* 列表样式 */
        prose-ul:my-5 prose-ul:pl-7 prose-ul:space-y-2
        prose-ol:my-5 prose-ol:pl-7 prose-ol:space-y-2
        prose-li:leading-7 prose-li:text-text-secondary dark:prose-li:text-cream-200 prose-li:marker:text-text-light

        /* 表格样式 */
        prose-table:my-6 prose-table:w-full prose-table:border-collapse
        prose-th:bg-warm-200 dark:prose-th:bg-dark-surface prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:text-sm prose-th:font-semibold
        prose-td:px-4 prose-td:py-2 prose-td:border-b prose-td:border-border dark:prose-td:border-dark-border prose-td:text-base

        /* 分割线 */
        prose-hr:my-10 prose-hr:border-border dark:prose-hr:border-dark-border

        /* 其他 */
        prose-figure:my-8
        prose-figcaption:text-sm prose-figcaption:text-text-muted dark:prose-figcaption:text-text-light prose-figcaption:text-center

        ${className}
      `}
			dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
		/>
	);
}

export default RichContentRenderer;
