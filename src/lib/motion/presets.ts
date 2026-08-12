/**
 * presets —— 复用的动效工厂。
 *
 * 目的：让各处调用点写「意图」而不是「参数」。同一类动作（入场、注意力提示、
 * 数字滚动）在全应用保持同一手感，改一次就全站生效。
 *
 * 所有工厂都已按当前档位缩放时长与幅度（`mDur` / `mAmp`），reduced 档下
 * 时长为 0 —— 元素直接落到终态，不需要调用方额外分支。
 */
import { EASE, gsap, SplitText } from "./gsapCore";
import { allowsDecorativeMotion, mAmp, mDur } from "./motionLevel";

type Target = gsap.TweenTarget;

// ---------------------------------------------------------------------------
// 入场
// ---------------------------------------------------------------------------

/** 弹性弹出：图标、徽标、气泡这类"出现"的元素。 */
export function popIn(
	target: Target,
	options: { delay?: number; from?: number; duration?: number } = {},
): gsap.core.Tween {
	const { delay = 0, from = 0.72, duration = 0.42 } = options;
	return gsap.fromTo(
		target,
		{ scale: from, opacity: 0 },
		{
			scale: 1,
			opacity: 1,
			duration: mDur(duration),
			delay: mDur(delay),
			ease: EASE.spring,
			clearProps: "scale",
		},
	);
}

/**
 * 列表逐项入场。
 *
 * ⚠️ 不要用在虚拟化列表（`useVirtualizer`）上：入场期的 transform 会污染
 * `measureElement` 的测量结果，导致滚动位置跳动。
 */
export function staggerIn(
	targets: Target,
	options: {
		y?: number;
		delay?: number;
		duration?: number;
		stagger?: number;
		from?: "start" | "end" | "center";
	} = {},
): gsap.core.Tween {
	const {
		y = 14,
		delay = 0,
		duration = 0.4,
		stagger = 0.035,
		from = "start",
	} = options;
	return gsap.from(targets, {
		y: mAmp(y),
		opacity: 0,
		duration: mDur(duration),
		delay: mDur(delay),
		ease: EASE.outExpo,
		stagger: allowsDecorativeMotion() ? { each: stagger, from } : 0,
		clearProps: "transform,opacity",
	});
}

/** 内容切入：比 staggerIn 更整体，用于视图/面板级别的切换。 */
export function viewIn(
	target: Target,
	options: { y?: number; duration?: number } = {},
): gsap.core.Tween {
	const { y = 10, duration = 0.34 } = options;
	return gsap.from(target, {
		y: mAmp(y),
		opacity: 0,
		duration: mDur(duration),
		ease: EASE.outExpo,
		clearProps: "transform,opacity",
	});
}

// ---------------------------------------------------------------------------
// 注意力
// ---------------------------------------------------------------------------

/** 一次性注意力提示：轻微放大回弹，用于状态刚变成"运行中/完成"的那一刻。 */
export function attentionPulse(
	target: Target,
	options: { scale?: number; duration?: number } = {},
): gsap.core.Tween {
	const { scale = 1.06, duration = 0.5 } = options;
	return gsap.fromTo(
		target,
		{ scale: 1 },
		{
			scale: 1 + mAmp(scale - 1),
			duration: mDur(duration) / 2,
			ease: EASE.outExpo,
			yoyo: true,
			repeat: 1,
			clearProps: "scale",
		},
	);
}

/**
 * 循环呼吸（装饰性）。返回的 timeline 需要调用方用 `decorative()` 登记，
 * 以便拖拽期间自动暂停。
 */
export function breathe(
	target: Target,
	options: { scale?: number; opacity?: number; duration?: number } = {},
): gsap.core.Timeline {
	const { scale = 1.04, opacity = 0.55, duration = 2.4 } = options;
	const tl = gsap.timeline({ repeat: -1, yoyo: true });
	tl.to(target, {
		scale: 1 + mAmp(scale - 1),
		opacity,
		duration: Math.max(mDur(duration), 0.001),
		ease: EASE.inOutExpo,
	});
	return tl;
}

// ---------------------------------------------------------------------------
// 数字补间
// ---------------------------------------------------------------------------

/**
 * 数字滚动。直接写 `textContent`，不经过 React state —— 补间期间不会触发
 * 任何重渲染。
 */
