// 文档查看器组件 - 支持 PDF 和 DOCX 内嵌阅读

import {
	ChevronLeft,
	ChevronRight,
	Download,
	FileWarning,
	Loader2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import mammoth from "mammoth";
import { useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { safeInvoke } from "../../lib/tauriBridge";

// 设置 PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
	src: string;
	type: "pdf" | "docx";
	className?: string;
}

// PDF 查看器
function PDFViewer({ src, className }: { src: string; className?: string }) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pageNumber, setPageNumber] = useState<number>(1);
	const [scale, setScale] = useState<number>(1.0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let createdUrl: string | null = null;
		setPdfData(null);
		setDownloadUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return null;
		});

		const isRemote =
			src.startsWith("http://") ||
			src.startsWith("https://") ||
			src.startsWith("data:") ||
			src.startsWith("blob:");
		if (isRemote) return;

		(async () => {
			try {
				const result = await safeInvoke<{ content: string; encoding: string }>(
					"read_file_safe",
					{
						payload: { path: src, encoding: "base64" },
					},
				);
				if (cancelled) return;

				const base64 = result?.content || "";
				if (!base64) throw new Error("PDF 内容为空");

				const binary = atob(base64);
				const bytes = new Uint8Array(binary.length);
				for (let i = 0; i < binary.length; i++) {
					bytes[i] = binary.charCodeAt(i);
				}

				setPdfData(bytes);
				const blob = new Blob([bytes], { type: "application/pdf" });
				const url = URL.createObjectURL(blob);
				createdUrl = url;
				setDownloadUrl(url);
			} catch (e) {
				if (cancelled) return;
				console.warn("[PDFViewer] Failed to load local pdf via backend:", e);
			}
		})();

		return () => {
			cancelled = true;
			if (createdUrl) URL.revokeObjectURL(createdUrl);
		};
	}, [src]);

	const onDocumentLoadSuccess = useCallback(
		({ numPages }: { numPages: number }) => {
			setNumPages(numPages);
			setLoading(false);
		},
		[],
	);

	const onDocumentLoadError = useCallback((error: Error) => {
		console.error("PDF 加载失败:", error);
		setError("PDF 加载失败");
		setLoading(false);
	}, []);

	const goToPrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
	const goToNextPage = () =>
		setPageNumber((prev) => Math.min(prev + 1, numPages));
	const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
	const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-zinc-400">
				<FileWarning className="w-12 h-12 mb-3 opacity-50" />
				<p className="text-sm">{error}</p>
				<a
					href={src}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-4 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-sm hover:opacity-90"
				>
					在外部应用中打开
				</a>
			</div>
		);
	}

	return (
		<div className={`flex flex-col ${className}`}>
			{/* 工具栏 */}
			<div className="flex items-center justify-between px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-t-xl border-b border-zinc-200 dark:border-zinc-700">
				<div className="flex items-center gap-2">
					<button
						onClick={goToPrevPage}
						disabled={pageNumber <= 1}
						className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						<ChevronLeft className="w-4 h-4" />
					</button>
					<span className="text-sm text-zinc-600 dark:text-zinc-400 min-w-[80px] text-center">
						{pageNumber} / {numPages || "..."}
					</span>
					<button
						onClick={goToNextPage}
						disabled={pageNumber >= numPages}
						className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						<ChevronRight className="w-4 h-4" />
					</button>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={zoomOut}
						disabled={scale <= 0.5}
						className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						<ZoomOut className="w-4 h-4" />
					</button>
					<span className="text-sm text-zinc-600 dark:text-zinc-400 min-w-[50px] text-center">
						{Math.round(scale * 100)}%
					</span>
					<button
						onClick={zoomIn}
						disabled={scale >= 3.0}
						className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						<ZoomIn className="w-4 h-4" />
					</button>
					<a
						href={downloadUrl || src}
						download
						className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ml-2"
						title="下载"
					>
						<Download className="w-4 h-4" />
					</a>
				</div>
			</div>

			{/* PDF 内容 */}
			<div className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-900 rounded-b-xl p-4">
				{loading && (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
					</div>
				)}
				<Document
					file={pdfData ? { data: pdfData } : src}
					onLoadSuccess={onDocumentLoadSuccess}
					onLoadError={onDocumentLoadError}
					loading={null}
					className="flex justify-center"
				>
					<Page
						pageNumber={pageNumber}
						scale={scale}
						renderTextLayer={false}
						renderAnnotationLayer={false}
						className="shadow-lg rounded-lg overflow-hidden"
					/>
				</Document>
			</div>
		</div>
	);
}

