import {
	ChevronLeft,
	ChevronRight,
	Download,
	FileWarning,
	Loader2,
	Maximize2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { usePdfDocumentSource } from "../../pdf/usePdfDocumentSource";
import { VirtualizedPdfPageList } from "../../pdf/VirtualizedPdfPageList";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

interface PdfViewerProps {
	src: string;
	className?: string;
}

export default function PdfViewer({ src, className }: PdfViewerProps) {
	const { documentSource: documentFile, error: loadError } =
		usePdfDocumentSource(src);
	const [numPages, setNumPages] = useState<number>(0);
	const [scale, setScale] = useState<number>(1.0);
	const [loading, setLoading] = useState(true);
	const [renderError, setRenderError] = useState<string | null>(null);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [jumpInput, setJumpInput] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const [pageWidth, setPageWidth] = useState<number>(0);

	const error = loadError ? "PDF 文件读取失败" : renderError;

	// 每次 src 切换时重置页面/缩放/加载状态（实际字节加载由 usePdfDocumentSource 接管）。
	useEffect(() => {
		setLoading(true);
		setRenderError(null);
		setNumPages(0);
		setCurrentPage(1);
	}, [src]);

	// 本地文件额外生成一个 Blob URL 供“下载”按钮使用（远程/data//blob: 来源直接用 src 本身下载即可）。
	useEffect(() => {
		if (!documentFile || typeof documentFile === "string") {
			setDownloadUrl(null);
			return;
		}
		const blob = new Blob([documentFile.data as Uint8Array<ArrayBuffer>], {
			type: "application/pdf",
		});
		const url = URL.createObjectURL(blob);
		setDownloadUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [documentFile]);

	useEffect(() => {
		const node = containerRef.current;
		if (!node) return;
		const updateWidth = () => {
			const nextWidth = Math.max(320, Math.floor(node.clientWidth - 32));
			setPageWidth(nextWidth);
		};
		updateWidth();
		const observer = new ResizeObserver(updateWidth);
		observer.observe(node);
		return () => observer.disconnect();
	}, [documentFile]);

	const onDocumentLoadSuccess = useCallback(
		({ numPages }: { numPages: number }) => {
			setNumPages(numPages);
			setRenderError(null);
			setLoading(false);
		},
		[],
	);

	const onDocumentLoadError = useCallback((loadError: Error) => {
		console.error("PDF 加载失败:", loadError);
		setRenderError(
			loadError?.message
				? `PDF 加载失败：${loadError.message}`
				: "PDF 加载失败",
		);
		setLoading(false);
	}, []);

	const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
	const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.3));
	const fitWidth = () => setScale(1.0);

	const handlePageVisible = useCallback((pageNumber: number) => {
		setCurrentPage(pageNumber);
	}, []);

	const jumpToPage = useCallback(
		(page: number) => {
			if (page < 1 || page > numPages) return;
			const scrollEl = scrollRef.current;
			if (!scrollEl) return;
			const pages = scrollEl.querySelectorAll("[data-page-container]");
			const target = pages[page - 1] as HTMLElement | undefined;
			target?.scrollIntoView({ behavior: "smooth", block: "start" });
			setCurrentPage(page);
		},
		[numPages],
	);

	const handleJumpInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			const num = Number.parseInt(jumpInput, 10);
			if (!Number.isNaN(num)) jumpToPage(num);
			setJumpInput("");
		}
	};

	// 键盘快捷键
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// 仅在没有焦点在 input 时处理
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			if (e.key === "+" || e.key === "=") {
				e.preventDefault();
				zoomIn();
			} else if (e.key === "-") {
				e.preventDefault();
				zoomOut();
			}
		};
		const el = containerRef.current;
		el?.addEventListener("keydown", handleKeyDown);
		return () => el?.removeEventListener("keydown", handleKeyDown);
	}, []);

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-text-light">
				<FileWarning className="w-12 h-12 mb-3 opacity-50" />
				<p className="text-sm">{error}</p>
				<a
					href={src}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-4 px-4 py-2 bg-warm-200 rounded-lg text-sm hover:bg-warm-300 dark:hover:bg-cream-700 transition-colors"
				>
					在外部应用中打开
				</a>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={`flex flex-col ${className || ""}`}
			tabIndex={0}
		>
			{/* 工具栏 */}
			<div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 bg-surface/92 backdrop-blur-md rounded-t-xl border-b border-border">
				{/* 页码导航 */}
				<div className="flex items-center gap-0.5">
					<button
						onClick={() => jumpToPage(currentPage - 1)}
						disabled={currentPage <= 1}
						className="p-1 rounded-md hover:bg-warm-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						title="上一页"
					>
						<ChevronLeft className="w-3.5 h-3.5" />
					</button>
					<div className="flex items-center gap-1 text-text-muted">
						<input
							type="text"
							value={jumpInput || (numPages ? String(currentPage) : "")}
							onChange={(e) => setJumpInput(e.target.value)}
							onKeyDown={handleJumpInputKeyDown}
							onBlur={() => setJumpInput("")}
							className="w-9 text-center bg-warm-50 border border-border rounded py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
							disabled={!numPages}
						/>
						<span className="text-[11px]">/ {numPages || "..."}</span>
					</div>
					<button
						onClick={() => jumpToPage(currentPage + 1)}
						disabled={currentPage >= numPages}
						className="p-1 rounded-md hover:bg-warm-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						title="下一页"
					>
						<ChevronRight className="w-3.5 h-3.5" />
					</button>
				</div>

				{/* 缩放控制 */}
				<div className="flex items-center gap-0.5">
					<button
						onClick={zoomOut}
						disabled={scale <= 0.3}
						className="p-1 rounded-md hover:bg-warm-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						title="缩小 (-)"
					>
						<ZoomOut className="w-3.5 h-3.5" />
					</button>
					<span className="text-[11px] text-text-muted min-w-[36px] text-center tabular-nums">
						{Math.round(scale * 100)}%
					</span>
					<button
						onClick={zoomIn}
						disabled={scale >= 3.0}
						className="p-1 rounded-md hover:bg-warm-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						title="放大 (+)"
					>
						<ZoomIn className="w-3.5 h-3.5" />
					</button>
					<div className="w-px h-3.5 bg-warm-300 dark:bg-cream-700 mx-1" />
					<button
						onClick={fitWidth}
						className="p-1 rounded-md hover:bg-warm-200 transition-colors"
						title="适应宽度"
					>
						<Maximize2 className="w-3.5 h-3.5" />
					</button>
					<a
						href={downloadUrl || src}
						download
						className="p-1 rounded-md hover:bg-warm-200 transition-colors"
						title="下载"
					>
						<Download className="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			{/* PDF 内容 */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-auto bg-warm-200/60 rounded-b-xl px-3 py-4"
			>
				{loading && (
					<div className="flex flex-col items-center justify-center py-16 gap-3">
						<Loader2 className="w-7 h-7 animate-spin text-text-light" />
						<span className="text-xs text-text-light">正在加载 PDF...</span>
					</div>
				)}
				{documentFile ? (
					<Document
						file={documentFile}
						onLoadSuccess={onDocumentLoadSuccess}
						onLoadError={onDocumentLoadError}
						loading={null}
						className="flex flex-col items-center gap-4"
					>
						<VirtualizedPdfPageList
							numPages={numPages}
							pageWidth={pageWidth || undefined}
							scale={scale}
							onActivePageChange={handlePageVisible}
						/>
					</Document>
				) : null}
			</div>
		</div>
	);
}
