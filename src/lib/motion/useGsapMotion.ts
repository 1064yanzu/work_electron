/**
 * useGsapMotion —— 全项目使用 GSAP 的**唯一入口**。
 *
 * 直接用 `useGSAP` 不是不行，但每个调用点都要自己处理三件事，漏一个就是 bug：
 *
 *   1. **reduce-motion**：GSAP 不受 index.css 的 `!important` 消杀影响，
 *      必须自己判档位（见 motionLevel.ts 顶部注释）；
 *   2. **档位变化要重跑**：用户在设置里从「减少动效」切到「丰富动效」，
 *      已挂载的组件得重新建立动画，否则要等下次挂载才生效；
 *   3. **StrictMode**：`renderMainApp.tsx` 开了 StrictMode，effect 双跑。
 *      `useGSAP` 的 `gsap.context().revert()` 是官方的安全清理方案。
 *
 * 这里把三件事一次性收口，调用方只写动画本身。
 *
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * useGsapMotion(
 *   ({ gsap, dur, expressive }) => {
 *     gsap.from(".row", { y: 12, opacity: 0, duration: dur(0.35), stagger: expressive ? 0.04 : 0 });
 *   },
 *   { scope: ref, dependencies: [items.length] },
 * );
 * ```
 */
import { useGSAP } from "@gsap/react";
import { useEffect, useState, type RefObject } from "react";

import { registerDecorative } from "./decorative";
import { gsap } from "./gsapCore";
import {
	allowsDecorativeMotion,
	getMotionLevel,
	mAmp,
	mDur,
	onMotionLevelChange,
	type EffectiveMotionLevel,
} from "./motionLevel";

gsap.registerPlugin(useGSAP);

export interface MotionContext {
	gsap: typeof gsap;
	/** 当前生效档位 */
	level: EffectiveMotionLevel;
	/** 按档位缩放时长（秒） */
	dur: (seconds: number) => number;
	/** 按档位缩放位移/缩放幅度 */
	amp: (value: number) => number;
	/** 是否允许装饰性动效（stagger / 逐字 / 庆祝 / 粒子） */
	expressive: boolean;
	/**
	 * 把循环装饰动画登记进 perf-degraded 管控（拖拽期自动暂停）。
	 * 返回传入的动画本身，便于链式书写。
	 */
	decorative: <T extends gsap.core.Animation>(animation: T) => T;
	/** 用于事件回调里创建动画（保证被 context 收编，卸载时能 revert） */
	contextSafe: (
		fn: (...args: never[]) => unknown,
	) => (...args: never[]) => unknown;
}

export interface UseGsapMotionOptions {
	/** 作用域容器 ref —— 选择器字符串只在其内部查找，强烈建议传 */
	scope?: RefObject<Element | null>;
	/** 依赖变化时 revert 旧动画并重跑 */
	dependencies?: unknown[];
	/** 为 true 时整体跳过（例如功能开关关闭） */
	skip?: boolean;
	/**
	 * reduced 档下是否仍然执行。默认 false（直接不跑）。
	 * 只有「动画本身承载了必要的最终样式」时才置 true，
	 * 此时 dur() 返回 0，动画等价于直接 set 终态。
	 */
	runInReduced?: boolean;
}

/** 订阅动效档位，变化时触发重渲染（供 useGsapMotion 内部与个别组件直接使用）。 */
export function useMotionLevel(): EffectiveMotionLevel {
	const [level, setLevel] = useState<EffectiveMotionLevel>(getMotionLevel);
	useEffect(() => onMotionLevelChange(setLevel), []);
	return level;
}

export function useGsapMotion(
	callback: (context: MotionContext) => void | (() => void),
	options: UseGsapMotionOptions = {},
): void {
	const {
		scope,
		dependencies = [],
		skip = false,
		runInReduced = false,
	} = options;
	const level = useMotionLevel();
	const disabled = skip || (level === "reduced" && !runInReduced);

	useGSAP(
		(_context, contextSafe) => {
			if (disabled) return;
			// decorative 的注销函数在这里兜住：注册表是强引用的 Set，
			// 组件卸载 / 依赖变化后不摘掉，下次拖分栏就会去 pause 一堆早已 kill 的动画。
			const unregisters: Array<() => void> = [];
			const cleanup = callback({
				gsap,
				level,
				dur: mDur,
				amp: mAmp,
				expressive: allowsDecorativeMotion(),
				decorative: (animation) => {
					unregisters.push(registerDecorative(animation));
					return animation;
				},
				contextSafe: contextSafe as MotionContext["contextSafe"],
			});
			return () => {
				for (const unregister of unregisters) unregister();
				cleanup?.();
			};
		},
		{
			scope,
			// 档位进依赖：切档立刻重建动画，不必等组件下次挂载
			dependencies: [...dependencies, level, disabled],
			revertOnUpdate: true,
		},
	);
}
