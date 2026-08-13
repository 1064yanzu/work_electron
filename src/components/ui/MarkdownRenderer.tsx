import { Suspense, lazy, memo, useCallback, useMemo } from "react";
import { Palette } from "lucide-react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { InlineImage } from "./InlineImage";
import { ShikiCodeBlock } from "./ShikiCodeBlock";
import { isTauriUnavailableError, safeInvoke } from "../../lib/tauriBridge";
import { useThrottledValue } from "../../hooks/useThrottledValue";

const MermaidRenderer = lazy(() => import("./MermaidRenderer"));
const WebPreviewCard = lazy(async () => {
	const mod = await import("../chat/WebPreviewCard");
	return { default: mod.WebPreviewCard };
});

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
	sandboxDir?: string;
}

// 不依赖任何 props 的 markdown 组件提升到模块级，
// 避免 MarkdownRenderer 每次重建 components 对象时这些函数也跟着失效引用。
// 注意：a 标签的 onClick 里用到的 safeInvoke / isTauriUnavailableError 都是稳定导入引用。
const STATIC_COMPONENTS = {
	p({ children }: { children?: any }) {
		return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
	},
	h1({ children }: { children?: any }) {
		return (
			<h1 className="text-xl font-bold mb-4 mt-6 first:mt-0">{children}</h1>
		);
	},
	h2({ children }: { children?: any }) {
		return (
			<h2 className="text-lg font-bold mb-3 mt-5 first:mt-0">{children}</h2>
		);
	},
	h3({ children }: { children?: any }) {
		return (
			<h3 className="text-base font-bold mb-2 mt-4 first:mt-0">{children}</h3>
		);
	},
	ul({ children }: { children?: any }) {
		return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
	},
	ol({ children }: { children?: any }) {
		return <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>;
	},
	li({ children }: { children?: any }) {
		return <li className="leading-relaxed">{children}</li>;
	},
	a({ href, children }: { href?: string; children?: any }) {
		const resolvedHref = typeof href === "string" ? href : "";
		return (
			<a
				href={resolvedHref}
				target="_blank"
				rel="noreferrer"
				className="text-focus dark:text-focus hover:underline"
				onClick={async (e) => {
					if (!resolvedHref) return;
					// 在桌面 WebView 里，window.open/target=_blank 往往不会生效，改用后端 open_external_url 走系统浏览器
					try {
						e.preventDefault();
						const result = await safeInvoke<{
							success: boolean;
							error?: string;
						}>("open_external_url", { url: resolvedHref });
						if (!result?.success) {
							throw new Error(result?.error || "OPEN_EXTERNAL_URL_FAILED");
						}
					} catch (err) {
						if (isTauriUnavailableError(err)) {
							// Web 环境回退
							window.open(resolvedHref, "_blank", "noopener,noreferrer");
							return;
						}
						// 其他错误也回退一次，避免"点了没反应"
						window.open(resolvedHref, "_blank", "noopener,noreferrer");
					}
				}}
			>
				{children}
			</a>
		);
	},
	blockquote({ children }: { children?: any }) {
		return (
			<blockquote className="border-l-2 border-border pl-4 my-3 italic text-text-secondary">
				{children}
			</blockquote>
		);
	},
	table({ children }: { children?: any }) {
		return (
			<div className="overflow-x-auto my-3">
				<table className="min-w-full border-collapse border border-border rounded-lg overflow-hidden">
					{children}
				</table>
			</div>
		);
	},
	th({ children }: { children?: any }) {
		return (
			<th className="bg-warm-200 px-4 py-2 text-left font-semibold border-b border-border">
				{children}
			</th>
		);
	},
	td({ children }: { children?: any }) {
		return <td className="px-4 py-2 border-b border-border">{children}</td>;
	},
	hr() {
		return <hr className="my-6 border-border" />;
	},
} as const;

