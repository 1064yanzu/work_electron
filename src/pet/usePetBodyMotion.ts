/**
 * usePetBodyMotion —— 桌宠身体的「挤压/拉伸」通道。
 *
 * ## 为什么单独一层
 *
 * 桌宠身上同时有四种 transform 来源，谁也不能覆盖谁：
 *
 * | 层 | 写者 | 内容 |
 * | --- | --- | --- |
 * | motionLayer | GSAP（useMouseGaze / 拖动 quickTo） | 视线追随 x/y、拖动倾斜 rotation |
 * | squashLayer | GSAP（本 hook） | 落地压扁、连点摇晃、idle 呼吸 |
 * | 角色本体 | React style | 拖动放大、贴墙偏移这类**离散**状态 |
 * | 角色本体 | CSS class | pet-blink（filter，不碰 transform） |
 *
 * 一个元素只能有一个 transform，所以每种来源各占一层，互不相干。
 * 这也是为什么落地弹跳从 CSS `@keyframes pet-land-bounce` 搬到了 GSAP：
 * CSS animation 在级联里赢过 inline style，会在 220ms 里把 React 写的
 * scale 整个吃掉；而且 CSS 没法让影子和身体**共用一条时间轴**。
 *
 * ## 影子同步
 *
 * 真实的"啪嗒"落地里，身体压扁的同一瞬间影子会摊大变深——这两件事错开
 * 30ms 就假了。放在同一条 timeline 上用同一个时间原点，天然对齐。
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
	allowsDecorativeMotion,
	celebrate,
	EASE,
	gsap,
	mAmp,
	mDur,
	registerDecorative,
	useMotionLevel,
} from "../lib/motion";

export interface UsePetBodyMotionOptions {
	/** 呼吸只在真正闲着时跑：idle 动作、没被拖、没贴墙 */
	idle: boolean;
	/** 连点迸发的粒子颜色，跟随当前皮肤的主题色 */
	burstColor: string;
}

export interface PetBodyMotion {
	/** 挂在角色本体外面那层（GSAP 独占） */
	squashRef: RefObject<HTMLDivElement | null>;
	/** 挂在接地阴影的动画容器上（GSAP 独占） */
	shadowRef: RefObject<HTMLDivElement | null>;
	/** 落地"啪嗒"：身体压扁回弹 + 影子同步摊开 */
	playLand: () => void;
	/** 连点害羞：左右摇晃 + 一小圈迸发 */
	playWobble: () => void;
}

