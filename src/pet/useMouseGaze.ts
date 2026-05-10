/**
 * useMouseGaze — 让角色轻微跟随鼠标方向偏移（"视线追随"）
 *
 * 实现：监听窗口内 mousemove，计算相对窗口中心的偏移，输出 ±3px 限幅 transform。
 * 平滑：requestAnimationFrame lerp（0.15）向目标靠近，松手后 200ms 回到原位。
 *
 * 只在以下情况输出非零偏移：
 * - 鼠标在 PetApp 窗口内（mouseover）；
 * - 当前没有拖动（isDragging=false）；
 * - 系统 prefers-reduced-motion ≠ reduce。
 */

import { useEffect, useRef, useState } from "react";

export interface GazeOffset {
	tx: number;
	ty: number;
}

const MAX_OFFSET = 3; // px
const LERP = 0.15;

export function useMouseGaze(active: boolean): GazeOffset {
	const [offset, setOffset] = useState<GazeOffset>({ tx: 0, ty: 0 });
	const targetRef = useRef<GazeOffset>({ tx: 0, ty: 0 });
	const rafRef = useRef<number | null>(null);
	const curRef = useRef<GazeOffset>({ tx: 0, ty: 0 });

	useEffect(() => {
		if (!active) return;
		// 尊重 prefers-reduced-motion
		if (
			typeof window !== "undefined" &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		const onMove = (e: MouseEvent) => {
			const cx = window.innerWidth / 2;
			const cy = window.innerHeight / 2;
			// 归一化 [-1, 1]，限制到 MAX_OFFSET
			const nx = Math.max(
				-1,
				Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)),
			);
			const ny = Math.max(
				-1,
				Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)),
			);
			targetRef.current = {
				tx: nx * MAX_OFFSET,
				ty: ny * MAX_OFFSET,
			};
		};

		const onLeave = () => {
			targetRef.current = { tx: 0, ty: 0 };
		};

		const tick = () => {
			const cur = curRef.current;
			const target = targetRef.current;
			const next = {
				tx: cur.tx + (target.tx - cur.tx) * LERP,
				ty: cur.ty + (target.ty - cur.ty) * LERP,
			};
			curRef.current = next;
			// 只在差值有意义时 setState 避免无用重渲染
			if (
				Math.abs(next.tx - offset.tx) > 0.05 ||
				Math.abs(next.ty - offset.ty) > 0.05
			) {
				setOffset(next);
			}
			rafRef.current = requestAnimationFrame(tick);
		};

		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseleave", onLeave);
		rafRef.current = requestAnimationFrame(tick);

		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseleave", onLeave);
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		};
	}, [active, offset.tx, offset.ty]);

	return offset;
}
