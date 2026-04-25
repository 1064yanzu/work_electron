import { PanelResizeHandle } from "react-resizable-panels";
import { cn } from "../../lib/utils";

interface ResizeHandleProps {
	onDragging?: (isDragging: boolean) => void;
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
			{/* 暖色调细线分隔 */}
			<div
				className={cn(
					"absolute transition-all duration-200",
					isHorizontal
						? [
								"inset-y-0 w-px",
								"bg-warm-300",
								"group-hover:w-[2px] group-hover:bg-[#d1cfc5] dark:group-hover:bg-dark-surface",
							]
						: [
								"inset-x-0 h-px",
								"bg-warm-300",
								"group-hover:h-[2px] group-hover:bg-[#d1cfc5] dark:group-hover:bg-dark-surface",
							],
					"group-data-[resize-handle-active]:bg-primary dark:group-data-[resize-handle-active]:bg-primary",
				)}
			/>
			{/* 透明热区，方便拖拽 */}
			<div
				className={cn(
					"absolute",
					isHorizontal
						? "inset-y-0 w-3 -left-[6px]"
						: "inset-x-0 h-3 -top-[6px]",
				)}
			/>
		</PanelResizeHandle>
	);
}