export function usePetBodyMotion({
	idle,
	burstColor,
}: UsePetBodyMotionOptions): PetBodyMotion {
	const squashRef = useRef<HTMLDivElement>(null);
	const shadowRef = useRef<HTMLDivElement>(null);
	const idleTlRef = useRef<gsap.core.Timeline | null>(null);
	// 档位变了要重建呼吸（幅度/时长都按档位算），所以进 deps
	const level = useMotionLevel();

	// ── idle 呼吸 ──
	// 装饰性动画：登记进 decorative 注册表，用户拖分栏时自动让出帧。
	useEffect(() => {
		const body = squashRef.current;
		if (!body || !idle || !allowsDecorativeMotion()) return;

		const tl = gsap.timeline({
			repeat: -1,
			yoyo: true,
			defaults: { ease: "sine.inOut" },
		});
		// 呼吸靠"体积守恒"读起来才像活的：纵向涨一点，横向就得收一点
		tl.to(body, {
			scaleY: 1 + mAmp(0.022),
			scaleX: 1 - mAmp(0.012),
			duration: Math.max(mDur(1.9), 0.001),
		});
		idleTlRef.current = tl;
		const unregister = registerDecorative(tl);

		return () => {
			unregister();
			tl.kill();
			idleTlRef.current = null;
			gsap.set(body, { clearProps: "transform" });
		};
	}, [idle, level]);

	// ── 眨眼 ──
	// 5–9s 随机一次，用 filter 压暗一瞬间模拟闭眼（不改 atlas 帧）。
	// 从原来的 setState + CSS class 换成 GSAP：眨一次眼不该让 1200 行的
	// PetApp 重渲染两遍。filter 不属于 React 写的属性，两边不打架。
	useEffect(() => {
		const body = squashRef.current;
		if (!body || !idle) return;

		let timer: ReturnType<typeof setTimeout> | null = null;
		let cancelled = false;

		const schedule = () => {
			timer = setTimeout(
				() => {
					if (cancelled) return;
					gsap
						.timeline()
						.set(body, { filter: "brightness(0.55) contrast(1.05)" })
						.set(body, { filter: "none" }, Math.max(mDur(0.075), 0));
					schedule();
				},
				5000 + Math.random() * 4000,
			);
		};
		schedule();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
			gsap.set(body, { clearProps: "filter" });
		};
	}, [idle]);

	/** 一次性动作开始前让呼吸停下，结束后交还——否则两条 tween 抢同一个 scaleY。 */
	const withIdlePaused = useCallback(
		(build: (tl: gsap.core.Timeline) => void) => {
			const idleTl = idleTlRef.current;
			idleTl?.pause();
			const tl = gsap.timeline({
				onComplete: () => {
					// 呼吸从头接上，避免从压扁的中间态继续，看起来像卡了一下
					idleTl?.restart(true).play();
				},
			});
			build(tl);
			return tl;
		},
		[],
	);

	const playLand = useCallback(() => {
		const body = squashRef.current;
		if (!body) return;
		const shadow = shadowRef.current;

		withIdlePaused((tl) => {
			// 三拍：压扁 → 过冲拉长 → 归位。轻微的 overshoot 是"弹"的全部来源。
			tl.to(body, {
				scaleY: 1 - mAmp(0.14),
				scaleX: 1 + mAmp(0.1),
				duration: mDur(0.09),
				ease: "power2.out",
			})
				.to(body, {
					scaleY: 1 + mAmp(0.07),
					scaleX: 1 - mAmp(0.05),
					duration: mDur(0.14),
					ease: EASE.outExpo,
				})
				.to(body, {
					scaleY: 1,
					scaleX: 1,
					duration: mDur(0.3),
					ease: EASE.spring,
				});

			if (shadow) {
				// 影子和身体共用时间原点：身体最扁的那一帧，影子摊得最开。
				// 只动 scale 不动 opacity —— 阴影浓度写在内层元素上，
				// 外层已经是 opacity:1，往上加没有余量。
				tl.to(
					shadow,
					{
						scaleX: 1 + mAmp(0.26),
						scaleY: 1 - mAmp(0.12),
						duration: mDur(0.09),
						ease: "power2.out",
					},
					0,
				).to(shadow, {
					scaleX: 1,
					scaleY: 1,
					duration: mDur(0.44),
					ease: EASE.outExpo,
				});
			}
		});
	}, [withIdlePaused]);

	const playWobble = useCallback(() => {
		const body = squashRef.current;
		if (!body) return;

		withIdlePaused((tl) => {
			// 摇头式衰减摆动，幅度一次比一次小
			tl.to(body, {
				rotation: -mAmp(5),
				scale: 1 - mAmp(0.02),
				duration: mDur(0.09),
				ease: "power2.out",
			})
				.to(body, { rotation: mAmp(4), duration: mDur(0.1) })
				.to(body, { rotation: -mAmp(2.2), duration: mDur(0.09) })
				.to(body, {
					rotation: 0,
					scale: 1,
					duration: mDur(0.26),
					ease: EASE.spring,
				});
		});

		// 害羞的小迸发：只在 expressive 档出现（celebrate 内部自己判断）
		celebrate(body, { particles: 7, radius: 34, color: burstColor });
	}, [withIdlePaused, burstColor]);

	return { squashRef, shadowRef, playLand, playWobble };
}
