import { useEffect, useRef, useState } from "react";
import { gsap, useMotionLevel } from "../../lib/motion";
import { cn } from "../../lib/utils";
import { SPRITE_ATLAS, type SpriteRowSpec } from "../../lib/mascot/manifest";

function useIsVisible(ref: React.RefObject<Element | null>): boolean {
	const [visible, setVisible] = useState(true);
	// 用 ref 保存最新的 IntersectionObserver 状态，避免闭包陷阱
	const isIntersectingRef = useRef(true);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const update = () => {
			setVisible(isIntersectingRef.current && !document.hidden);
		};

		const obs = new IntersectionObserver(
			([entry]) => {
				isIntersectingRef.current = entry.isIntersecting;
				update();
			},
			{ threshold: 0 },
		);
		obs.observe(el);

		// 监听窗口/标签页可见性变化（最小化、切换后台等场景）
		document.addEventListener("visibilitychange", update);

		return () => {
			obs.disconnect();
			document.removeEventListener("visibilitychange", update);
		};
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

/**
 * SpriteAnimator — 用 background-position 切帧的 spritesheet 播放器
 *
 * 几何来自 SPRITE_ATLAS（codex hatch-pet 标准 192×208 单格 / 8 列 × 9 行）
 * - 帧时长由 row.durations 数组逐帧驱动（不等帧 = 活物呼吸感）
 * - reduce-motion 时停在第 0 帧
 * - paused 时停在当前帧（visibility 优化）
 *
 * ## 为什么切到 gsap.ticker
 *
 * 原实现是「每帧一个 `setTimeout` + `setState`」：
 * - 一个 8 帧动作 = 每秒 5–8 次组件重渲染，桌宠窗口和主窗口的 Mascot 各自算一份；
 * - 每个实例一条独立的 timer 链，页面上有 N 个 Mascot 就有 N 条，
 *   彼此不同步，也不跟浏览器的绘制节奏对齐（setTimeout 的时机漂移会累积）。
 *
 * 换成 `gsap.ticker` 后：全应用共用一条 rAF 时钟，帧号写进 ref、
 * 帧偏移直接写 DOM 的 `backgroundPosition`，**一次 React 重渲染都不产生**。
 * 页面隐藏时 rAF 本身就停，CPU 顺带省下来；
 * `gsapCore` 里设了 `lagSmoothing(500, 33)`，切回前台不会一次补播几十帧。
 */
export function SpriteAnimator({
	atlasUrl,
	row,
	size = 96,
	className,
	paused = false,
	loop = true,
}: SpriteAnimatorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const isVisible = useIsVisible(containerRef);
	const level = useMotionLevel();
	const reduced = level === "reduced";
	const frameRef = useRef(0);

	const cell = SPRITE_ATLAS;
	const scale = size / cell.cellWidth;
	const bgWidth = cell.atlasWidth * scale;
	const bgHeight = cell.atlasHeight * scale;
	const offsetY = -row.rowIndex * cell.cellHeight * scale;
	const renderHeight = size * (cell.cellHeight / cell.cellWidth);
	const frameStep = cell.cellWidth * scale;

	// 换动作 / 换尺寸时回到第 0 帧；paused 切换刻意不重置，保持"停在当前帧"
	useEffect(() => {
		frameRef.current = 0;
	}, [row.rowIndex, size]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const applyFrame = (index: number) => {
			el.style.backgroundPosition = `${-index * frameStep}px ${offsetY}px`;
		};

		if (reduced) {
			frameRef.current = 0;
			applyFrame(0);
			return;
		}
		// 立刻把当前帧写回：React 重渲染时 style 里写的是 frameRef 的快照，
		// 但 size / row 变化会重算几何，这里补一次避免闪一帧旧偏移
		applyFrame(frameRef.current);

		if (paused || !isVisible || row.frameCount <= 1) return;

		let elapsed = 0;
		const onTick = (_time: number, deltaMs: number) => {
			elapsed += deltaMs;
			const need = row.durations[frameRef.current] ?? 200;
			if (elapsed < need) return;
			// 减而不清零：帧时长不是 16.7ms 的整数倍，清零会让长动作越播越慢
			elapsed -= need;
			const next = frameRef.current + 1;
			if (next >= row.frameCount) {
				if (!loop) {
					gsap.ticker.remove(onTick);
					return;
				}
				frameRef.current = 0;
			} else {
				frameRef.current = next;
			}
			applyFrame(frameRef.current);
		};

		gsap.ticker.add(onTick);
		return () => {
			gsap.ticker.remove(onTick);
		};
	}, [
		row.rowIndex,
		row.frameCount,
		row.durations,
		paused,
		loop,
		isVisible,
		reduced,
		frameStep,
		offsetY,
	]);

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
				backgroundPosition: `${-frameRef.current * frameStep}px ${offsetY}px`,
				backgroundSize: `${bgWidth}px ${bgHeight}px`,
				imageRendering: "auto",
			}}
		/>
	);
}
