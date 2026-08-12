import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { Page } from "react-pdf";

/** 渲染窗口半径：当前"中心页"前后各渲染多少页真实内容，其余用占位 div 代替。 */
export const PDF_VIRTUALIZATION_DEFAULT_MARGIN = 2;

/** A4 纸张高宽比，页面从未真实渲染过时用它 * 宽度估算占位高度。 */
const FALLBACK_ASPECT_RATIO = 1.414;

interface PdfPageWithMeasurementProps {
	pageNumber: number;
	width: number | undefined;
	scale: number;
	renderTextLayer: boolean;
	renderAnnotationLayer: boolean;
	onMeasured: (pageNumber: number, height: number) => void;
	loading?: ReactNode;
}

/** 真实渲染一页 PDF，并在渲染成功后测量其实际高度回传给父级做占位高度缓存。 */
function PdfPageWithMeasurement({
	pageNumber,
	width,
	scale,
	renderTextLayer,
	renderAnnotationLayer,
	onMeasured,
	loading,
}: PdfPageWithMeasurementProps) {
	const measureRef = useRef<HTMLDivElement | null>(null);

	const handleRenderSuccess = useCallback(() => {
		const el = measureRef.current;
		if (!el) return;
		const height = el.getBoundingClientRect().height;
		if (height > 0) onMeasured(pageNumber, height);
	}, [pageNumber, onMeasured]);

	return (
		<div ref={measureRef}>
			<Page
				pageNumber={pageNumber}
				width={width}
				scale={scale}
				renderTextLayer={renderTextLayer}
				renderAnnotationLayer={renderAnnotationLayer}
				onRenderSuccess={handleRenderSuccess}
				loading={loading}
			/>
		</div>
	);
}

interface VirtualizedPdfPageListProps {
	/** PDF 总页数。 */
	numPages: number;
	/** 传给 react-pdf `Page` 的目标宽度（CSS px）。 */
	pageWidth: number | undefined;
	/** 缩放比例。 */
	scale: number;
	/** 渲染窗口半径，默认前后各 2 页。 */
	renderMargin?: number;
	renderTextLayer?: boolean;
	renderAnnotationLayer?: boolean;
	/** 每一页外层容器（承载 IntersectionObserver + 占位高度）的 className。 */
	getPageWrapperClassName?: (pageNumber: number) => string | undefined;
	/** 未进入渲染窗口时的占位内容，height 为该页缓存/估算的高度。 */
	renderPlaceholder?: (pageNumber: number, height: number) => ReactNode;
	/** 真实渲染但尚未完成解码时的 loading 占位内容。 */
	renderPageLoading?: (pageNumber: number, height: number) => ReactNode;
	/** 当前视口内"最靠上的可见页"发生变化时回调，可用于同步页码显示。 */
	onActivePageChange?: (pageNumber: number) => void;
}

/**
 * PDF 页面虚拟化列表。
 *
 * 策略：
 * 1. 用一个共享的 IntersectionObserver 监测每一页外层容器的可见性；
 * 2. 取当前可见页里页码最小（最靠上）的一页作为"中心页"；
 * 3. 仅对 [中心页 - margin, 中心页 + margin] 区间内的页面做真实的
 *    canvas + textLayer 渲染（react-pdf `<Page>`），其余页面用一个按
 *    该页真实高度（若已测量过）或估算高度撑开的占位 div 代替，避免
 *    滚动条位置/总高度跳动；
 * 4. 每一页首次真实渲染完成后测量其真实高度并缓存，之后再次被换成
 *    占位 div 时会使用真实高度，不会再产生跳动；尚未测量过的页面则
 *    使用「已测量页面的平均高度」或 A4 纸张比例兜底估算。
 */
