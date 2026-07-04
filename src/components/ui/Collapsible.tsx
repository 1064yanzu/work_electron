// Collapsible — 折叠/展开原语（纯 CSS grid 高度动画，不测高、不依赖 JS 动画）
//
// 机制：外层 grid-template-rows 在 0fr ↔ 1fr 间过渡，内层 min-h-0 overflow-hidden。
// 相比测高方案（maxHeight）对动态内容（流式输出）天然稳健。
// reduce-motion：全局 CSS 会把 transition 压到 0.01ms；卸载延时也同步跳过。

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
			<div className={cn("min-h-0 overflow-hidden", contentClassName)}>
				{renderChildren ? children : null}
			</div>
		</div>
	);
}