// DOCX 查看器
function DOCXViewer({ src, className }: { src: string; className?: string }) {
	const [htmlContent, setHtmlContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const loadDocx = async () => {
			try {
				setLoading(true);
				setError(null);

				// 优先交给后端转换（避免前端大文件解析卡顿），失败则回退到前端转换
				try {
					const result = await safeInvoke<{ html: string }>(
						"convert_docx_to_html",
						{
							payload: { path: src },
						},
					);
					setHtmlContent(result.html || "");
					return;
				} catch (err) {
					// 回退：前端转换（Web 环境/未注册 handler/路径不可读等）
					console.warn(
						"[DOCXViewer] Backend conversion failed, fallback:",
						err,
					);
				}

				const response = await fetch(src);
				if (!response.ok) throw new Error("无法加载文档");

				const arrayBuffer = await response.arrayBuffer();
				const result = await mammoth.convertToHtml({ arrayBuffer });
				setHtmlContent(result.value);
			} catch (err) {
				console.error("DOCX 加载失败:", err);
				setError("DOCX 加载失败");
			} finally {
				setLoading(false);
			}
		};

		loadDocx();
	}, [src]);

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-zinc-400">
				<FileWarning className="w-12 h-12 mb-3 opacity-50" />
				<p className="text-sm">{error}</p>
				<a
					href={src}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-4 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-sm hover:opacity-90"
				>
					在外部应用中打开
				</a>
			</div>
		);
	}

	return (
		<div className={`flex flex-col ${className}`}>
			{/* 工具栏 */}
			<div className="flex items-center justify-end px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-t-xl border-b border-zinc-200 dark:border-zinc-700">
				<a
					href={src}
					download
					className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
					title="下载"
				>
					<Download className="w-4 h-4" />
				</a>
			</div>

			{/* DOCX 内容 */}
			<div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 rounded-b-xl">
				<article
					className="prose prose-zinc dark:prose-invert max-w-none p-6 
            prose-headings:font-semibold
            prose-h1:text-2xl prose-h1:mt-6 prose-h1:mb-4
            prose-h2:text-xl prose-h2:mt-5 prose-h2:mb-3
            prose-p:text-[15px] prose-p:leading-7 prose-p:my-3
            prose-table:my-4 prose-table:w-full
            prose-th:bg-zinc-100 dark:prose-th:bg-zinc-800 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-sm
            prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-zinc-200 dark:prose-td:border-zinc-700
            prose-img:rounded-lg prose-img:shadow-md prose-img:my-4"
					dangerouslySetInnerHTML={{ __html: htmlContent }}
				/>
			</div>
		</div>
	);
}

// 主组件
export default function DocumentViewer({
	src,
	type,
	className = "",
}: DocumentViewerProps) {
	if (type === "pdf") {
		return <PDFViewer src={src} className={className} />;
	} else if (type === "docx") {
		return <DOCXViewer src={src} className={className} />;
	}

	return (
		<div className="flex flex-col items-center justify-center py-12 text-zinc-400">
			<FileWarning className="w-12 h-12 mb-3 opacity-50" />
			<p className="text-sm">不支持的文档类型</p>
		</div>
	);
}

// 辅助函数：从 HTML 中提取文档信息
export function extractDocumentInfo(
	html: string,
): { type: "pdf" | "docx"; src: string } | null {
	const match = html.match(/data-type="(pdf|docx)"\s+data-src="([^"]+)"/);
	if (match) {
		return {
			type: match[1] as "pdf" | "docx",
			src: match[2],
		};
	}
	return null;
}
