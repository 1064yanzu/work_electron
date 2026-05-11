import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { SPRITE_ATLAS, type SpriteRowSpec } from "../../lib/mascot/manifest";

function useIsVisible(ref: React.RefObject<Element | null>): boolean {
	const [visible, setVisible] = useState(true);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const obs = new IntersectionObserver(
			([entry]) => setVisible(entry.isIntersecting),
			{ threshold: 0 },
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, [ref]);
	return visible;
}

export interface SpriteAnimatorProps {
	atlasUrl: string;
	row: SpriteRowSpec;
	/** 渲染尺寸（CSS px），保持单元格宽高比 192:208 */
	size?: number;
	className?: string;
	/** 是否暂停（不可见时省 CPU） */
	paused?: boolean;
	/** 是否循环播放，false 时停在最后一帧 */
	loop?: boolean;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * SpriteAnimator — 用 background-position 切帧的 spritesheet 播放器
 *
 * 几何来自 SPRITE_ATLAS（codex hatch-pet 标准 192×208 单格 / 8 列 × 9 行）
 * - 帧时长由 row.durations 数组逐帧驱动（不等帧 = 活物呼吸感）
 * - prefers-reduced-motion 时停在第 0 帧
 * - paused 时停在当前帧（visibility 优化）
 */
export function SpriteAnimator({
	atlasUrl,
	row,
	size = 96,
	className,
	paused = false,
	loop = true,
}: SpriteAnimatorProps) {
	const [frame, setFrame] = useState(0);
	const reducedRef = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const isVisible = useIsVisible(containerRef);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const mq = window.matchMedia(REDUCED_MOTION_QUERY);
		reducedRef.current = mq.matches;
		const handler = (e: MediaQueryListEvent) => {
			reducedRef.current = e.matches;
		};
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	useEffect(() => {
		if (paused || !isVisible || reducedRef.current) return;
		if (row.frameCount <= 1) return;

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let current = frame;

		const tick = () => {
			if (cancelled) return;
			const duration = row.durations[current] ?? 200;
			timer = setTimeout(() => {
				if (cancelled) return;
				const next = current + 1;
				if (next >= row.frameCount) {
					if (!loop) return;
					current = 0;
				} else {
					current = next;
				}
				setFrame(current);
				tick();
			}, duration);
		};

		tick();
		return () => {
			cancelled = true;
			if (timer !== null) clearTimeout(timer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [row.rowIndex, row.frameCount, paused, loop, isVisible]);

	// reduced-motion 直接停第 0 帧
	const renderFrame = reducedRef.current ? 0 : frame;
	const cell = SPRITE_ATLAS;
	const scale = size / cell.cellWidth;
	const bgWidth = cell.atlasWidth * scale;
	const bgHeight = cell.atlasHeight * scale;
	const offsetX = -renderFrame * cell.cellWidth * scale;
	const offsetY = -row.rowIndex * cell.cellHeight * scale;
	const renderHeight = size * (cell.cellHeight / cell.cellWidth);

	return (
		<div
			ref={containerRef}
			role="img"
			aria-hidden="true"
			className={cn("inline-block select-none", className)}
			style={{
				width: `${size}px`,
				height: `${renderHeight}px`,
				backgroundImage: `url(${atlasUrl})`,
				backgroundRepeat: "no-repeat",
				backgroundPosition: `${offsetX}px ${offsetY}px`,
				backgroundSize: `${bgWidth}px ${bgHeight}px`,
				imageRendering: "auto",
			}}
		/>
	);
}
