import { useCallback, useEffect, useRef, useState } from "react";
import { Document, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

import { usePdfDocumentSource } from "../../pdf/usePdfDocumentSource";
import { VirtualizedPdfPageList } from "../../pdf/VirtualizedPdfPageList";
import type { ReaderEngineProps, ReaderEngineSelection } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

// pdfjs 的 cmaps（中日韩字体回退）/ standard_fonts（西文回退）/ wasm（OpenJPEG 解码）
// 由 scripts/copy-pdfjs-assets.mjs 同步到 public/pdfjs/，运行时通过相对 URL 加载。
// 不传这些 URL 会导致渲染中文 PDF 时 console 出现大量 cMapUrl/wasmUrl/字体替换警告。
const PDFJS_OPTIONS = {
	cMapUrl: "pdfjs/cmaps/",
	cMapPacked: true,
	standardFontDataUrl: "pdfjs/standard_fonts/",
	wasmUrl: "pdfjs/wasm/",
};

export default function PdfEngine({
	book,
	chapter,
	typography,
	onPositionChange,
	onSelectionChange,
	onUserActivity,
	onRequestNavigate,
	seekRequest,
	className,
}: ReaderEngineProps) {
	const { documentSource: documentFile, error: loadError } =
		usePdfDocumentSource(book.storage_path);
	const [numPages, setNumPages] = useState(0);
	const [scale, setScale] = useState(1.0);
	const [pageWidth, setPageWidth] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const lastReportedPageRef = useRef<number>(1);

	const error = loadError ? `PDF 加载失败：${loadError}` : null;

	useEffect(() => {
		setNumPages(0);
	}, [book.storage_path]);

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

	// 高亮 / 书签点击跳转：locator 形如 `pdf:page:N:offset-...`，
	// ReaderShell 把它转成 `{ kind: "pdfPage", page: N }` 下发；
	// PDF 没有"章内字符 offset"的概念，仅滚到对应页即可。
	useEffect(() => {
		if (!seekRequest || seekRequest.kind !== "pdfPage") return;
		const scrollEl = scrollRef.current;
		if (!scrollEl || numPages === 0) return;
		const target = Math.max(1, Math.min(seekRequest.page, numPages));
		const pages = scrollEl.querySelectorAll("[data-page-container]");
		const el = pages[target - 1] as HTMLElement | undefined;
		if (!el) return;
		el.scrollIntoView({ behavior: "smooth", block: "start" });
		el.classList.add("reader-target-flash");
		setTimeout(() => el.classList.remove("reader-target-flash"), 1400);
		setCurrentPage(target);
	}, [seekRequest, numPages]);

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
						options={PDFJS_OPTIONS}
					>
						<VirtualizedPdfPageList
							numPages={numPages}
							pageWidth={pageWidth || undefined}
							scale={scale}
							getPageWrapperClassName={() => "reader-engine__pdf-page"}
						/>
					</Document>
				) : null}
			</div>
		</div>
	);
}
