/**
 * useMouseGaze — 让角色轻微跟随鼠标方向偏移（"视线追随"）
 *
 * 实现：监听窗口内 mousemove，计算相对窗口中心的偏移，**用 gsap.quickTo 直接写
 * 目标元素的 x/y**，限幅 ±6px；鼠标离开窗口回到原位。
 *
 * ## 为什么不返回 state
 *
 * 改造前这个 hook 每个 rAF 帧 `setOffset` 一次，PetApp（1200+ 行）就跟着
 * 60fps 重渲染——桌宠只是想歪一下头，代价是整棵树 reconcile。
 * quickTo 是 GSAP 为"高频改同一个属性"准备的通道：内部复用同一个 tween，
 * 每帧只写一次 inline transform，完全不经过 React。
 *
 * 只在以下情况输出非零偏移：
 * - 鼠标在 PetApp 窗口内（mouseleave 归零）；
 * - 调用方传入 active=true（拖动 / 贴边偷看时会关掉）；
 * - 动效档位不是 reduced。
 *
 * ⚠️ 目标元素必须是**只给这个 hook 写 transform** 的专用容器：
 * 和 React 计算出来的 style.transform 放在同一个元素上会互相覆盖。
 */

import { useEffect, type RefObject } from "react";

import { gsap, isReducedMotion } from "../lib/motion";

const MAX_OFFSET = 6; // px
/** quickTo 的跟随时长：越小越跟手，0.4s 接近原来 lerp 0.2 的手感 */
const FOLLOW_DURATION = 0.4;

export function useMouseGaze(
	active: boolean,
	targetRef: RefObject<HTMLElement | null>,
): void {
	useEffect(() => {
		const element = targetRef.current;
		if (!element) return;

		if (!active || isReducedMotion()) {
			// 关掉时把偏移收回原位，避免停在歪着的位置
			gsap.to(element, { x: 0, y: 0, duration: 0.2, overwrite: "auto" });
			return;
		}

		const moveX = gsap.quickTo(element, "x", {
			duration: FOLLOW_DURATION,
			ease: "power3",
		});
		const moveY = gsap.quickTo(element, "y", {
			duration: FOLLOW_DURATION,
			ease: "power3",
		});

		const onMove = (e: MouseEvent) => {
			const halfW = window.innerWidth / 2;
			const halfH = window.innerHeight / 2;
			const nx = Math.max(-1, Math.min(1, (e.clientX - halfW) / halfW));
			const ny = Math.max(-1, Math.min(1, (e.clientY - halfH) / halfH));
			moveX(nx * MAX_OFFSET);
			moveY(ny * MAX_OFFSET);
		};

		const onLeave = () => {
			moveX(0);
			moveY(0);
		};

		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseleave", onLeave);

		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseleave", onLeave);
			gsap.killTweensOf(element);
			gsap.set(element, { x: 0, y: 0 });
		};
	}, [active, targetRef]);
}
