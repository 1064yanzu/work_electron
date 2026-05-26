/**
 * 工作目录文件预览的 5 个 viewer + 文件类型分类器。
 *
 * 原来内联在 DesignFileWorkspace.tsx 里;现在抽出来给 DesignSourceView
 * (源代码 tab) 和未来的"设计文件" inline 列表共用。
 */
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	designReadWorkDirFile,
	type DesignWorkDirFile,
} from "../../../lib/api/design";
import PdfViewer from "../../ui/document-viewers/PdfViewer";
import { MarkdownRenderer } from "../../ui/MarkdownRenderer";

export type FileKind =
	| "html"
	| "markdown"
	| "image"
	| "pdf"
	| "text"
	| "binary";

export function classifyByName(name: string): FileKind {
	const lower = name.toLowerCase();
	if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
	if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
	if (lower.endsWith(".pdf")) return "pdf";
	if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i.test(lower)) return "image";
	if (
		/\.(txt|css|m?js|cjs|tsx?|jsx?|json|ya?ml|toml|env|gitignore|html?|svg|csv|xml)$/i.test(
			lower,
		)
	) {
		return "text";
	}
	return "binary";
}

export function HtmlViewer({ html }: { html: string }) {
	return (
		<iframe
			title="html-preview"
			srcDoc={html}
			sandbox="allow-scripts allow-same-origin"
			className="w-full h-full bg-background"
		/>
	);
}

export function MarkdownViewer({ content }: { content: string }) {
	return (
		<div className="h-full overflow-y-auto px-6 py-5 design-doc-scroll">
			<MarkdownRenderer content={content} />
		</div>
	);
}

export function ImageViewer({
	base64,
	mime,
}: {
	base64: string;
	mime: string;
}) {
	const url = `data:${mime};base64,${base64}`;
	return (
		<div className="h-full w-full flex items-center justify-center p-6 bg-warm-200/30">
			<img
				src={url}
				alt=""
				className="max-w-full max-h-full object-contain rounded-md shadow-sm bg-background"
			/>
		</div>
	);
}

export function PdfFrameViewer({ base64 }: { base64: string }) {
	const url = useMemo(() => {
		const bin = atob(base64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const blob = new Blob([bytes], { type: "application/pdf" });
		return URL.createObjectURL(blob);
	}, [base64]);
	useEffect(() => {
		return () => {
			URL.revokeObjectURL(url);
		};
	}, [url]);
	return <PdfViewer src={url} className="h-full" />;
}

export function CodeViewer({
	content,
	name,
}: {
	content: string;
	name: string;
}) {
	const lower = name.toLowerCase();
	const lang = lower.endsWith(".json")
		? "json"
		: lower.endsWith(".md")
			? "markdown"
			: lower.endsWith(".css")
				? "css"
				: lower.endsWith(".js") || lower.endsWith(".mjs")
					? "javascript"
					: lower.endsWith(".ts") || lower.endsWith(".tsx")
						? "typescript"
						: "plaintext";
	return (
		<div className="h-full overflow-auto px-5 py-4 bg-bg-surface text-[12px]">
			<pre className="font-mono leading-relaxed text-text-primary whitespace-pre">
				<code data-language={lang}>{content}</code>
			</pre>
		</div>
	);
}

interface FileBodyProps {
	sessionId: string;
	relative: string;
}

/**
 * 通用文件预览主体:读 IPC、按 kind 分发到对应 viewer。
 * DesignFilesPanel inline 模式下的子文件预览也复用这个。
 */
export function FileBody({ sessionId, relative }: FileBodyProps) {
	const kind = useMemo(() => classifyByName(relative), [relative]);
	const [data, setData] = useState<DesignWorkDirFile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const fileUrlRef = useRef<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				setLoading(true);
				setError(null);
				const mode: "text" | "binary" =
					kind === "image" || kind === "pdf" || kind === "binary"
						? "binary"
						: "text";
				const res = await designReadWorkDirFile({
					session_id: sessionId,
					relative_path: relative,
					mode,
				});
				if (cancelled) return;
				setData(res);
			} catch (e) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
			if (fileUrlRef.current) {
				URL.revokeObjectURL(fileUrlRef.current);
				fileUrlRef.current = null;
			}
		};
	}, [sessionId, relative, kind]);

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center text-xs text-text-muted gap-2">
				<Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
				加载中…
			</div>
		);
	}
	if (error || !data) {
		return (
			<div className="h-full flex items-center justify-center text-xs text-text-muted px-6 text-center leading-relaxed">
				{error ?? "读取失败"}
			</div>
		);
	}

	if (kind === "html" && data.content) {
		return <HtmlViewer html={data.content} />;
	}
	if (kind === "markdown" && data.content != null) {
		return <MarkdownViewer content={data.content} />;
	}
	if (kind === "image" && data.base64) {
		return <ImageViewer base64={data.base64} mime={data.mime ?? "image/*"} />;
	}
	if (kind === "pdf" && data.base64) {
		return <PdfFrameViewer base64={data.base64} />;
	}
	if (kind === "text" && data.content != null) {
		return <CodeViewer content={data.content} name={relative} />;
	}
	return (
		<div className="h-full flex items-center justify-center text-xs text-text-muted px-6 text-center leading-relaxed">
			该文件类型无法在工作台内预览,可点击右上「目录」在 Finder 中打开。
		</div>
	);
}
