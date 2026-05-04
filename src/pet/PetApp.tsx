/**
 * PetApp — 桌面宠物独立窗口应用
 *
 * 存在于 #/pet 哈希路由的独立 BrowserWindow 中。
 * 复用 SpriteAnimator 显示角色动画，通过 usePetEventBridge 接收 Agent 事件。
 */

import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { SpriteAnimator } from "../components/Mascot/SpriteAnimator";
import {
	getMascotAtlas,
	getMotionSpec,
	type MascotMotion,
} from "../lib/mascot/manifest";
import { mascotManager, type MascotSelection } from "../lib/mascotStore";
import { invoke } from "../lib/tauriCompat";
import { usePetEventBridge } from "./usePetEventBridge";
import {
	PetTaskBubble,
	PetNotificationBubble,
	PetInputBubble,
} from "./PetBubble";

// ── 宠物 UI 状态机 ──

interface PetUIState {
	motion: MascotMotion;
	bubble: "none" | "task" | "notification" | "input";
}

type PetUIAction =
	| { type: "SET_MOTION"; motion: MascotMotion }
	| { type: "SHOW_TASK_BUBBLE" }
	| { type: "SHOW_NOTIFICATION_BUBBLE" }
	| { type: "TOGGLE_INPUT_BUBBLE" }
	| { type: "HIDE_BUBBLE" }
	| { type: "HOVER_START" }
	| { type: "HOVER_END" };

function petUIReducer(state: PetUIState, action: PetUIAction): PetUIState {
	switch (action.type) {
		case "SET_MOTION":
			return { ...state, motion: action.motion };
		case "SHOW_TASK_BUBBLE":
			return { ...state, bubble: "task" };
		case "SHOW_NOTIFICATION_BUBBLE":
			return { ...state, bubble: "notification" };
		case "TOGGLE_INPUT_BUBBLE":
			return {
				...state,
				bubble: state.bubble === "input" ? "none" : "input",
			};
		case "HIDE_BUBBLE":
			return { ...state, bubble: "none" };
		case "HOVER_START":
			return { ...state, motion: "greet" };
		case "HOVER_END":
			return { ...state, motion: "idle" };
		default:
			return state;
	}
}

// ── 主组件 ──

