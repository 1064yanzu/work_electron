/**
 * 设计稿工作目录多 tab 文件预览器。
 * 用户从 DesignFilesPanel 点选文件 → 这里展开成 tab 条 + 主内容区。
 * 根据扩展名分发到不同 viewer:
 *   .html / .htm     → HtmlViewer (iframe srcDoc)
 *   .md / .markdown  → MarkdownViewer (MarkdownRenderer)
 *   .png/.jpg/.svg/  → ImageViewer (<img>)
 *   .pdf             → PdfFrameViewer (借用现有 PdfViewer)
 *   其他文本         → CodeViewer (<pre><code> 含语法着色)
 *   其他二进制       → 提示无法预览,可以「在 Finder 打开目录」
 *
 * 为了避免单文件膨胀,5 个 viewer 都内联在本文件,各自只有 30-60 行。
 */
import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	designReadWorkDirFile,
	type DesignWorkDirFile,
} from "../../../lib/api/design";
import PdfViewer from "../../ui/document-viewers/PdfViewer";
import { MarkdownRenderer } from "../../ui/MarkdownRenderer";

interface DesignFileWorkspaceProps {
	sessionId: string;
	openFiles: string[];
	activeFile: string | null;
	onCloseFile: (relative: string) => void;
	onActivateFile: (relative: string) => void;
}

type FileKind = "html" | "markdown" | "image" | "pdf" | "text" | "binary";

function classifyByName(name: string): FileKind {
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

export function DesignFileWorkspace({
	sessionId,
	openFiles,
	activeFile,
	onCloseFile,
	onActivateFile,
}: DesignFileWorkspaceProps) {
	if (openFiles.length === 0 || !activeFile) {
		return (
			<div className="h-full w-full rounded-2xl bg-bg-surface border border-border flex items-center justify-center text-sm text-text-muted">
				从右侧文件列表选择一个文件预览
			</div>
		);
	}

	return (
		<div className="h-full w-full rounded-2xl bg-background border border-border overflow-hidden flex flex-col">
			<div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-bg-surface overflow-x-auto">
				{openFiles.map((rel) => {
					const name = rel.includes("/")
						? rel.slice(rel.lastIndexOf("/") + 1)
						: rel;
					const active = rel === activeFile;
					return (
						<div
							key={rel}
							className={`group inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md text-[11.5px] cursor-pointer transition-colors ${
								active
									? "bg-background text-text-primary border border-border"
									: "text-text-muted hover:text-text-primary hover:bg-warm-200/60"
							}`}
							onClick={() => onActivateFile(rel)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") onActivateFile(rel);
							}}
							role="button"
							tabIndex={0}
							title={rel}
						>
							<span className="truncate max-w-[160px]">{name}</span>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onCloseFile(rel);
								}}
								className="p-0.5 rounded hover:bg-warm-200 text-text-muted hover:text-text-primary"
								aria-label={`关闭 ${name}`}
							>
								<X className="w-3 h-3" />
							</button>
						</div>
					);
				})}
			</div>
			<div className="flex-1 min-h-0 bg-background">
				<FileBody sessionId={sessionId} relative={activeFile} />
			</div>
		</div>
	);
}

function FileBody({
	sessionId,
	relative,
}: {
	sessionId: string;
	relative: string;
}) {
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

function HtmlViewer({ html }: { html: string }) {
	return (
		<iframe
			title="html-preview"
			srcDoc={html}
			sandbox="allow-scripts allow-same-origin"
			className="w-full h-full bg-background"
		/>
	);
}

function MarkdownViewer({ content }: { content: string }) {
	return (
		<div className="h-full overflow-y-auto px-6 py-5 design-doc-scroll">
			<MarkdownRenderer content={content} />
		</div>
	);
}

function ImageViewer({ base64, mime }: { base64: string; mime: string }) {
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

function PdfFrameViewer({ base64 }: { base64: string }) {
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

function CodeViewer({ content, name }: { content: string; name: string }) {
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