export function countTo(
	element: HTMLElement | null,
	from: number,
	to: number,
	options: {
		duration?: number;
		format?: (value: number) => string;
	} = {},
): gsap.core.Tween | null {
	if (!element) return null;
	const { duration = 0.7, format = (v: number) => String(Math.round(v)) } =
		options;
	const state = { value: from };
	return gsap.to(state, {
		value: to,
		duration: mDur(duration),
		ease: EASE.inOutExpo,
		onUpdate: () => {
			element.textContent = format(state.value);
		},
		onComplete: () => {
			element.textContent = format(to);
		},
	});
}

// ---------------------------------------------------------------------------
// 文字
// ---------------------------------------------------------------------------

/**
 * 逐词/逐字入场。
 *
 * SplitText 会改写 DOM 结构（把文本拆成一堆 span），和 React 的 diff 直接冲突。
 * 这里的用法是**动画结束立刻 revert**，把 DOM 还给 React，只借用动画那几百毫秒。
 * 返回的 cleanup 必须在 effect 卸载时调用（`useGsapMotion` 的返回值即可）。
 */
export function textReveal(
	element: HTMLElement | null,
	options: {
		type?: "words" | "chars" | "words,chars";
		stagger?: number;
		y?: number;
		duration?: number;
		delay?: number;
	} = {},
): (() => void) | undefined {
	if (!element) return undefined;
	if (!allowsDecorativeMotion()) return undefined;

	const {
		type = "words",
		stagger = 0.03,
		y = 14,
		duration = 0.5,
		delay = 0,
	} = options;

	let split: InstanceType<typeof SplitText> | null = null;
	try {
		split = new SplitText(element, { type });
	} catch {
		// SplitText 对空文本 / 特殊节点可能抛错，静默降级为不做逐字动画
		return undefined;
	}

	const pieces = type === "chars" ? split.chars : split.words;
	const revert = () => {
		split?.revert();
		split = null;
	};

	if (!pieces || pieces.length === 0) {
		revert();
		return undefined;
	}

	gsap.from(pieces, {
		y: mAmp(y),
		opacity: 0,
		duration: mDur(duration),
		delay: mDur(delay),
		ease: EASE.outExpo,
		stagger,
		onComplete: revert,
	});

	return revert;
}

// ---------------------------------------------------------------------------
// 庆祝（仅 expressive 档）
// ---------------------------------------------------------------------------

/**
 * 完成庆祝：一圈扩散光环 + 少量向外飞散的小点。
 *
 * 刻意做得很轻——任务完成是高频事件，浮夸的彩带看三次就烦。
 * 元素动态创建、结束即移除，不占 React 树。
 */
export function celebrate(
	anchor: HTMLElement | null,
	options: { particles?: number; radius?: number; color?: string } = {},
): void {
	if (!anchor || !allowsDecorativeMotion()) return;
	const {
		particles = 10,
		radius = 46,
		color = "var(--t-primary, #1a1a19)",
	} = options;

	const host = document.createElement("div");
	host.setAttribute("aria-hidden", "true");
	host.style.cssText =
		"position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:5;";

	const anchorPosition = window.getComputedStyle(anchor).position;
	const restorePosition = anchorPosition === "static";
	if (restorePosition) anchor.style.position = "relative";
	anchor.appendChild(host);

	const ring = document.createElement("div");
	ring.style.cssText = `position:absolute;left:50%;top:50%;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:9999px;border:1.5px solid ${color};opacity:0.55;`;
	host.appendChild(ring);

	const tl = gsap.timeline({
		onComplete: () => {
			host.remove();
			if (restorePosition) anchor.style.position = "";
		},
	});

	tl.to(ring, {
		scale: 3.2,
		opacity: 0,
		duration: mDur(0.62),
		ease: EASE.outExpo,
	});

	for (let i = 0; i < particles; i++) {
		const dot = document.createElement("div");
		dot.style.cssText = `position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:9999px;background:${color};`;
		host.appendChild(dot);
		const angle = (Math.PI * 2 * i) / particles + Math.PI / particles;
		// 半径带确定性抖动（按索引取，不用随机数，保证重放一致）
		const distance = mAmp(radius) * (0.72 + ((i * 37) % 100) / 320);
		tl.fromTo(
			dot,
			{ x: 0, y: 0, scale: 1, opacity: 1 },
			{
				x: Math.cos(angle) * distance,
				y: Math.sin(angle) * distance,
				scale: 0.2,
				opacity: 0,
				duration: mDur(0.55 + (i % 3) * 0.06),
				ease: EASE.outExpo,
			},
			0,
		);
	}
}