export default function PetApp() {
	const [mascotId, setMascotId] = useState<MascotSelection>(() =>
		mascotManager.getId(),
	);
	const [uiState, uiDispatch] = useReducer(petUIReducer, {
		motion: "idle",
		bubble: "none",
	});
	const eventState = usePetEventBridge();
	const [inputText, setInputText] = useState("");
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef({ x: 0, y: 0 });
	// 真位移 > 5px 才置 true，区分"点击"与"拖动"
	const movedRef = useRef(false);
	const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// 监听 mascotStore 变化
	useEffect(() => {
		const unsub = mascotManager.subscribe(() => {
			setMascotId(mascotManager.getId());
		});
		return unsub;
	}, []);

	// 获取 atlas
	const atlasUrl = useMemo(() => {
		if (mascotId === "off") return null;
		return getMascotAtlas(mascotId);
	}, [mascotId]);

	// 当前动画行规格
	const rowSpec = useMemo(
		() => getMotionSpec(uiState.motion),
		[uiState.motion],
	);

	// ── Agent 事件 → UI 状态同步 ──

	useEffect(() => {
		if (eventState.petState === "thinking") {
			uiDispatch({ type: "SET_MOTION", motion: "thinking" });
			uiDispatch({ type: "SHOW_TASK_BUBBLE" });
		} else if (eventState.petState === "done") {
			uiDispatch({ type: "SET_MOTION", motion: "done" });
			uiDispatch({ type: "SHOW_NOTIFICATION_BUBBLE" });
			// 3 秒后自动隐藏通知
			if (notificationTimerRef.current)
				clearTimeout(notificationTimerRef.current);
			notificationTimerRef.current = setTimeout(() => {
				uiDispatch({ type: "HIDE_BUBBLE" });
				uiDispatch({ type: "SET_MOTION", motion: "idle" });
			}, 3000);
		} else if (eventState.petState === "error") {
			uiDispatch({ type: "SET_MOTION", motion: "sad" });
			uiDispatch({ type: "SHOW_NOTIFICATION_BUBBLE" });
		} else if (eventState.petState === "sleepy") {
			uiDispatch({ type: "SET_MOTION", motion: "sleepy" });
		}
	}, [eventState.petState]);

	// 空闲时每 8±3s 随机微动作
	useEffect(() => {
		if (uiState.motion !== "idle") return;
		const scheduleNext = () => {
			const delay = 5000 + Math.random() * 6000; // 5-11s
			doneTimerRef.current = setTimeout(() => {
				if (mascotManager.getId() !== "off") {
					// 偶发 greet 或 done 微动作
					const microMotion: MascotMotion =
						Math.random() > 0.7 ? "greet" : "done";
					uiDispatch({ type: "SET_MOTION", motion: microMotion });
					setTimeout(() => {
						uiDispatch({ type: "SET_MOTION", motion: "idle" });
					}, 1200);
				}
				scheduleNext();
			}, delay);
		};
		scheduleNext();
		return () => {
			if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
		};
	}, [uiState.motion]);

	// ── 交互处理 ──

	const handleMouseEnter = useCallback(() => {
		if (isDragging) return;
		hoverTimerRef.current = setTimeout(() => {
			uiDispatch({ type: "HOVER_START" });
			// greet 播完后回 idle
			setTimeout(() => {
				uiDispatch({ type: "HOVER_END" });
			}, 800);
		}, 150);
	}, [isDragging]);

	const handleMouseLeave = useCallback(() => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
	}, []);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		// 简单的右键菜单通过 IPC 调用主窗口设置
		void invoke("pet_window_focus_main");
	}, []);

	// ── 拖动 vs 点击 ──
	//
	// 旧实现的 bug：mouseup 无条件 `pet_window_set_position(e.screenX, e.screenY)`，
	// 把窗口左上角粗暴设到鼠标位置，鼠标越靠右下，窗口越右下"跑"。
	//
	// 新实现：mousedown 通知主进程开始拖动（缓存窗口位置 + 鼠标起点），
	// mousemove 时主进程计算窗口位移；只有真位移 > 5px 才算"拖动"，
	// 否则 mouseup 视为"点击"，触发 toggle 输入气泡。

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		if (e.button !== 0) return;
		// 记录起点；进入"潜在拖动"状态，但暂不改 motion，避免点击瞬间一闪
		dragStartRef.current = { x: e.screenX, y: e.screenY };
		movedRef.current = false;
		setIsDragging(true);
		void invoke("pet_window_drag_start", {
			mouseX: e.screenX,
			mouseY: e.screenY,
		});
	}, []);

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			const dx = e.screenX - dragStartRef.current.x;
			const dy = e.screenY - dragStartRef.current.y;
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
				if (!movedRef.current) {
					movedRef.current = true;
					// 真正拖动后才进入"跳跃"动画
					uiDispatch({ type: "SET_MOTION", motion: "done" });
				}
				void invoke("pet_window_drag_move", {
					mouseX: e.screenX,
					mouseY: e.screenY,
				});
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			const wasDrag = movedRef.current;
			void invoke("pet_window_drag_end").finally(() => {
				if (wasDrag) {
					uiDispatch({ type: "SET_MOTION", motion: "idle" });
				} else {
					// 点击行为：toggle 输入气泡
					uiDispatch({ type: "TOGGLE_INPUT_BUBBLE" });
				}
			});
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging]);

	// ── 快捷回复 ──

	const handleSendQuickReply = useCallback(() => {
		const text = inputText.trim();
		if (!text) return;
		void invoke("pet_window_send_chat", { text });
		setInputText("");
		uiDispatch({ type: "HIDE_BUBBLE" });
		uiDispatch({ type: "SET_MOTION", motion: "idle" });
	}, [inputText]);

	// 用户点"打开主窗口"或"去主窗口处理"后，应自动关闭气泡 + 回到 idle，
	// 否则宠物会停留在"被点击"语境，体验断裂。
	const handleFocusMain = useCallback(() => {
		void invoke("pet_window_focus_main");
		uiDispatch({ type: "HIDE_BUBBLE" });
		uiDispatch({ type: "SET_MOTION", motion: "idle" });
	}, []);

	// ── 渲染 ──

	// off 状态：窗口隐藏（由主进程控制）
	if (mascotId === "off" || !atlasUrl) {
		return null;
	}

	return (
		<div
			className="relative w-full h-full flex flex-col items-center justify-end select-none"
			style={{
				background: "transparent",
				// 留 4px 透明留白，让宠物的"阴影/光晕"不会被窗口边缘硬切
				padding: "8px 8px 4px",
			}}
		>
			{/* 气泡区域 — 与角色之间留 10px 让三角箭头有呼吸 */}
			{uiState.bubble !== "none" && (
				<div className="mb-[10px] flex justify-center w-full">
					{uiState.bubble === "task" && eventState.currentTask && (
						<PetTaskBubble
							title={eventState.currentTask.title}
							noInteract={isDragging}
						/>
					)}

					{uiState.bubble === "notification" && eventState.notification && (
						<PetNotificationBubble
							type={eventState.notification.type}
							message={eventState.notification.message}
							onAction={handleFocusMain}
							noInteract={isDragging}
						/>
					)}

					{uiState.bubble === "input" && (
						<PetInputBubble
							ref={inputRef}
							value={inputText}
							onChange={setInputText}
							onSubmit={handleSendQuickReply}
							onClose={() => uiDispatch({ type: "HIDE_BUBBLE" })}
							onOpenMain={handleFocusMain}
							noInteract={isDragging}
						/>
					)}
				</div>
			)}

				{/* 角色本体 — 点击/拖动统一在 mousedown/mouseup 里区分 */}
			<div
				className="cursor-grab active:cursor-grabbing transition-transform duration-300 ease-out"
				style={{
					transform: isDragging
						? "scale(1.08)"
						: uiState.motion === "greet"
							? "scale(1.05)"
							: "scale(1)",
					background: "transparent",
				}}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				onContextMenu={handleContextMenu}
				onMouseDown={handleMouseDown}
				role="button"
				tabIndex={0}
				aria-label="桌面宠物"
			>
				<SpriteAnimator
					atlasUrl={atlasUrl}
					row={rowSpec}
					size={180}
					paused={false}
					loop={true}
				/>
			</div>
		</div>
	);
}
