import {
	ChevronLeft,
	ChevronRight,
	Download,
	FileWarning,
	Loader2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { safeInvoke } from "../../../lib/tauriBridge";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
	src: string;
	className?: string;
}

export default function PdfViewer({ src, className }: PdfViewerProps) {
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

	const onDocumentLoadError = useCallback((loadError: Error) => {
		console.error("PDF 加载失败:", loadError);
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
		<div className={`flex flex-col ${className || ""}`}>
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
