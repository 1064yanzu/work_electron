import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

import { safeInvoke } from "../../../lib/tauriBridge";
import type { ReaderEngineProps, ReaderEngineSelection } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

type DocumentSource = string | { data: Uint8Array };

export default function PdfEngine({
	book,
	chapter,
	typography,
	onPositionChange,
	onSelectionChange,
	onUserActivity,
	onRequestNavigate,
	className,
}: ReaderEngineProps) {
	const [documentFile, setDocumentFile] = useState<DocumentSource | null>(null);
	const [numPages, setNumPages] = useState(0);
	const [scale, setScale] = useState(1.0);
	const [pageWidth, setPageWidth] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [error, setError] = useState<string | null>(null);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const lastReportedPageRef = useRef<number>(1);

	const isRemote = useMemo(
		() =>
			book.storage_path.startsWith("http://") ||
			book.storage_path.startsWith("https://") ||
			book.storage_path.startsWith("data:") ||
			book.storage_path.startsWith("blob:"),
		[book.storage_path],
	);

	useEffect(() => {
		let cancelled = false;
		setDocumentFile(null);
		setError(null);
		setNumPages(0);

		if (isRemote) {
			setDocumentFile(book.storage_path);
			return;
		}

		(async () => {
			try {
				const result = await safeInvoke<{ content: string; encoding: string }>(
					"read_file_safe",
					{ payload: { path: book.storage_path, encoding: "base64" } },
				);
				if (cancelled) return;
				const base64 = result?.content ?? "";
				if (!base64) throw new Error("PDF 内容为空");
				const bin = atob(base64);
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				setDocumentFile({ data: bytes });
			} catch (e) {
				if (cancelled) return;
				setError(`PDF 加载失败：${e instanceof Error ? e.message : String(e)}`);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [book.storage_path, isRemote]);

	useEffect(() => {
		const node = containerRef.current;
		if (!node) return;
		const update = () =>
			setPageWidth(Math.max(320, Math.floor(node.clientWidth - 40)));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}, [documentFile]);

	// 章节切换：跳转页码（chapter.id 形如 page-N）
	useEffect(() => {
		if (!chapter || numPages === 0) return;
		const m = chapter.id.match(/^page-(\d+)$/);
		const target = m ? Number(m[1]) : 1;
		if (target < 1 || target > numPages) return;
		const scrollEl = scrollRef.current;
		if (!scrollEl) return;
		const pages = scrollEl.querySelectorAll("[data-page-container]");
		const el = pages[target - 1] as HTMLElement | undefined;
		el?.scrollIntoView({ behavior: "instant", block: "start" });
		setCurrentPage(target);
	}, [chapter?.id, numPages]);

	const handleDocumentLoadSuccess = useCallback(
		({ numPages: n }: { numPages: number }) => {
			setNumPages(n);
		},
		[],
	);

	const reportSelection = useCallback(() => {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed) return onSelectionChange?.(null);
		const text = sel.toString().trim();
		if (text.length < 2) return onSelectionChange?.(null);
		const range = sel.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		const page = currentPage;
		const payload: ReaderEngineSelection = {
			text,
			rect,
			locator_start: `pdf:page:${page}:offset-start`,
			locator_end: `pdf:page:${page}:offset-end`,
		};
		onSelectionChange?.(payload);
	}, [currentPage, onSelectionChange]);

	useEffect(() => {
		const root = scrollRef.current;
		if (!root) return;
		const onMouseUp = () => reportSelection();
		root.addEventListener("mouseup", onMouseUp);
		return () => {
			root.removeEventListener("mouseup", onMouseUp);
		};
	}, [reportSelection]);

	useEffect(() => {
		const root = scrollRef.current;
		if (!root || numPages === 0) return;
		let raf = 0;
		const onScroll = () => {
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				const pages = root.querySelectorAll("[data-page-container]");
				const rootTop = root.getBoundingClientRect().top;
				let activePage = currentPage;
				for (let i = 0; i < pages.length; i++) {
					const r = (pages[i] as HTMLElement).getBoundingClientRect();
					if (r.top - rootTop > 80) break;
					activePage = i + 1;
				}
				if (activePage !== lastReportedPageRef.current) {
					lastReportedPageRef.current = activePage;
					setCurrentPage(activePage);
					const pct = Math.max(0, Math.min(1, activePage / numPages));
					onPositionChange?.(`pdf:page:${activePage}`, pct);
					onUserActivity?.();
				}
			});
		};
		root.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			root.removeEventListener("scroll", onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	}, [numPages, currentPage, onPositionChange, onUserActivity]);

	const pageList = useMemo(
		() => Array.from({ length: numPages }, (_, i) => i + 1),
		[numPages],
	);

	if (error) {
		return (
			<div className="reader-engine-error">
				<p>{error}</p>
				<button
					type="button"
					onClick={() => onRequestNavigate?.("to", "page-1")}
					className="reader-engine-error__action"
				>
					重新加载
				</button>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={`reader-engine reader-engine--pdf ${className ?? ""}`}
			data-format="pdf"
			style={{
				fontFamily: typography.fontFamilyStack,
			}}
		>
			<div className="reader-engine__pdf-toolbar">
				<span className="reader-engine__pdf-page">
					第 {currentPage} / {numPages || "..."} 页
				</span>
				<div className="reader-engine__pdf-zoom">
					<button
						type="button"
						onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}
						aria-label="缩小"
					>
						-
					</button>
					<span>{Math.round(scale * 100)}%</span>
					<button
						type="button"
						onClick={() => setScale((s) => Math.min(3.0, s + 0.2))}
						aria-label="放大"
					>
						+
					</button>
				</div>
			</div>
			<div ref={scrollRef} className="reader-engine__pdf-scroll">
				{documentFile ? (
					<Document
						file={documentFile}
						onLoadSuccess={handleDocumentLoadSuccess}
						loading={null}
						className="reader-engine__pdf-doc"
					>
						{pageList.map((p) => (
							<div
								key={p}
								data-page-container=""
								className="reader-engine__pdf-page"
							>
								<Page
									pageNumber={p}
									width={pageWidth || undefined}
									scale={scale}
									renderTextLayer
									renderAnnotationLayer
								/>
							</div>
						))}
					</Document>
				) : null}
			</div>
		</div>
	);
}
