import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

export type DragPayload =
	| { kind: "source"; id: string; title: string }
	| { kind: "text"; title: string; content: string };

type DragState = {
	active: boolean;
	payload: DragPayload | null;
	x: number;
	y: number;
};

type MouseDragContextValue = {
	state: DragState;
	startDrag: (
		payload: DragPayload,
		start: { clientX: number; clientY: number },
	) => void;
	endDrag: () => void;
};

const MouseDragContext = createContext<MouseDragContextValue | null>(null);

export function MouseDragProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = useState<DragState>({
		active: false,
		payload: null,
		x: 0,
		y: 0,
	});
	const activeRef = useRef(false);

	const endDrag = useCallback(() => {
		activeRef.current = false;
		setState((s) => ({ ...s, active: false, payload: null }));
	}, []);

	const startDrag: MouseDragContextValue["startDrag"] = useCallback(
		(payload, start) => {
			activeRef.current = true;
			setState({ active: true, payload, x: start.clientX, y: start.clientY });
		},
		[],
	);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!activeRef.current) return;
			setState((s) => ({ ...s, x: e.clientX, y: e.clientY }));
		};
		const onUp = () => {
			if (!activeRef.current) return;
			endDrag();
		};
		window.addEventListener("mousemove", onMove, { passive: true });
		window.addEventListener("mouseup", onUp, { passive: true });
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
	}, [endDrag]);

	const value = useMemo<MouseDragContextValue>(
		() => ({ state, startDrag, endDrag }),
		[state, startDrag, endDrag],
	);

	return (
		<MouseDragContext.Provider value={value}>
			{children}
			<DragOverlay state={state} />
		</MouseDragContext.Provider>
	);
}

function DragOverlay({ state }: { state: DragState }) {
	if (!state.active || !state.payload) return null;
	return (
		<div
			className="pointer-events-none fixed left-0 top-0 z-50"
			style={{
				transform: `translate3d(${state.x + 12}px, ${state.y + 12}px, 0)`,
			}}
		>
			<div
				className={cn(
					"max-w-[320px] rounded-xl border border-border/60 bg-popover px-3 py-2 shadow-sm",
				)}
			>
				<div className="truncate text-xs font-medium text-foreground">
					{state.payload.kind === "source"
						? state.payload.title
						: state.payload.title}
				</div>
				<div className="mt-0.5 text-[10px] text-muted-foreground">
					拖拽到 Copilot 以加入上下文
				</div>
			</div>
		</div>
	);
}

export function useMouseDrag() {
	const ctx = useContext(MouseDragContext);
	if (!ctx)
		throw new Error("useMouseDrag must be used within MouseDragProvider");
	return ctx;
}

export function useMouseDropZone<T extends HTMLElement>(opts: {
	ref: React.RefObject<T | null>;
	onDrop: (payload: DragPayload) => void;
}) {
	const { state } = useMouseDrag();
	const { ref, onDrop } = opts;
	const [isOver, setIsOver] = useState(false);
	const lastPayloadRef = useRef<DragPayload | null>(null);
	const lastOverRef = useRef(false);
	const wasActiveRef = useRef(false);

	useEffect(() => {
		if (!state.active) {
			setIsOver(false);
			return;
		}
		const el = ref.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const over =
			state.x >= rect.left &&
			state.x <= rect.right &&
			state.y >= rect.top &&
			state.y <= rect.bottom;
		setIsOver(over);
		lastOverRef.current = over;
		lastPayloadRef.current = state.payload;
	}, [ref, state.active, state.payload, state.x, state.y]);

	useEffect(() => {
		const wasActive = wasActiveRef.current;
		wasActiveRef.current = state.active;
		if (wasActive && !state.active && lastOverRef.current) {
			const payload = lastPayloadRef.current;
			if (payload) onDrop(payload);
		}
	}, [onDrop, state.active]);

	return { isOver, active: state.active };
}