// loading 占位图组件（不依赖 props），同样提到模块级
function LoadingImagePlaceholder({ alt }: { alt?: string }) {
	return (
		<span className="block my-4 flex items-center justify-center">
			<span className="flex flex-col items-center gap-3 p-8 bg-gradient-to-br from-surface to-background rounded-2xl border border-border shadow-sm">
				<span className="relative block w-12 h-12">
					<span className="absolute inset-0 rounded-full border-4 border-border" />
					<span className="absolute inset-0 rounded-full border-4 border-transparent border-t-text-secondary animate-spin" />
				</span>
				<span className="flex items-center gap-2 text-sm text-text-muted">
					<Palette
						className="w-4 h-4 bai-icon-peach animate-pulse"
						strokeWidth={1.5}
					/>
					<span>{alt || "AI 配图生成中…"}</span>
				</span>
				<span className="text-xs text-text-light">请稍候，图片即将呈现</span>
			</span>
		</span>
	);
}

/**
 * 预处理 Markdown 内容：修复模型可能输出的格式问题
 * 例如：![alt]\n(url) -> ![alt](url)
 * 还会处理包含空格的 URL，用 <> 包裹
 */
function preprocessMarkdown(content: string): string {
	// 1. 修复被换行分开的图片语法: ![alt]\n(url) 或 ![alt]\n\n(url)
	// 匹配: ![任意文字] 后跟换行再跟 (url)
	let result = content.replace(
		/!\[([^\]]*)\]\s*\n+\s*\(([^)]+)\)/g,
		"![$1]($2)",
	);

	// 2. 为包含空格但未用 <> 包裹的图片 URL 添加包裹
	// 匹配: ![alt](url with spaces) 但排除已经用 <> 包裹的
	result = result.replace(
		/!\[([^\]]*)\]\((?!<)([^)]*\s[^)]*)\)/g,
		"![$1](<$2>)",
	);

	return result;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
	content,
	className = "",
	isStreaming = false,
	sandboxDir,
}: MarkdownRendererProps) {
	// 缓存 remarkPlugins 避免每次渲染创建新数组
	const remarkPlugins = useMemo(() => [remarkGfm], []);

	// 预处理内容：修复模型可能输出的换行分开的图片语法
	const processedContent = useMemo(
		() => preprocessMarkdown(content),
		[content],
	);
	const contentForRender = useThrottledValue(processedContent, 80, isStreaming);

	const urlTransform = useCallback((url: string, key: string) => {
		// `react-markdown` sanitizes URLs by default and strips `data:`/`file:`,
		// which prevents rendering model-returned base64 images like:
		// `![alt](data:image/png;base64,...)`
		if (key === "src") {
			const trimmed = String(url || "").trim();
			// 占位图前缀 - 直接放行
			if (trimmed.startsWith("loading:")) return trimmed;
			// base64 data URL
			if (isAllowedImageDataUrl(trimmed)) return trimmed;
			// file:// URL
			if (trimmed.startsWith("file:")) return fileUrlToPath(trimmed);
			// Windows 绝对路径
			if (isWindowsAbsolutePath(trimmed)) return trimmed;
			// Unix 绝对路径 (macOS/Linux)
			if (trimmed.startsWith("/")) return trimmed;
		}
		return defaultUrlTransform(url);
	}, []);

	// code 渲染函数依赖 isStreaming（流式期间跳过 Shiki/Mermaid 等重渲染）
	const codeComponent = useMemo(() => {
		return function CodeBlock({
			className,
			children,
			...props
		}: {
			className?: string;
			children?: any;
		}) {
			const match = /language-(\w+)/.exec(className || "");
			const isInline = !match;

			if (isInline) {
				return (
					<code
						className="px-1.5 py-0.5 bg-warm-200 rounded text-sm font-mono text-text-primary"
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
				if (isStreaming) {
					return (
						<div className="relative group my-3">
							<div className="absolute top-2 right-2 text-xs text-text-light font-mono">
								{language}
							</div>
							<pre className="bg-warm-200 text-text-primary rounded-xl p-4 overflow-x-auto text-sm">
								<code className={className} {...props}>
									{children}
								</code>
							</pre>
						</div>
					);
				}
				return (
					<div className="my-3">
						<Suspense fallback={null}>
							<WebPreviewCard
								kind="html"
								html={code}
								title="前端预览"
								isStreaming={isStreaming}
							/>
						</Suspense>
					</div>
				);
			}

			if (language === "jsx" || language === "tsx" || language === "react") {
				if (isStreaming) {
					return (
						<div className="relative group my-3">
							<div className="absolute top-2 right-2 text-xs text-text-light font-mono">
								{language}
							</div>
							<pre className="bg-warm-200 text-text-primary rounded-xl p-4 overflow-x-auto text-sm">
								<code className={className} {...props}>
									{children}
								</code>
							</pre>
						</div>
					);
				}
				return (
					<div className="my-3">
						<Suspense fallback={null}>
							<WebPreviewCard
								kind="react"
								jsx={code}
								title="React 预览"
								isStreaming={isStreaming}
							/>
						</Suspense>
					</div>
				);
			}

			// Mermaid 渲染很重：流式阶段先用代码块占位，避免每个 chunk 都触发重绘
			if (language === "mermaid" || language === "drawio") {
				if (isStreaming) {
					return (
						<div className="relative group my-3">
							<div className="absolute top-2 right-2 text-xs text-text-light font-mono">
								{language}
							</div>
							<pre className="bg-warm-200 text-text-primary rounded-xl p-4 overflow-x-auto text-sm">
								<code className={className} {...props}>
									{children}
								</code>
							</pre>
						</div>
					);
				}
				return (
					<Suspense
						fallback={
							<div className="my-3 rounded-xl border border-border bg-warm-50 p-4 text-xs text-text-muted">
								正在加载图表渲染器…
							</div>
						}
					>
						<MermaidRenderer chart={code} className="my-6" />
					</Suspense>
				);
			}

			// 普通代码块 — 流式输出时保持纯文本，流结束后用 Shiki 高亮
			if (isStreaming) {
				return (
					<div className="relative group my-3">
						<div className="absolute top-2 right-2 text-xs text-text-light font-mono">
							{language}
						</div>
						<pre className="bg-warm-200 text-text-primary rounded-xl p-4 overflow-x-auto text-sm">
							<code className={className} {...props}>
								{children}
							</code>
						</pre>
					</div>
				);
			}

			return <ShikiCodeBlock code={code} language={language} maxHeight={600} />;
		};
	}, [isStreaming]);

	// img 渲染函数依赖 sandboxDir（不同对话/沙盒目录不同）
	const imgComponent = useMemo(() => {
		return function MarkdownImage({
			src,
			alt,
			title,
		}: {
			src?: string;
			alt?: string;
			title?: string;
		}) {
			if (!src) return null;
			if (src.startsWith("loading:")) {
				return <LoadingImagePlaceholder alt={alt} />;
			}
			return (
				<InlineImage
					path={src}
					title={String(title || alt || "生成的图片")}
					sandboxDir={sandboxDir}
					className="my-3"
				/>
			);
		};
	}, [sandboxDir]);

	// 合并静态组件 + 动态组件（code / img）；只有 codeComponent / imgComponent 变化时才重建
	const components = useMemo(
		() => ({
			...STATIC_COMPONENTS,
			code: codeComponent,
			img: imgComponent,
		}),
		[codeComponent, imgComponent],
	);

	return (
		<div className={`max-w-none ${className}`}>
			<ReactMarkdown
				remarkPlugins={remarkPlugins}
				urlTransform={urlTransform}
				components={components}
			>
				{contentForRender}
			</ReactMarkdown>
		</div>
	);
});
