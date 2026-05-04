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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { safeInvoke } from "../../../lib/tauriBridge";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

interface PdfViewerProps {
	src: string;
	className?: string;
}

/** 虚拟化单页：只有进入视口附近时才渲染 */
const VirtualPage = memo(function VirtualPage({
	pageNumber,
	width,
	scale,
	onVisible,
}: {
	pageNumber: number;
	width: number | undefined;
	scale: number;
	onVisible?: (pageNumber: number) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(false);
	const [wasVisible, setWasVisible] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				const visible = entry.isIntersecting;
				setIsVisible(visible);
				if (visible) {
					setWasVisible(true);
					onVisible?.(pageNumber);
				}
			},
			{ rootMargin: "300px 0px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [pageNumber, onVisible]);

	const shouldRender = isVisible || wasVisible;
	const estimatedHeight = (width || 600) * 1.414 * scale;

	return (
		<div
			ref={ref}
			data-page-container=""
			className="bg-surface shadow-[0_4px_20px_-8px_rgba(0,0,0,0.2)] rounded-sm relative"
			style={{ minHeight: shouldRender ? undefined : estimatedHeight }}
		>
			{shouldRender ? (
				<Page
					pageNumber={pageNumber}
					width={width}
					scale={scale}
					renderTextLayer={true}
					renderAnnotationLayer={true}
					loading={
						<div
							className="flex items-center justify-center"
							style={{ height: estimatedHeight }}
						>
							<Loader2 className="w-5 h-5 animate-spin text-text-light" />
						</div>
					}
				/>
			) : (
				<div
					className="flex items-center justify-center bg-warm-50/50"
					style={{ height: estimatedHeight }}
				>
					<span className="text-[11px] text-text-light">{pageNumber}</span>
				</div>
			)}
		</div>
	);
});

export default function PdfViewer({ src, className }: PdfViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [scale, setScale] = useState<number>(1.0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [documentFile, setDocumentFile] = useState<
		string | { data: Uint8Array } | null
	>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [jumpInput, setJumpInput] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const [pageWidth, setPageWidth] = useState<number>(0);

	const isRemote = useMemo(
		() =>
			src.startsWith("http://") ||
			src.startsWith("https://") ||
			src.startsWith("data:") ||
			src.startsWith("blob:"),
		[src],
	);

	useEffect(() => {
		let cancelled = false;
		let createdUrl: string | null = null;
		setLoading(true);
		setError(null);
		setNumPages(0);
		setCurrentPage(1);
		setDocumentFile(null);
		setDownloadUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return null;
		});

		if (isRemote) {
			setDocumentFile(src);
			return;
		}

		(async () => {
			try {
				const result = await safeInvoke<{
					content: string;
					encoding: string;
				}>("read_file_safe", {
					payload: { path: src, encoding: "base64" },
				});
				if (cancelled) return;

				const base64 = result?.content || "";
				if (!base64) throw new Error("PDF 内容为空");

				const binaryStr = atob(base64);
				const len = binaryStr.length;
				const bytes = new Uint8Array(len);
				for (let i = 0; i < len; i++) {
					bytes[i] = binaryStr.charCodeAt(i);
				}

				setDocumentFile({ data: bytes });
				const blob = new Blob([bytes], { type: "application/pdf" });
				const url = URL.createObjectURL(blob);
				createdUrl = url;
				setDownloadUrl(url);
			} catch (e) {
				if (cancelled) return;
				console.error("[PDFViewer] Failed to load local pdf:", e);
				setError("PDF 文件读取失败");
				setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
			if (createdUrl) URL.revokeObjectURL(createdUrl);
		};
	}, [isRemote, src]);

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
			setError(null);
			setLoading(false);
		},
		[],
	);

	const onDocumentLoadError = useCallback((loadError: Error) => {
		console.error("PDF 加载失败:", loadError);
		setError(
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
			<div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 bg-surface/92/92 backdrop-blur-md rounded-t-xl border-b border-border">
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
						{Array.from({ length: numPages }, (_, index) => (
							<VirtualPage
								key={`page-${index + 1}`}
								pageNumber={index + 1}
								width={pageWidth || undefined}
								scale={scale}
								onVisible={handlePageVisible}
							/>
						))}
					</Document>
				) : null}
			</div>
		</div>
	);
}