export function VirtualizedPdfPageList({
	numPages,
	pageWidth,
	scale,
	renderMargin = PDF_VIRTUALIZATION_DEFAULT_MARGIN,
	renderTextLayer = true,
	renderAnnotationLayer = true,
	getPageWrapperClassName,
	renderPlaceholder,
	renderPageLoading,
	onActivePageChange,
}: VirtualizedPdfPageListProps) {
	const [activePage, setActivePage] = useState(1);
	// 使用 state 只是为了在高度测量更新后触发重渲染，实际数据存在 ref 里避免高频抖动。
	const [heightVersion, setHeightVersion] = useState(0);
	const heightsRef = useRef<Map<number, number>>(new Map());
	const visiblePagesRef = useRef<Set<number>>(new Set());
	const pageByElementRef = useRef<Map<Element, number>>(new Map());
	const wrapperElsRef = useRef<Map<number, Element>>(new Map());
	const observerRef = useRef<IntersectionObserver | null>(null);

	// 文档切换（页数变化）时重置所有虚拟化状态，避免残留上一本书的高度缓存。
	useEffect(() => {
		heightsRef.current = new Map();
		visiblePagesRef.current = new Set();
		setActivePage(1);
		setHeightVersion((n) => n + 1);
	}, [numPages]);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				let changed = false;
				for (const entry of entries) {
					const pageNumber = pageByElementRef.current.get(entry.target);
					if (!pageNumber) continue;
					const wasVisible = visiblePagesRef.current.has(pageNumber);
					if (entry.isIntersecting && !wasVisible) {
						visiblePagesRef.current.add(pageNumber);
						changed = true;
					} else if (!entry.isIntersecting && wasVisible) {
						visiblePagesRef.current.delete(pageNumber);
						changed = true;
					}
				}
				if (changed && visiblePagesRef.current.size > 0) {
					const next = Math.min(...visiblePagesRef.current);
					setActivePage((prev) => (prev === next ? prev : next));
				}
			},
			// rootMargin 留一点余量，让即将进入视口的相邻页提前进入渲染窗口，减少可感知的白屏。
			{ rootMargin: "200px 0px", threshold: 0 },
		);
		observerRef.current = observer;
		// 把已经挂载的容器补充注册进新 observer（例如 numPages 变化重建 observer 时）。
		for (const [pageNumber, el] of wrapperElsRef.current) {
			pageByElementRef.current.set(el, pageNumber);
			observer.observe(el);
		}
		return () => {
			observer.disconnect();
		};
	}, [numPages]);

	useEffect(() => {
		onActivePageChange?.(activePage);
	}, [activePage, onActivePageChange]);

	const wrapperRefCallbacks = useRef<
		Map<number, (el: HTMLDivElement | null) => void>
	>(new Map());
	const getWrapperRefCallback = useCallback((pageNumber: number) => {
		let cb = wrapperRefCallbacks.current.get(pageNumber);
		if (cb) return cb;
		cb = (el: HTMLDivElement | null) => {
			const observer = observerRef.current;
			const prevEl = wrapperElsRef.current.get(pageNumber);
			if (prevEl && observer) {
				observer.unobserve(prevEl);
				pageByElementRef.current.delete(prevEl);
			}
			if (el) {
				wrapperElsRef.current.set(pageNumber, el);
				pageByElementRef.current.set(el, pageNumber);
				observer?.observe(el);
			} else {
				wrapperElsRef.current.delete(pageNumber);
			}
		};
		wrapperRefCallbacks.current.set(pageNumber, cb);
		return cb;
	}, []);

	const fallbackHeight = useMemo(() => {
		const measured = heightsRef.current;
		if (measured.size > 0) {
			let sum = 0;
			for (const h of measured.values()) sum += h;
			return sum / measured.size;
		}
		return (pageWidth || 600) * FALLBACK_ASPECT_RATIO * scale;
		// heightVersion 变化代表 heightsRef 内容发生了更新，需要重新计算平均值。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pageWidth, scale, heightVersion]);

	const handleMeasured = useCallback((pageNumber: number, height: number) => {
		const prev = heightsRef.current.get(pageNumber);
		// 允许小范围误差内不触发重渲染，减少无意义更新。
		if (prev === undefined || Math.abs(prev - height) > 1) {
			heightsRef.current.set(pageNumber, height);
			setHeightVersion((n) => n + 1);
		}
	}, []);

	const windowStart = Math.max(1, activePage - renderMargin);
	const windowEnd = Math.min(numPages, activePage + renderMargin);

	const pages: ReactNode[] = [];
	for (let p = 1; p <= numPages; p++) {
		const shouldRender = p >= windowStart && p <= windowEnd;
		const height = heightsRef.current.get(p) ?? fallbackHeight;
		pages.push(
			<div
				key={p}
				ref={getWrapperRefCallback(p)}
				data-page-container=""
				data-page-number={p}
				className={getPageWrapperClassName?.(p)}
				style={shouldRender ? undefined : { height }}
			>
				{shouldRender ? (
					<PdfPageWithMeasurement
						pageNumber={p}
						width={pageWidth}
						scale={scale}
						renderTextLayer={renderTextLayer}
						renderAnnotationLayer={renderAnnotationLayer}
						onMeasured={handleMeasured}
						loading={renderPageLoading?.(p, height)}
					/>
				) : (
					(renderPlaceholder?.(p, height) ?? null)
				)}
			</div>,
		);
	}

	return <>{pages}</>;
}
