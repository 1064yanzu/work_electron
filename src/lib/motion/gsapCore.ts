/**
 * gsapCore —— GSAP 单例初始化（全项目唯一的注册入口）。
 *
 * ## 为什么要有这一层
 *
 * 1. **插件必须注册一次且只注册一次**。散在各组件里 `registerPlugin` 会在
 *    HMR / StrictMode 下重复执行，也让「到底用了哪些插件」无从盘点。
 * 2. **ease 要和 Tailwind 对齐**。`tailwind.config.js` 里定义了
 *    `ease-out-expo` / `spring` 等 cubic-bezier，CSS 过渡与 GSAP 补间如果
 *    用不同曲线，同一个界面里两种手感会打架。这里用 CustomEase 把同样的
 *    cubic-bezier 注册成 GSAP 的具名 ease。
 * 3. **按需子路径 import**。只引真正用到的插件（Flip / SplitText /
 *    CustomEase），不 `import "gsap/all"`，避免把整包塞进 bundle。
 *
 * ## 插件取舍
 *
 * - `Flip`      —— 共享元素过渡（卡片库放大）、列表重排补位（标签条）。CSS 无解。
 * - `SplitText` —— 文案逐词/逐字入场。
 * - `CustomEase`—— 见上，跟 Tailwind 曲线对齐。
 *
 * Draggable / Inertia / DrawSVG / MotionPath 暂不引入：桌宠拖拽走的是
 * Electron 原生窗口移动（不是 DOM 拖拽），回正用 elastic ease 就够；
 * SVG 描边用 strokeDashoffset 补间即可，不必多引一个插件。
 */
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";

import { readEffectiveMotionLevel } from "../interaction/motionPreference";
import { applyReducedMotionToGsap } from "./motionLevel";

/** 与 tailwind.config.js `transitionTimingFunction` 一一对应的具名 ease。 */
export const EASE = {
	/** cubic-bezier(0.16, 1, 0.3, 1) —— 项目主力出场曲线 */
	outExpo: "t-out-expo",
	/** cubic-bezier(0.55, 0, 1, 0.45) */
	inExpo: "t-in-expo",
	/** cubic-bezier(0.65, 0, 0.35, 1) */
	inOutExpo: "t-in-out-expo",
	/** cubic-bezier(0.34, 1.56, 0.64, 1) —— 轻微过冲，按压回弹用 */
	spring: "t-spring",
} as const;

/** cubic-bezier(x1,y1,x2,y2) → CustomEase 的 SVG path 写法。 */
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
	return `M0,0 C${x1},${y1} ${x2},${y2} 1,1`;
}

let initialized = false;

/**
 * 初始化 GSAP。在每个 React root 的 bootstrap 里各调一次
 * （主窗口 + 桌宠窗口是两个独立 root，各有各的 document）。
 * 重复调用安全。
 */
export function initGsap(): void {
	if (initialized) return;
	initialized = true;

	gsap.registerPlugin(CustomEase, Flip, SplitText);

	CustomEase.create(EASE.outExpo, bezierPath(0.16, 1, 0.3, 1));
	CustomEase.create(EASE.inExpo, bezierPath(0.55, 0, 1, 0.45));
	CustomEase.create(EASE.inOutExpo, bezierPath(0.65, 0, 0.35, 1));
	CustomEase.create(EASE.spring, bezierPath(0.34, 1.56, 0.64, 1));

	gsap.defaults({ ease: EASE.outExpo, duration: 0.35 });

	// 长任务（大文件解析、首屏 hydration）造成的掉帧不该让动画"跳帧补进度"，
	// 超过 500ms 的卡顿直接按 33ms 记账，动画从卡住的地方接着放。
	gsap.ticker.lagSmoothing(500, 33);

	// 首帧就把当前档位应用上（reduced 时把全局时间线压成瞬时）
	applyReducedMotionToGsap(readEffectiveMotionLevel());
}

export { gsap, Flip, SplitText, CustomEase };
