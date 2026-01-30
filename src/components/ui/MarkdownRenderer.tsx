import { memo, useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { InlineImage } from "./InlineImage";
import { isTauriUnavailableError, safeInvoke } from "../../lib/tauriBridge";
import MermaidRenderer from "./MermaidRenderer";
import { WebPreviewCard } from "../chat/WebPreviewCard";

function isAllowedImageDataUrl(url: string) {
	const value = url.trim().toLowerCase();
	if (!value.startsWith("data:image/")) return false;
	// Block SVG data URLs to avoid script injection vectors.
	if (value.startsWith("data:image/svg")) return false;
	return true;
}

function isWindowsAbsolutePath(value: string) {
	return /^[a-zA-Z]:[\\/]/.test(value.trim());
}

function fileUrlToPath(value: string) {
	try {
		const u = new URL(value);
		if (u.protocol !== "file:") return value;
		// `file:///Users/a.png` -> `/Users/a.png`
		// `file:///C:/a.png` -> `/C:/a.png` (trim the leading slash)
		let p = decodeURIComponent(u.pathname);
		if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
		return p;
	} catch {
		return value;
	}
}

interface MarkdownRendererProps {
	content: string;
	className?: string;
	isStreaming?: boolean;
}

/**
 * 预处理 Markdown 内容：修复模型可能输出的格式问题
 * 例如：![alt]\n(url) -> ![alt](url)
 */
function preprocessMarkdown(content: string): string {
	// 修复被换行分开的图片语法: ![alt]\n(url) 或 ![alt]\n\n(url)
	// 匹配: ![任意文字] 后跟换行再跟 (url)
	return content.replace(
		/!\[([^\]]*)\]\s*\n+\s*\(([^)]+)\)/g,
		"![$1]($2)"
	);
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
	content,
	className = "",
	isStreaming = false,
}: MarkdownRendererProps) {
	// 缓存 remarkPlugins 避免每次渲染创建新数组
	const remarkPlugins = useMemo(() => [remarkGfm], []);

	// 预处理内容：修复模型可能输出的换行分开的图片语法
	const processedContent = useMemo(() => preprocessMarkdown(content), [content]);

	return (
		<div
			className={`prose prose-zinc dark:prose-invert max-w-none ${className}`}
		>
			<ReactMarkdown
				remarkPlugins={remarkPlugins}
				urlTransform={(url, key, _node) => {
					// `react-markdown` sanitizes URLs by default and strips `data:`/`file:`,
					// which prevents rendering model-returned base64 images like:
					// `![alt](data:image/png;base64,...)`
					if (key === "src") {
						const trimmed = String(url || "").trim();
						if (isAllowedImageDataUrl(trimmed)) return trimmed;
						if (trimmed.startsWith("file:")) return fileUrlToPath(trimmed);
						if (isWindowsAbsolutePath(trimmed)) return trimmed;
					}
					return defaultUrlTransform(url);
				}}
				components={{
					// 自定义代码块样式
					code({ className, children, ...props }) {
						const match = /language-(\w+)/.exec(className || "");
						const isInline = !match;

						if (isInline) {
							return (
								<code
									className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-sm font-mono text-zinc-800 dark:text-zinc-200"
									{...props}
								>
									{children}
								</code>
							);
						}

						const language = match[1].toLowerCase();
						const code = String(children).replace(/\n$/, "");

						// 检测可预览的代码块 - 渲染预览卡片替代代码块
						if (language === "html" || language === "htm") {
							return (
								<div className="my-3">
									<WebPreviewCard
										kind="html"
										html={code}
										title="前端预览"
										isStreaming={isStreaming}
									/>
								</div>
							);
						}

						if (language === "jsx" || language === "tsx" || language === "react") {
							return (
								<div className="my-3">
									<WebPreviewCard
										kind="react"
										jsx={code}
										title="React 预览"
										isStreaming={isStreaming}
									/>
								</div>
							);
						}

						if (language === "mermaid" || language === "drawio") {
							return (
								<MermaidRenderer
									chart={code}
									className="my-6"
								/>
							);
						}

						// 普通代码块
						return (
							<div className="relative group my-3">
								<div className="absolute top-2 right-2 text-xs text-zinc-400 font-mono">
									{language}
								</div>
								<pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 rounded-xl p-4 overflow-x-auto text-sm">
									<code className={className} {...props}>
										{children}
									</code>
								</pre>
							</div>
						);
					},
					// 自定义段落
					p({ children }) {
						return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
					},
					// 自定义标题
					h1({ children }) {
						return (
							<h1 className="text-xl font-bold mb-4 mt-6 first:mt-0">
								{children}
							</h1>
						);
					},
					h2({ children }) {
						return (
							<h2 className="text-lg font-bold mb-3 mt-5 first:mt-0">
								{children}
							</h2>
						);
					},
					h3({ children }) {
						return (
							<h3 className="text-base font-bold mb-2 mt-4 first:mt-0">
								{children}
							</h3>
						);
					},
					// 自定义列表
					ul({ children }) {
						return (
							<ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
						);
					},
					ol({ children }) {
						return (
							<ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
						);
					},
					li({ children }) {
						return <li className="leading-relaxed">{children}</li>;
					},
					// 自定义链接
					a({ href, children }) {
						const resolvedHref = typeof href === "string" ? href : "";
						return (
							<a
								href={resolvedHref}
								target="_blank"
								rel="noreferrer"
								className="text-blue-600 dark:text-blue-400 hover:underline"
								onClick={async (e) => {
									if (!resolvedHref) return;
									// 在 Tauri WebView 里，window.open/target=_blank 往往不会生效，改用后端 open_url 走系统浏览器
									try {
										e.preventDefault();
										await safeInvoke("open_url", { url: resolvedHref });
									} catch (err) {
										if (isTauriUnavailableError(err)) {
											// Web 环境回退
											window.open(
												resolvedHref,
												"_blank",
												"noopener,noreferrer",
											);
											return;
										}
										// 其他错误也回退一次，避免“点了没反应”
										window.open(resolvedHref, "_blank", "noopener,noreferrer");
									}
								}}
							>
								{children}
							</a>
						);
					},
					// 自定义图片
					img({ src, alt, title }) {
						if (!src) return null;
						return (
							<InlineImage
								path={src}
								title={String(title || alt || "生成的图片")}
								className="my-3"
							/>
						);
					},
					// 自定义引用块
					blockquote({ children }) {
						return (
							<blockquote className="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 my-3 italic text-zinc-600 dark:text-zinc-400">
								{children}
							</blockquote>
						);
					},
					// 自定义表格
					table({ children }) {
						return (
							<div className="overflow-x-auto my-3">
								<table className="min-w-full border-collapse border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
									{children}
								</table>
							</div>
						);
					},
					th({ children }) {
						return (
							<th className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-left font-semibold border-b border-zinc-200 dark:border-zinc-700">
								{children}
							</th>
						);
					},
					td({ children }) {
						return (
							<td className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
								{children}
							</td>
						);
					},
					// 自定义分割线
					hr() {
						return <hr className="my-6 border-zinc-200 dark:border-zinc-700" />;
					},
				}}
			>
				{processedContent}
			</ReactMarkdown>
		</div>
	);
});
