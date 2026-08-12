import { useCallback, useEffect, useRef } from "react";
import { PanelResizeHandle } from "react-resizable-panels";
import { setPerfDegraded } from "../../lib/interaction/perfDegraded";
import { cn } from "../../lib/utils";

interface ResizeHandleProps {
	onDragging?: (isDragging: boolean) => void;
	direction?: "horizontal" | "vertical";
	/** 双击重置为默认尺寸（由调用方执行 panel.resize） */
	onDoubleClick?: () => void;
	/** 吸附收起预告：拖到阈值内变签名色，提示松手将收起 */
	willSnapCollapse?: boolean;
	/** 悬浮提示文案（默认含"双击重置/方向键微调"教学） */
	title?: string;
}

export default function ResizeHandle({
	onDragging,
	direction = "horizontal",
	onDoubleClick,
	willSnapCollapse = false,
	title,
}: ResizeHandleProps = {}) {
	const isHorizontal = direction === "horizontal";

	// F10 性能降级：拖拽分栏期间给 <html> 挂 .perf-degraded，
	// CSS 侧临时关停 backdrop-filter，松手恢复；卸载时兜底释放。
	const draggingRef = useRef(false);
	const handleDragging = useCallback(
		(isDragging: boolean) => {
			if (isDragging !== draggingRef.current) {
				draggingRef.current = isDragging;
				setPerfDegraded(isDragging);
			}
			onDragging?.(isDragging);
		},
		[onDragging],
	);
	useEffect(
		() => () => {
			if (draggingRef.current) {
				draggingRef.current = false;
				setPerfDegraded(false);
			}
		},
		[],
	);

	return (
		<PanelResizeHandle
			onDragging={handleDragging}
			className={cn(
				"group relative flex items-center justify-center select-none outline-none",
				"transition-colors duration-150",
				isHorizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
			)}
		>
			{/* 暖色调细线分隔；聚焦（Tab）时加宽变主色，让键盘 resize 可见可用 */}
			<div
				className={cn(
					"absolute transition-all duration-200",
					isHorizontal
						? [
								"inset-y-0 w-px",
								"bg-warm-300",
								"group-hover:w-[2px] group-hover:bg-warm-400 dark:group-hover:bg-dark-surface",
								"group-focus-visible:w-[3px] group-focus-visible:bg-primary/70",
							]
						: [
								"inset-x-0 h-px",
								"bg-warm-300",
								"group-hover:h-[2px] group-hover:bg-warm-400 dark:group-hover:bg-dark-surface",
								"group-focus-visible:h-[3px] group-focus-visible:bg-primary/70",
							],
					"group-data-[resize-handle-active]:bg-primary dark:group-data-[resize-handle-active]:bg-primary",
					// 吸附预告优先级最高：签名陶土橙 + 加宽
					willSnapCollapse && [
						"bg-terracotta group-data-[resize-handle-active]:bg-terracotta",
						isHorizontal ? "w-[3px]" : "h-[3px]",
					],
				)}
			/>
			{/* 透明热区，方便拖拽；承载双击重置与提示 */}
			<div
				onDoubleClick={onDoubleClick}
				title={
					title ??
					(onDoubleClick
						? "拖动调整 · 双击重置 · 聚焦后可用方向键微调"
						: undefined)
				}
				className={cn(
					"absolute",
					isHorizontal
						? "inset-y-0 w-4 -left-[8px]"
						: "inset-x-0 h-4 -top-[8px]",
				)}
			/>
		</PanelResizeHandle>
	);
}
