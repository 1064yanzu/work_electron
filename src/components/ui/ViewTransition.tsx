// ViewTransition — 视图切换统一过渡
//
// 机制：viewKey 变化 → 内层 div key-remount → enter 动画（无 exit）。
// 不做双缓冲 crossfade：BrowserPanel 含 webview 不能新旧两棵子树同时挂载，
// 且切换点原本就是条件渲染（卸载重挂），语义完全不变。
// 首次挂载不动画（避免启动时三栏齐闪，App 根节点已有整体入场）。
//
// 动效档位：
//   - reduced   → useGsapMotion 直接 no-op，等于无动画；
//   - standard  → 幅度与时长按 mAmp/mDur 收敛；
//   - expressive→ 额外给 [data-view-stagger] 标记的子元素逐项入场。
//
// ⚠️ variant="none"：**承载原生视图 / 画布的分支必须用它**
//   （Electron WebContentsView、xterm webgl canvas）。这类内容不由 DOM 合成，
//   祖先上的 transform 会让原生视图与 DOM 占位错位、让 canvas 发虚。
//
// 注意：不要包在 PanelGroup 外层（会破坏 autoSaveId 布局持久化），
// 只包各 Panel 内部的视图分支。

import type { ReactNode } from "react";
import { useRef } from "react";
import { EASE, useGsapMotion } from "../../lib/motion";
import { cn } from "../../lib/utils";

type ViewTransitionVariant =
	| "none"
	| "fade"
	| "fade-up"
	| "fade-scale"
	| "expressive";

/**
 * 每个变体的入场起点（终点统一是 y=0、scale=1、opacity=1）。
 *
 * expressive 刻意**只用 translateY + opacity**，不做 scale / rotateX：
 * 中栏视图里塞着 Monaco、xterm dock 这类自绘文本，缩放/3D 变换期间会被按
 * 错误分辨率栅格化而发虚。位移不改变栅格尺寸，没有这个问题。
 * "活泼"由子元素 stagger 提供，不靠整块变形。
 */
const VARIANT_FROM: Record<
	Exclude<ViewTransitionVariant, "none">,
	{ y?: number; scale?: number; duration: number }
> = {
	fade: { duration: 0.2 },
	"fade-up": { y: 10, duration: 0.28 },
	"fade-scale": { scale: 0.985, duration: 0.28 },
	expressive: { y: 16, duration: 0.4 },
};

export interface ViewTransitionProps {
	/** 变化即触发 enter 动画（作为内层 div 的 key） */
	viewKey: string;
	/** 默认 expressive；原生视图分支务必传 "none" */
	variant?: ViewTransitionVariant;
	/** 透传给容器（默认已含 h-full w-full） */
	className?: string;
	children: ReactNode;
}

export function ViewTransition({
	viewKey,
	variant = "expressive",
	className,
	children,
}: ViewTransitionProps) {
	const prevKeyRef = useRef(viewKey);
	const shouldAnimateRef = useRef(false);
	if (prevKeyRef.current !== viewKey) {
		prevKeyRef.current = viewKey;
		shouldAnimateRef.current = true;
	}

	const scopeRef = useRef<HTMLDivElement>(null);
	const animate = variant !== "none" && shouldAnimateRef.current;

	useGsapMotion(
		({ gsap, dur, amp, expressive }) => {
			const element = scopeRef.current;
			if (!element) return;
			const spec =
				VARIANT_FROM[variant as Exclude<ViewTransitionVariant, "none">];

			const tl = gsap.timeline();
			tl.from(element, {
				opacity: 0,
				y: spec.y ? amp(spec.y) : 0,
				scale: spec.scale ?? 1,
				duration: dur(spec.duration),
				ease: EASE.outExpo,
				// 动画结束彻底移除 inline transform：留着会给内部的 fixed/sticky
				// 元素创建包含块，是很难查的布局怪问题
				clearProps: "transform,opacity",
			});

			if (expressive) {
				const rows = element.querySelectorAll("[data-view-stagger]");
				if (rows.length > 0) {
					tl.from(
						rows,
						{
							opacity: 0,
							y: amp(12),
							duration: dur(0.4),
							ease: EASE.outExpo,
							stagger: 0.04,
							clearProps: "transform,opacity",
						},
						dur(0.06),
					);
				}
			}
		},
		{ dependencies: [viewKey, variant], skip: !animate },
	);

	return (
		<div
			key={viewKey}
			ref={scopeRef}
			className={cn("h-full w-full", className)}
		>
			{children}
		</div>
	);
}
