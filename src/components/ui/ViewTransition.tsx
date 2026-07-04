// ViewTransition — 视图切换统一过渡
//
// 机制：viewKey 变化 → 内层 div key-remount → enter 动画（无 exit）。
// 不做双缓冲 crossfade：BrowserPanel 含 webview 不能新旧两棵子树同时挂载，
// 且切换点原本就是条件渲染（卸载重挂），语义完全不变。
// 首次挂载不动画（避免启动时三栏齐闪，App 根节点已有整体入场）。
// reduce-motion 下由全局规则自动消杀动画。
//
// 注意：不要包在 PanelGroup 外层（会破坏 autoSaveId 布局持久化），
// 只包各 Panel 内部的视图分支。

import type { ReactNode } from "react";
import { useRef } from "react";
import { cn } from "../../lib/utils";

type ViewTransitionVariant = "fade" | "fade-up" | "fade-scale";

const VARIANT_CLASS: Record<ViewTransitionVariant, string> = {
	fade: "animate-in fade-in duration-150",
	"fade-up": "animate-in fade-in slide-in-from-bottom-1 duration-150",
	"fade-scale": "animate-in fade-in zoom-in-[0.98] duration-150",
};

export interface ViewTransitionProps {
	/** 变化即触发 enter 动画（作为内层 div 的 key） */
	viewKey: string;
	/** 默认 fade-up：淡入 + 4px 上移，克制不抢戏 */
	variant?: ViewTransitionVariant;
	/** 透传给容器（默认已含 h-full w-full） */
	className?: string;
	children: ReactNode;
}

export function ViewTransition({
	viewKey,
	variant = "fade-up",
	className,
	children,
}: ViewTransitionProps) {
	const prevKeyRef = useRef(viewKey);
	const shouldAnimateRef = useRef(false);
	if (prevKeyRef.current !== viewKey) {
		prevKeyRef.current = viewKey;
		shouldAnimateRef.current = true;
	}

	return (
		<div
			key={viewKey}
			className={cn(
				"h-full w-full",
				shouldAnimateRef.current && VARIANT_CLASS[variant],
				className,
			)}
		>
			{children}
		</div>
	);
}
