import { PanelResizeHandle } from "react-resizable-panels";

interface ResizeHandleProps {
	onDragging?: (isDragging: boolean) => void;
}

export default function ResizeHandle({ onDragging }: ResizeHandleProps = {}) {
	return (
		<PanelResizeHandle
			onDragging={onDragging}
			className="group relative w-2 -mx-1 flex items-stretch justify-center cursor-col-resize select-none"
		>
			<div className="w-px flex-1 bg-transparent group-hover:bg-black/10 dark:group-hover:bg-white/10" />
			<div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-1 rounded-full bg-transparent group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-colors" />
		</PanelResizeHandle>
	);
}
