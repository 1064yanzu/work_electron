import { Download, FileWarning, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { safeInvoke } from "../../../lib/tauriBridge";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

interface PdfViewerProps {
	src: string;
	className?: string;
}

export default function PdfViewer({ src, className }: PdfViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [scale, setScale] = useState<number>(1.0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [documentFile, setDocumentFile] = useState<string | { data: Uint8Array } | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
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

					setDocumentFile({ data: bytes });
				const blob = new Blob([bytes], { type: "application/pdf" });
				const url = URL.createObjectURL(blob);
				createdUrl = url;
				setDownloadUrl(url);
			} catch (e) {
				if (cancelled) return;
				console.error("[PDFViewer] Failed to load local pdf via backend:", e);
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
			const nextWidth = Math.max(320, Math.floor(node.clientWidth - 24));
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
		setError(loadError?.message ? `PDF 加载失败：${loadError.message}` : "PDF 加载失败");
		setLoading(false);
	}, []);

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
		<div className={`flex flex-col ${className || ""}`}>
			<div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-white/88 dark:bg-zinc-900/88 backdrop-blur-md rounded-t-xl border-b border-zinc-200 dark:border-zinc-700">
				<div className="text-sm text-zinc-600 dark:text-zinc-400 min-w-[80px]">
					{numPages ? `${numPages} 页` : "载入中..."}
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

			<div
				ref={containerRef}
				className="flex-1 overflow-auto bg-transparent rounded-b-xl px-3 py-2"
			>
				{loading && (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
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
							<div
								key={`pdf-page-${index + 1}`}
								className="mb-4 last:mb-0 bg-white shadow-[0_12px_40px_-24px_rgba(0,0,0,0.35)]"
							>
								<Page
									pageNumber={index + 1}
									width={pageWidth || undefined}
									scale={scale}
									renderTextLayer={false}
									renderAnnotationLayer={false}
								/>
							</div>
						))}
					</Document>
				) : null}
			</div>
		</div>
	);
}
