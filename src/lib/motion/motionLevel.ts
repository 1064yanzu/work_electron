/**
 * motionLevel —— 动效档位的运行时读取与 GSAP 侧兜底。
 *
 * ## 为什么 GSAP 需要单独兜底
 *
 * `src/index.css` 里那套
 *   `html.motion-reduced * { animation-duration: 0.01ms !important }`
 * 只能压住 **CSS 动画/过渡**，对 GSAP 的 JS 补间完全无效——GSAP 是逐帧写
 * inline style 的，`!important` 拦不住。所以「减少动效」必须在这一层再做一次：
 *
 *   1. `gsap.globalTimeline.timeScale(REDUCED_TIMESCALE)` —— 在途动画瞬间跑完到终态
 *      （注意是"跑完"不是"取消"，元素不会停在动画中间的半透明/位移状态）；
 *   2. `useGsapMotion` 在 reduced 档直接 no-op，新动画根本不创建。
 *
 * ## 档位语义
 *
 * | 档位        | 时长系数 | 装饰性动效（stagger / 逐字 / 庆祝 / 粒子） |
 * | ---------- | ------- | ------------------------------------- |
 * | reduced    | 0       | 全关                                    |
 * | standard   | 0.7     | 关                                      |
 * | expressive | 1       | 开                                      |
 */
import { gsap } from "gsap";

import {
	MOTION_LEVEL_APPLIED_EVENT,
	readEffectiveMotionLevel,
	type EffectiveMotionLevel,
} from "../interaction/motionPreference";

/** reduced 档下把全局时间线加速到近似瞬时（不是 pause，元素仍会落到终态）。 */
const REDUCED_TIMESCALE = 100;

const DURATION_SCALE: Record<EffectiveMotionLevel, number> = {
	reduced: 0,
	standard: 0.7,
	expressive: 1,
};

let current: EffectiveMotionLevel = readEffectiveMotionLevel();
const listeners = new Set<(level: EffectiveMotionLevel) => void>();

/** 当前生效档位（同步，可在 render 期读）。 */
export function getMotionLevel(): EffectiveMotionLevel {
	return current;
}

export function isReducedMotion(): boolean {
	return current === "reduced";
}

/** 是否允许装饰性动效（stagger / 逐字 / 庆祝 / 粒子）。 */
export function allowsDecorativeMotion(): boolean {
	return current === "expressive";
}

/**
 * 按档位缩放时长（秒）。reduced 返回 0，调用方拿到 0 时长的 tween
 * 等价于直接 set 终态，不需要额外分支。
 */
export function mDur(seconds: number): number {
	return seconds * DURATION_SCALE[current];
}

/** 按档位缩放位移/缩放幅度：standard 档把幅度也收敛，避免"快但依然很跳"。 */
export function mAmp(value: number): number {
	if (current === "reduced") return 0;
	if (current === "standard") return value * 0.55;
	return value;
}

/** 把档位应用到 GSAP 全局时间线。initGsap 与档位变更时各调一次。 */
export function applyReducedMotionToGsap(level: EffectiveMotionLevel): void {
	gsap.globalTimeline.timeScale(level === "reduced" ? REDUCED_TIMESCALE : 1);
}

export function onMotionLevelChange(
	callback: (level: EffectiveMotionLevel) => void,
): () => void {
	listeners.add(callback);
	return () => listeners.delete(callback);
}

function setLevel(next: EffectiveMotionLevel): void {
	if (next === current) return;
	current = next;
	applyReducedMotionToGsap(next);
	for (const listener of listeners) listener(next);
}

// ---------------------------------------------------------------------------
// 订阅档位变化
//
// 两条来源都接上：
//   - CustomEvent：applyMotionPreferenceToDocument 主动派发（主窗口设置面板改档）
//   - MutationObserver：兜底监听 <html data-motion-preference>，覆盖桌宠窗口
//     这类不走设置面板、只被动接收属性变更的 root。
// ---------------------------------------------------------------------------
if (typeof window !== "undefined") {
	window.addEventListener(MOTION_LEVEL_APPLIED_EVENT, (event) => {
		const detail = (event as CustomEvent<EffectiveMotionLevel>).detail;
		if (detail) setLevel(detail);
	});
}

if (
	typeof document !== "undefined" &&
	typeof MutationObserver !== "undefined"
) {
	const observer = new MutationObserver(() => {
		setLevel(readEffectiveMotionLevel());
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["data-motion-preference"],
	});
}

export type { EffectiveMotionLevel };
