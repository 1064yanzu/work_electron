/**
 * Wiki 内容渲染器 - 支持 [[wikilink]] 双向链接语法
 */
import type { WikiPageItem } from "./useWiki";

interface WikiContentRendererProps {
	content: string;
	pages: WikiPageItem[];
	onNavigate: (page: WikiPageItem) => void;
}

/**
 * 将 [[wikilink]] 语法解析为可点击链接，并渲染 Markdown 基础格式
 */
export function WikiContentRenderer({
	content,
	pages,
	onNavigate,
}: WikiContentRendererProps) {
	const pageMap = new Map(pages.map((p) => [p.title, p]));

	// 解析内容为段落和链接
	const elements = parseWikiContent(content, pageMap, onNavigate);

	return (
		<div className="wiki-content prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
			{elements}
		</div>
	);
}

function parseWikiContent(
	content: string,
	pageMap: Map<string, WikiPageItem>,
	onNavigate: (page: WikiPageItem) => void,
) {
	// 按行分割
	const lines = content.split("\n");
	const elements: React.ReactNode[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// 标题
		if (line.startsWith("### ")) {
			elements.push(
				<h4
					key={i}
					className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mt-4 mb-2"
				>
					{renderInline(line.slice(4), pageMap, onNavigate, i)}
				</h4>,
			);
		} else if (line.startsWith("## ")) {
			elements.push(
				<h3
					key={i}
					className="text-base font-semibold text-zinc-800 dark:text-zinc-100 mt-5 mb-2"
				>
					{renderInline(line.slice(3), pageMap, onNavigate, i)}
				</h3>,
			);
		} else if (line.startsWith("# ")) {
			elements.push(
				<h2
					key={i}
					className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mt-6 mb-3"
				>
					{renderInline(line.slice(2), pageMap, onNavigate, i)}
				</h2>,
			);
		} else if (line.startsWith("- ")) {
			elements.push(
				<li key={i} className="ml-4 list-disc text-sm">
					{renderInline(line.slice(2), pageMap, onNavigate, i)}
				</li>,
			);
		} else if (line.trim() === "") {
			elements.push(<div key={i} className="h-2" />);
		} else {
			elements.push(
				<p key={i} className="mb-1.5">
					{renderInline(line, pageMap, onNavigate, i)}
				</p>,
			);
		}
	}

	return elements;
}

function renderInline(
	text: string,
	pageMap: Map<string, WikiPageItem>,
	onNavigate: (page: WikiPageItem) => void,
	lineKey: number,
): React.ReactNode[] {
	// 解析 [[wikilink]] 和 **bold** 和 `code`
	const parts: React.ReactNode[] = [];
	const regex = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|`([^`]+)`/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		// 添加匹配前的纯文本
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}

		if (match[1]) {
			// [[wikilink]]
			const linkTitle = match[1];
			const targetPage = pageMap.get(linkTitle);
			if (targetPage) {
				parts.push(
					<button
						key={`${lineKey}-link-${match.index}`}
						type="button"
						onClick={() => onNavigate(targetPage)}
						className="inline text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors cursor-pointer font-medium"
					>
						{linkTitle}
					</button>,
				);
			} else {
				// 链接目标不存在，显示为灰色
				parts.push(
					<span
						key={`${lineKey}-link-${match.index}`}
						className="text-zinc-400 dark:text-zinc-500"
						title={`页面「${linkTitle}」尚未创建`}
					>
						[[{linkTitle}]]
					</span>,
				);
			}
		} else if (match[2]) {
			// **bold**
			parts.push(
				<strong
					key={`${lineKey}-bold-${match.index}`}
					className="font-semibold text-zinc-800 dark:text-zinc-200"
				>
					{match[2]}
				</strong>,
			);
		} else if (match[3]) {
			// `code`
			parts.push(
				<code
					key={`${lineKey}-code-${match.index}`}
					className="px-1 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded font-mono text-primary/80"
				>
					{match[3]}
				</code>,
			);
		}

		lastIndex = match.index + match[0].length;
	}

	// 添加剩余文本
	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts;
}
