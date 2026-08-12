/**
 * src/lib/motion —— GSAP 动效层统一出口。
 *
 * 使用约定：
 *   - 组件里**只从这里导入**，不要直接 `import { gsap } from "gsap"`
 *     （会绕过档位守卫与 StrictMode 清理）；
 *   - 动画写在 `useGsapMotion` 回调里；
 *   - 循环装饰动画用回调里的 `decorative()` 登记，拖拽期自动让路。
 *
 * 档位与可访问性设计见 `motionLevel.ts` 顶部注释。
 */
export { EASE, Flip, gsap, initGsap, SplitText } from "./gsapCore";
export { registerDecorative } from "./decorative";
export {
	allowsDecorativeMotion,
	getMotionLevel,
	isReducedMotion,
	mAmp,
	mDur,
	onMotionLevelChange,
	type EffectiveMotionLevel,
} from "./motionLevel";
export {
	useGsapMotion,
	useMotionLevel,
	type MotionContext,
	type UseGsapMotionOptions,
} from "./useGsapMotion";
export {
	useSpringPress,
	type SpringPressOptions,
	type SpringPressResult,
} from "./useSpringPress";
export {
	attentionPulse,
	breathe,
	celebrate,
	countTo,
	popIn,
	staggerIn,
	textReveal,
	viewIn,
} from "./presets";
