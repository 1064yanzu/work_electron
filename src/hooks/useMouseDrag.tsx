import type React from "react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { debugUiLog } from "../lib/debug/uiDebug";

// 拖拽数据类型
export interface DragItem {
	type: "source";
	sourceId: string;
	sourceData: any;
}

// 拖拽状态
interface DragState {
	isDragging: boolean;
	dragItem: DragItem | null;
	dragPosition: { x: number; y: number } | null;
	dragOffset: { x: number; y: number };
}

// Context 类型
interface MouseDragContextType extends DragState {
	startDrag: (item: DragItem, e: React.MouseEvent) => void;
	updatePosition: (e: MouseEvent) => void;
	endDrag: () => void;
	getDragItem: () => DragItem | null;
}

const MouseDragContext = createContext<MouseDragContextType | null>(null);

// Provider 组件
export function MouseDragProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<DragState>({
		isDragging: false,
		dragItem: null,
		dragPosition: null,
		dragOffset: { x: 0, y: 0 },
	});

	const dragItemRef = useRef<DragItem | null>(null);

	const startDrag = useCallback((item: DragItem, e: React.MouseEvent) => {
		e.preventDefault();
		dragItemRef.current = item;
		setState({
			isDragging: true,
			dragItem: item,
			dragPosition: { x: e.clientX, y: e.clientY },
			dragOffset: { x: 0, y: 0 },
		});
		debugUiLog("[MouseDrag] 开始拖拽:", item.sourceId);
	}, []);

	const updatePosition = useCallback((e: MouseEvent) => {
		setState((prev) => ({
			...prev,
			dragPosition: { x: e.clientX, y: e.clientY },
		}));
	}, []);

	const endDrag = useCallback(() => {
		debugUiLog("[MouseDrag] 结束拖拽");
		dragItemRef.current = null;
		setState({
			isDragging: false,
			dragItem: null,
			dragPosition: null,
			dragOffset: { x: 0, y: 0 },
		});
	}, []);

	const getDragItem = useCallback(() => dragItemRef.current, []);

	// 全局鼠标事件监听
	useEffect(() => {
		if (!state.isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			updatePosition(e);
		};

		const handleMouseUp = () => {
			// 延迟 endDrag，让 drop zone 有机会处理
			setTimeout(() => {
				endDrag();
			}, 50);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [state.isDragging, updatePosition, endDrag]);

	// 拖拽预览元素
	const dragPreview =
		state.isDragging && state.dragPosition && state.dragItem ? (
			<div
				style={{
					position: "fixed",
					left: state.dragPosition.x + 10,
					top: state.dragPosition.y + 10,
					pointerEvents: "none",
					zIndex: 9999,
					padding: "8px 12px",
					background: "rgba(59, 130, 246, 0.9)",
					color: "white",
					borderRadius: "8px",
					fontSize: "12px",
					fontWeight: 500,
					boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
					whiteSpace: "nowrap",
				}}
			>
				{state.dragItem.sourceData?.title || "拖拽中..."}
			</div>
		) : null;

	return (
		<MouseDragContext.Provider
			value={{ ...state, startDrag, updatePosition, endDrag, getDragItem }}
		>
			{children}
			{dragPreview}
		</MouseDragContext.Provider>
	);
}

// 自定义 Hook：使用拖拽功能
export function useMouseDrag() {
	const context = useContext(MouseDragContext);
	if (!context) {
		throw new Error("useMouseDrag must be used within MouseDragProvider");
	}
	return context;
}

// 自定义 Hook：作为 Drop Zone
export function useMouseDropZone(onDrop: (item: DragItem) => void) {
	const { isDragging, dragItem, getDragItem } = useMouseDrag();
	const [isOver, setIsOver] = useState(false);
	const elementRef = useRef<HTMLElement | null>(null);

	const handleMouseEnter = useCallback(() => {
		if (isDragging) {
			setIsOver(true);
			debugUiLog("[MouseDrag] 进入 drop 区域");
		}
	}, [isDragging]);

	const handleMouseLeave = useCallback(() => {
		setIsOver(false);
	}, []);

	const handleMouseUp = useCallback(() => {
		const item = getDragItem();
		if (isOver && item) {
			debugUiLog("[MouseDrag] 执行 drop:", item.sourceId);
			onDrop(item);
		}
		setIsOver(false);
	}, [isOver, getDragItem, onDrop]);

	// 当拖拽结束时重置 isOver
	useEffect(() => {
		if (!isDragging) {
			setIsOver(false);
		}
	}, [isDragging]);

	return {
		isOver,
		isDragging,
		dragItem,
		elementRef,
		dropZoneProps: {
			onMouseEnter: handleMouseEnter,
			onMouseLeave: handleMouseLeave,
			onMouseUp: handleMouseUp,
		},
	};
}
