// Collapsible — 折叠/展开原语（纯 CSS grid 高度动画，不测高、不依赖 JS 动画）
//
// 机制：外层 grid-template-rows 在 0fr ↔ 1fr 间过渡，内层 min-h-0 overflow-hidden。
// 相比测高方案（maxHeight）对动态内容（流式输出）天然稳健。
// reduce-motion：全局 CSS 会把 transition 压到 0.01ms；卸载延时也同步跳过。
//
// expressive 档在此之上**叠加**一层内容 stagger：展开瞬间子块依次淡入上浮，
// 让"展开"从一次几何变化变成一次有节奏的呈现。刻意只是叠加——
// 高度动画本身仍旧全权交给 CSS grid，流式内容期间高度一直是 auto，不会被 JS 锁死。

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { EASE, useGsapMotion } from "../../lib/motion";
import { cn } from "../../lib/utils";

export interface CollapsibleProps {
	open: boolean;
	children: ReactNode;
	/** 过渡时长，默认 200ms（ease-out-expo） */
	durationMs?: number;
	/** 收起动画结束后是否卸载内容（默认 true，保持与条件渲染一致的内存语义） */
	unmountOnExit?: boolean;
	className?: string;
	/** 传给内容层（min-h-0 overflow-hidden 之内） */
	contentClassName?: string;
}

function isMotionReduced(): boolean {
	if (typeof document === "undefined") return false;
	const root = document.documentElement;
	return (
		root.classList.contains("motion-reduced") ||
		root.getAttribute("data-motion-preference") === "reduced"
	);
}

export function Collapsible({
	open,
	children,
	durationMs = 200,
	unmountOnExit = true,
	className,
	contentClassName,
}: CollapsibleProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [shouldRender, setShouldRender] = useState(open);
	// 展开时同步挂载内容（render 阶段派生，让内容与 0fr→1fr 过渡同帧出现）
	if (open && !shouldRender) {
		setShouldRender(true);
	}

	useEffect(() => {
		if (open || !unmountOnExit) return;
		if (isMotionReduced()) {
			setShouldRender(false);
			return;
		}
		const timer = window.setTimeout(() => setShouldRender(false), durationMs);
		return () => window.clearTimeout(timer);
	}, [open, unmountOnExit, durationMs]);

	// 收起时阻止内部元素获得焦点/交互（0fr + overflow-hidden 只藏不禁）
	useEffect(() => {
		if (rootRef.current) rootRef.current.inert = !open;
	}, [open]);

	// expressive 档：展开时子块依次入场。
	// 只处理 2–12 个直接子元素——1 个等于没节奏，十几个以上就成了"卡半天才看全"。
	// 位移用 y 而非 margin，且结束后 clearProps，不给 fixed/sticky 后代留下 containing block。
	useGsapMotion(
		({ gsap, dur, amp, expressive }) => {
			if (!open || !expressive) return;
			const content = contentRef.current;
			if (!content) return;
			const blocks = Array.from(content.children).filter(
				(node): node is HTMLElement => node instanceof HTMLElement,
			);
			if (blocks.length < 2 || blocks.length > 12) return;
			gsap.from(blocks, {
				opacity: 0,
				y: amp(8),
				duration: dur(0.34),
				ease: EASE.outExpo,
				stagger: 0.035,
				clearProps: "transform,opacity",
			});
		},
		{ dependencies: [open], skip: !open },
	);

	const renderChildren = !unmountOnExit || shouldRender;

	return (
		<div
			ref={rootRef}
			className={cn(
				"grid transition-[grid-template-rows] ease-out-expo",
				className,
			)}
			style={{
				gridTemplateRows: open ? "1fr" : "0fr",
				transitionDuration: `${durationMs}ms`,
			}}
			aria-hidden={!open}
		>
			<div
				ref={contentRef}
				className={cn("min-h-0 overflow-hidden", contentClassName)}
			>
				{renderChildren ? children : null}
			</div>
		</div>
	);
}
