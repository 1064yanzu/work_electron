/**
 * useSpringPress —— 按下缩小、松手弹性回弹的通用交互。
 *
 * 为什么不用 CSS `active:scale-*`：
 * CSS transition 只能做单调缓动，回弹要的是**过冲后衰减振荡**，
 * `cubic-bezier` 的控制点被限制在 [0,1] 的 y 轴外可以过冲一次，
 * 但做不出 elastic 那种"弹两下再停"的手感。GSAP 的 `elastic.out` 可以。
 *
 * ## 只在 expressive 档启用
 *
 * standard / reduced 档保留原来的 `active:scale-*` CSS 行为，
 * 调用方根据返回的 `active` 决定挂哪套类名（见 ui/Button.tsx）。
 *
 * ## 三个容易踩的坑
 *
 * 1. **CSS transition 会和 GSAP 打架**：元素上如果有 `transition: transform`，
 *    GSAP 每帧写的 inline transform 会再被浏览器插值一次，过冲被抹平成一坨糊。
 *    调用方必须在 `active` 时把 transform 从 transition-property 里摘掉。
 * 2. **回弹结束要 `clearProps`**：不清掉 inline transform 的话，
 *    调用方 className 里的 `hover:scale-105` 之类会被永久压住。
 * 3. **键盘也要有反馈**：只监听 pointer 事件的话，
 *    Space / Enter 触发按钮时一点动静都没有，比原来的 `:active` 还退步。
 */

import { useEffect, useRef, type RefObject } from "react";

import { gsap } from "./gsapCore";
import { mDur } from "./motionLevel";
import { useMotionLevel } from "./useGsapMotion";

export interface SpringPressOptions {
	/** 按下时缩到多少，默认 0.94 */
	pressScale?: number;
	/** 置 true 时完全不挂监听（禁用态 / 调用方主动关闭） */
	disabled?: boolean;
}

export interface SpringPressResult<T extends HTMLElement> {
	ref: RefObject<T>;
	/** 为 true 时调用方应改用无 transform 过渡的类名，并去掉 `active:scale-*` */
	active: boolean;
}

export function useSpringPress<T extends HTMLElement>(
	options: SpringPressOptions = {},
): SpringPressResult<T> {
	const { pressScale = 0.94, disabled = false } = options;
	const ref = useRef<T>(null);
	const level = useMotionLevel();
	const active = level === "expressive" && !disabled;

	useEffect(() => {
		const element = ref.current;
		if (!element || !active) return;

		let pressed = false;

		const press = () => {
			if (pressed) return;
			pressed = true;
			gsap.to(element, {
				scale: pressScale,
				duration: mDur(0.12),
				ease: "power2.out",
				overwrite: "auto",
			});
		};

		const release = () => {
			if (!pressed) return;
			pressed = false;
			gsap.to(element, {
				scale: 1,
				duration: mDur(0.62),
				ease: "elastic.out(1, 0.42)",
				overwrite: "auto",
				// 回到静止态就把 inline transform 交还给 CSS
				clearProps: "transform",
			});
		};

		const onKeyDown = (e: KeyboardEvent) => {
			// 只认真正会触发按钮的两个键；repeat 忽略，否则按住会一直重置 tween
			if (e.repeat) return;
			if (e.key === " " || e.key === "Enter") press();
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === " " || e.key === "Enter") release();
		};

		element.addEventListener("pointerdown", press);
		element.addEventListener("pointerup", release);
		element.addEventListener("pointerleave", release);
		element.addEventListener("pointercancel", release);
		element.addEventListener("keydown", onKeyDown);
		element.addEventListener("keyup", onKeyUp);
		// 失焦时也要收：键盘按住 Space 的同时切走窗口，keyup 收不到
		element.addEventListener("blur", release);

		return () => {
			element.removeEventListener("pointerdown", press);
			element.removeEventListener("pointerup", release);
			element.removeEventListener("pointerleave", release);
			element.removeEventListener("pointercancel", release);
			element.removeEventListener("keydown", onKeyDown);
			element.removeEventListener("keyup", onKeyUp);
			element.removeEventListener("blur", release);
			gsap.killTweensOf(element);
			gsap.set(element, { clearProps: "transform" });
		};
	}, [active, pressScale]);

	return { ref, active };
}
