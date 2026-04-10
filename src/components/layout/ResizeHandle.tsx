import { PanelResizeHandle } from "react-resizable-panels";
import { cn } from "../../lib/utils";

interface ResizeHandleProps {
	onDragging?: (isDragging: boolean) => void;
	/**
	 * 方向
	 */
	direction?: "horizontal" | "vertical";
}

export default function ResizeHandle({
	onDragging,
	direction = "horizontal",
}: ResizeHandleProps = {}) {
	const isHorizontal = direction === "horizontal";

	return (
		<PanelResizeHandle
			onDragging={onDragging}
			className={cn(
				"group relative flex items-center justify-center select-none",
				"transition-colors duration-150",
				isHorizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
			)}
		>
			{/* 默认细线 */}
			<div
				className={cn(
					"absolute transition-all duration-150",
					isHorizontal
						? "inset-y-0 w-px bg-zinc-200 dark:bg-zinc-800 group-hover:w-0.5 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700"
						: "inset-x-0 h-px bg-zinc-200 dark:bg-zinc-800 group-hover:h-0.5 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700",
					"group-data-[resize-handle-active]:bg-primary",
				)}
			/>
			{/* 透明热区，方便拖拽 */}
			<div
				className={cn(
					"absolute",
					isHorizontal ? "inset-y-0 w-3 -left-[6px]" : "inset-x-0 h-3 -top-[6px]",
				)}
			/>
		</PanelResizeHandle>
	);
}
