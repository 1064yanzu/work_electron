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
				"group relative flex items-stretch justify-center select-none",
				"transition-colors duration-150",
				isHorizontal
					? "w-2 -mx-1 cursor-col-resize"
					: "h-2 -my-1 cursor-row-resize",
			)}
		>
			{/* 背景热区 */}
			<div
				className={cn(
					"absolute rounded-full transition-all duration-150",
					"bg-transparent group-hover:bg-zinc-200/50 dark:group-hover:bg-zinc-700/50",
					"group-data-[resize-handle-active]:bg-primary/20",
					isHorizontal
						? "inset-y-0 left-1/2 -translate-x-1/2 w-4"
						: "inset-x-0 top-1/2 -translate-y-1/2 h-4",
				)}
			/>

			{/* 可见指示器 */}
			<div
				className={cn(
					"rounded-full transition-all duration-150 ease-out",
					"bg-transparent group-hover:bg-zinc-300 dark:group-hover:bg-zinc-600",
					"group-data-[resize-handle-active]:bg-primary group-data-[resize-handle-active]:scale-125",
					isHorizontal ? "w-0.5 flex-1 my-4" : "h-0.5 flex-1 mx-4",
				)}
			/>

			{/* 手柄点 */}
			<div
				className={cn(
					"absolute flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150",
					"group-data-[resize-handle-active]:opacity-100",
					isHorizontal
						? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex-col"
						: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex-row",
				)}
			>
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className={cn(
							"w-1 h-1 rounded-full",
							"bg-zinc-400 dark:bg-zinc-500",
							"group-data-[resize-handle-active]:bg-primary",
						)}
					/>
				))}
			</div>
		</PanelResizeHandle>
	);
}
