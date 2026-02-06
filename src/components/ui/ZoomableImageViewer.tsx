import { Minus, Move, Plus, Scan, X, ZoomIn, ZoomOut } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "../../lib/utils";

type Point = { x: number; y: number };

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.2;

function clampScale(value: number, min = MIN_SCALE, max = MAX_SCALE) {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, value));
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	return (
		tag === "input" ||
		tag === "textarea" ||
		tag === "select" ||
		target.isContentEditable
	);
}

export interface ZoomableImageViewerProps {
	src: string;
	alt?: string;
	className?: string;
	minScale?: number;
	maxScale?: number;
	onRequestClose?: () => void;
	actionsSlot?: ReactNode;
	enableKeyboard?: boolean;
	imageClassName?: string;
}

export function ZoomableImageViewer({
	src,
	alt = "image",
	className,
	minScale = MIN_SCALE,
	maxScale = MAX_SCALE,
	onRequestClose,
	actionsSlot,
	enableKeyboard = true,
	imageClassName,
}: ZoomableImageViewerProps) {
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
	const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
	const [scale, setScale] = useState(1);
	const [fitScale, setFitScale] = useState(1);
	const [isFitMode, setIsFitMode] = useState(true);
	const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const dragRef = useRef<{
		pointerId: number;
		start: Point;
		originPan: Point;
	} | null>(null);

	const scalePercent = useMemo(() => Math.round(scale * 100), [scale]);

	const recalcFitScale = useCallback(() => {
		const vw = viewportRef.current?.clientWidth || 0;
		const vh = viewportRef.current?.clientHeight || 0;
		const iw = naturalSize.width;
		const ih = naturalSize.height;
		if (vw <= 0 || vh <= 0 || iw <= 0 || ih <= 0) return;

		const nextFit = clampScale(Math.min(vw / iw, vh / ih), minScale, maxScale);
		setFitScale(nextFit);
		if (isFitMode) {
			setScale(nextFit);
			setPan({ x: 0, y: 0 });
		}
	}, [isFitMode, maxScale, minScale, naturalSize.height, naturalSize.width]);

	useEffect(() => {
		setScale(1);
		setFitScale(1);
		setIsFitMode(true);
		setPan({ x: 0, y: 0 });
		setNaturalSize({ width: 0, height: 0 });
	}, [src]);

	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;

		const update = () => {
			setViewportSize({ width: el.clientWidth, height: el.clientHeight });
		};
		update();

		const observer = new ResizeObserver(() => update());
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		recalcFitScale();
	}, [recalcFitScale, viewportSize.height, viewportSize.width]);

	const setFit = useCallback(() => {
		setIsFitMode(true);
		setScale(fitScale);
		setPan({ x: 0, y: 0 });
	}, [fitScale]);

	const setActual = useCallback(() => {
		setIsFitMode(false);
		setScale(clampScale(1, minScale, maxScale));
		setPan({ x: 0, y: 0 });
	}, [maxScale, minScale]);

	const applyScale = useCallback(
		(next: number, preservePan = true) => {
			const clamped = clampScale(next, minScale, maxScale);
			setScale(clamped);
			setIsFitMode(false);
			if (!preservePan) setPan({ x: 0, y: 0 });
		},
		[maxScale, minScale],
	);

	const zoomIn = useCallback(() => {
		applyScale(scale * ZOOM_STEP);
	}, [applyScale, scale]);

	const zoomOut = useCallback(() => {
		applyScale(scale / ZOOM_STEP);
	}, [applyScale, scale]);

	const handleWheel = useCallback(
		(e: React.WheelEvent<HTMLDivElement>) => {
			e.preventDefault();
			const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
			applyScale(scale * factor);
		},
		[applyScale, scale],
	);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (e.button !== 0 && e.pointerType !== "touch") return;
			setIsDragging(true);
			dragRef.current = {
				pointerId: e.pointerId,
				start: { x: e.clientX, y: e.clientY },
				originPan: pan,
			};
			e.currentTarget.setPointerCapture(e.pointerId);
		},
		[pan],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== e.pointerId) return;
			const dx = e.clientX - drag.start.x;
			const dy = e.clientY - drag.start.y;
			setPan({ x: drag.originPan.x + dx, y: drag.originPan.y + dy });
		},
		[],
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (dragRef.current?.pointerId === e.pointerId) {
				setIsDragging(false);
				dragRef.current = null;
				try {
					e.currentTarget.releasePointerCapture(e.pointerId);
				} catch {
					// ignore
				}
			}
		},
		[],
	);

	const handleDoubleClick = useCallback(() => {
		if (Math.abs(scale - fitScale) < 0.02) {
			applyScale(Math.max(1, fitScale * 1.8), false);
			return;
		}
		setFit();
	}, [applyScale, fitScale, scale, setFit]);

	useEffect(() => {
		if (!enableKeyboard) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			if (e.key === "Escape") {
				onRequestClose?.();
				return;
			}
			if (e.key === "+" || (e.key === "=" && e.shiftKey)) {
				e.preventDefault();
				zoomIn();
				return;
			}
			if (e.key === "-" || e.key === "_") {
				e.preventDefault();
				zoomOut();
				return;
			}
			if (e.key === "0") {
				e.preventDefault();
				setActual();
				return;
			}
			if (e.key.toLowerCase() === "f") {
				e.preventDefault();
				setFit();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [enableKeyboard, onRequestClose, setActual, setFit, zoomIn, zoomOut]);

	return (
		<div className={cn("relative w-full h-full overflow-hidden", className)}>
			<div className="absolute left-1/2 -translate-x-1/2 top-3 z-20 flex items-center gap-1.5 rounded-2xl bg-white/85 dark:bg-zinc-900/80 backdrop-blur-md px-2 py-1.5 ring-1 ring-black/5 dark:ring-white/10 shadow-[0_12px_35px_-25px_rgba(0,0,0,0.55)]">
				<button
					type="button"
					onClick={zoomOut}
					className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
					title="缩小 (-)"
				>
					<Minus className="w-4 h-4" />
				</button>
				<div className="min-w-[64px] text-center text-xs font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">
					{scalePercent}%
				</div>
				<button
					type="button"
					onClick={zoomIn}
					className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
					title="放大 (+)"
				>
					<Plus className="w-4 h-4" />
				</button>
				<div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
				<button
					type="button"
					onClick={setFit}
					className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
					title="适配窗口 (F)"
				>
					<Scan className="w-3.5 h-3.5" />
					适配
				</button>
				<button
					type="button"
					onClick={setActual}
					className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
					title="原始大小 (0)"
				>
					<ZoomIn className="w-3.5 h-3.5" />
					100%
				</button>
				<div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
				<div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-100/70 dark:bg-zinc-800/70">
					<Move className="w-3 h-3" />
					拖拽
				</div>
				{actionsSlot ? (
					<div className="ml-1 pl-1 border-l border-zinc-200 dark:border-zinc-700">
						{actionsSlot}
					</div>
				) : null}
				{onRequestClose ? (
					<button
						type="button"
						onClick={onRequestClose}
						className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						title="关闭 (Esc)"
					>
						<X className="w-4 h-4" />
					</button>
				) : null}
			</div>

			<div
				ref={viewportRef}
				className={cn(
					"w-full h-full overflow-hidden touch-none",
					isDragging ? "cursor-grabbing" : "cursor-grab",
				)}
				onWheel={handleWheel}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onDoubleClick={handleDoubleClick}
			>
				<img
					src={src}
					alt={alt}
					onLoad={(e) => {
						const el = e.currentTarget;
						setNaturalSize({
							width: el.naturalWidth || 0,
							height: el.naturalHeight || 0,
						});
					}}
					className={cn(
						"absolute left-1/2 top-1/2 select-none pointer-events-none",
						imageClassName,
					)}
					style={{
						transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
						transformOrigin: "center center",
						maxWidth: "none",
						maxHeight: "none",
					}}
					draggable={false}
				/>
			</div>

			<div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/50 text-white text-[11px] px-2.5 py-1 inline-flex items-center gap-1.5">
				<ZoomOut className="w-3 h-3" />
				滚轮缩放 / 双击切换 / 拖拽平移
			</div>
		</div>
	);
}
