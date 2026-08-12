// 容器宽度分档 hook —— 面板可拖拽，视口媒体查询在这里无效。
//
// 右侧 Copilot 栏是 react-resizable-panels 的 Panel（12% ~ 50%），
// 1440px 窗口下实际宽度区间 173px ~ 720px。组件必须按「自身容器宽度」
// 而非视口宽度自适应，因此用 ResizeObserver 观测元素自身。
//
// 性能：只在**跨越档位阈值**时 setState，拖拽过程中不会逐帧重渲染
// （与 App.tsx handleRightPanelResize 的低频 setState 策略一致）。

import { useCallback, useRef, useState } from "react";

/** 断点定义：`[最小宽度(px), 档位名]`，必须按最小宽度升序排列。 */
export type BreakpointSteps<T extends string> = ReadonlyArray<
	readonly [number, T]
>;

interface UseContainerBreakpointResult<T extends string> {
	/** 挂到被观测元素上的 callback ref */
	ref: (node: HTMLElement | null) => void;
	/** 当前档位 */
	tier: T;
}

export function useContainerBreakpoint<T extends string>(
	steps: BreakpointSteps<T>,
	initial: T,
): UseContainerBreakpointResult<T> {
	const [tier, setTier] = useState<T>(initial);

	const observerRef = useRef<ResizeObserver | null>(null);
	// steps 通常是模块级常量，但用 ref 兜住调用方传内联数组的情况，
	// 避免 callback ref 因为引用变化被反复重建（重建 = 一次 disconnect/observe）。
	const stepsRef = useRef(steps);
	stepsRef.current = steps;

	const ref = useCallback((node: HTMLElement | null) => {
		observerRef.current?.disconnect();
		observerRef.current = null;
		if (!node) return;

		const apply = (width: number) => {
			// 宽度为 0 说明元素还没布局（display:none / 面板收起），保持上一档不动，
			// 否则收起再展开会闪一次最窄档。
			if (width <= 0) return;
			let next: T | undefined;
			for (const [min, name] of stepsRef.current) {
				if (width >= min) next = name;
			}
			const resolved = next ?? stepsRef.current[0]?.[1];
			if (resolved === undefined) return;
			setTier((prev) => (prev === resolved ? prev : resolved));
		};

		apply(node.getBoundingClientRect().width);

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			apply(entry.contentRect.width);
		});
		observer.observe(node);
		observerRef.current = observer;
	}, []);

	return { ref, tier };
}
