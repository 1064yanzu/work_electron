/**
 * PetApp — 桌面宠物独立窗口应用
 *
 * 存在于 #/pet 哈希路由的独立 BrowserWindow 中。
 * 复用 SpriteAnimator 显示角色动画，通过 usePetEventBridge 接收 Agent 事件。
 *
 * 交互模型（v2 升级）：
 * - 单击宠物：toggle 输入气泡
 * - 双击宠物：聚焦主窗口
 * - 长按 600ms：弹出迷你上下文菜单（切换皮肤 / 隐藏 / 设置）
 * - 拖动结束：自动"边缘吸附"（左右两侧距离 ≤ 80px 时贴墙）
 * - 气泡悬停：冻结自动消失计时器
 * - 未读消息：宠物头顶红点（仅在没有 notification 气泡可见时显示）
 *
 * 气泡优先级（同一时刻只能显示一个）：
 * reminder > notification > input(用户主动开启) > progress > task
 */

import { EASE, gsap, mDur, useGsapMotion } from "../lib/motion";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { MascotSpriteFader } from "./MascotSpriteFader";
import { PetGroundShadow } from "./PetGroundShadow";
import { PEEK_OFFSET_PX, usePetEdgePeek } from "./usePetEdgePeek";
import { useMouseGaze } from "./useMouseGaze";
import { usePetBodyMotion } from "./usePetBodyMotion";
import { useTapBurst } from "./useTapBurst";
import {
	getMascotAtlas,
	getMascotAsset,
	type MascotMotion,
	type MascotId,
} from "../lib/mascot/manifest";
import {
	mascotManager,
	useMascot,
	type MascotSelection,
} from "../lib/mascotStore";
import { invoke } from "../lib/tauriCompat";
import { listen, type UnlistenFn } from "../lib/tauriEventCompat";
import { usePetEventBridge } from "./usePetEventBridge";
import { useBubblePlacement } from "./useBubblePlacement";
import { usePetHitTest } from "./usePetHitTest";
import {
	PetTaskBubble,
	PetNotificationBubble,
	PetInputBubble,
	PetProgressBubble,
	PetReminderBubble,
	PetHistoryBubble,
	withAlpha,
} from "./bubbles";

// ── 常量 ──

const LONG_PRESS_MS = 600;
const DOUBLE_CLICK_MS = 280;
const DRAG_THRESHOLD_PX = 5;
const SNAP_THRESHOLD_PX = 80;

const SIZE_PRESET_TO_PX: Record<string, number> = {
	sm: 120,
	md: 160,
	lg: 180,
	xl: 220,
};

type BubbleKind =
	| "none"
	| "task"
	| "progress"
	| "notification"
	| "reminder"
	| "input"
	| "history";

// ── 宠物 UI 状态机 ──

interface PetUIState {
	motion: MascotMotion;
	bubble: BubbleKind;
	/** 用户主动打开了输入气泡（让 progress/task 不抢回去） */
	inputOpenedByUser: boolean;
}

type PetUIAction =
	| { type: "SET_MOTION"; motion: MascotMotion }
	| { type: "SHOW_BUBBLE"; bubble: Exclude<BubbleKind, "input"> }
	| { type: "TOGGLE_INPUT_BUBBLE" }
	| { type: "HIDE_BUBBLE" }
	| { type: "HOVER_START" }
	| { type: "HOVER_END" };

function petUIReducer(state: PetUIState, action: PetUIAction): PetUIState {
	switch (action.type) {
		case "SET_MOTION":
			return { ...state, motion: action.motion };
		case "SHOW_BUBBLE":
			// 用户正在输入时，不抢气泡（除了 reminder/history 这类用户主动触发的）
			if (
				state.inputOpenedByUser &&
				action.bubble !== "reminder" &&
				action.bubble !== "history"
			)
				return state;
			return { ...state, bubble: action.bubble };
		case "TOGGLE_INPUT_BUBBLE": {
			const opening = state.bubble !== "input";
			return {
				...state,
				bubble: opening ? "input" : "none",
				inputOpenedByUser: opening,
			};
		}
		case "HIDE_BUBBLE":
			return { ...state, bubble: "none", inputOpenedByUser: false };
		case "HOVER_START":
			// 不要打断 thinking / sad / done 这种语义动作
			if (
				state.motion === "thinking" ||
				state.motion === "sad" ||
				state.motion === "done"
			) {
				return state;
			}
			return { ...state, motion: "greet" };
		case "HOVER_END":
			// 只在当前是 greet（hover 引起的）时回 idle，避免压掉真实事件设置的 motion
			if (state.motion !== "greet") return state;
			return { ...state, motion: "idle" };
		default:
			return state;
	}
}

const INITIAL_UI_STATE: PetUIState = {
	motion: "idle",
	bubble: "none",
	inputOpenedByUser: false,
};

// ── 主组件 ──

export default function PetApp() {
	const { id: mascotId, ready: mascotReady } = useMascot();
	const [uiState, uiDispatch] = useReducer(petUIReducer, INITIAL_UI_STATE);
	const eventState = usePetEventBridge();
	const [inputText, setInputText] = useState("");
	const [isDragging, setIsDragging] = useState(false);
	const [contextMenuOpen, setContextMenuOpen] = useState(false);

	// 设置：尺寸 / 勿扰 / dwell（从主进程持久化拉取，并跟踪 pet-settings-changed 事件实时更新）
	const [sizePreset, setSizePreset] = useState<string>("lg");
	const [throughClicks, setThroughClicks] = useState(false);
	// 是否处于 sink（关闭气泡的退场动画）
	const [bubbleSinking, setBubbleSinking] = useState(false);
	// 落地反弹 / 连点摇晃 / 眨眼 / idle 呼吸 → 统一由 usePetBodyMotion 的
	// GSAP 时间轴驱动，不再各自持一份一次性 state
	// 贴墙半隐藏
	const edgePeek = usePetEdgePeek(!isDragging);
	/**
	 * 连续动效专用容器。视线追随（x/y）与拖动倾斜（rotation）都由 GSAP 直接写
	 * 这个元素的 transform，**不经过 React**——它们是每帧变化的量，走 state 会让
	 * 这个 1200 行的组件按帧率重渲染。
	 * 离散状态（scale、贴墙偏移）仍由下面那层 React 计算的 transform 负责，
	 * 两层各写各的元素，不会互相覆盖。
	 */
	const motionLayerRef = useRef<HTMLDivElement>(null);
	// 视线追随（拖动 / 贴墙半隐藏时禁用，避免与其它 transform 叠加错位）
	useMouseGaze(!isDragging && !edgePeek.peeking, motionLayerRef);

	// 当前宠物的"声音颜色"——用于气泡边缘光晕、按钮色、连点迸发的粒子色
	const accentColor =
		mascotId === "off"
			? "#D96C46"
			: (mascotManager.getMergedMeta(mascotId)?.accentColor ?? "#D96C46");

	// 身体的挤压/拉伸通道：落地"啪嗒"、连点摇晃、idle 呼吸。
	// 与 motionLayer 分层，各写各的元素（见 usePetBodyMotion 顶部注释）。
	const { squashRef, shadowRef, playLand, playWobble } = usePetBodyMotion({
		idle:
			uiState.motion === "idle" &&
			!isDragging &&
			!edgePeek.peeking &&
			uiState.bubble === "none",
		burstColor: accentColor,
	});

	const dragStartRef = useRef({ x: 0, y: 0 });
	// 真位移 > 5px 才置 true，区分"点击"与"拖动"
	const movedRef = useRef(false);
	// mousedown 时是否按住 shift：松手时决定是否禁用边缘吸附
	const shiftHeldRef = useRef(false);
	const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const idleMicroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressFiredRef = useRef(false);
	const lastClickAtRef = useRef(0);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const bubbleHoveredRef = useRef(false);
	const isHoveringRef = useRef(false);
	// 用于拖动惯性：保留最近 ~80ms 的鼠标位置，松手时算速度
	const dragVelocityRef = useRef<Array<{ x: number; y: number; t: number }>>(
		[],
	);
	// 拖动期间最近一次方向 sprite（避免抖动反复 dispatch）
	const lastDragMotionRef = useRef<MascotMotion | null>(null);

	// 记下最近一次显示的 notification 消息，用于决定 dwell 时长
	const lastNotificationMessageRef = useRef<string>("");

	// 启动时拉取尺寸 / dwell / 勿扰；监听 pet-settings-changed 实时同步
	useEffect(() => {
		void invoke<{
			sizePreset: string;
			dwellPreset: string;
			dndStart: string | null;
			dndEnd: string | null;
			throughClicks: boolean;
		}>("pet_window_get_state")
			.then((state) => {
				if (state?.sizePreset) setSizePreset(state.sizePreset);
				if (typeof state?.throughClicks === "boolean")
					setThroughClicks(state.throughClicks);
			})
			.catch(() => {});

		let unlisten: UnlistenFn | null = null;
		void (async () => {
			try {
				unlisten = await listen<{ patch: Record<string, unknown> }>(
					"pet-settings-changed",
					(event) => {
						const patch = event.payload?.patch ?? {};
						if (typeof patch.sizePreset === "string") {
							setSizePreset(patch.sizePreset);
						}
						if (typeof patch.throughClicks === "boolean") {
							setThroughClicks(patch.throughClicks);
						}
					},
				);
			} catch {
				// noop
			}
		})();
		return () => {
			unlisten?.();
		};
	}, []);

	// 落地反弹：宠物窗口被主进程动画移到边缘后通过 "pet-landed" 通知。
	// 压扁回弹 + 影子同步摊开，都在 usePetBodyMotion 的同一条 timeline 上。
	useEffect(() => {
		let unlisten: UnlistenFn | null = null;
		void (async () => {
			try {
				unlisten = await listen<{ x: number; y: number }>("pet-landed", () => {
					playLand();
				});
			} catch {
				// noop
			}
		})();
		return () => {
			unlisten?.();
		};
	}, [playLand]);

	// 全局热键唤起：主进程 globalShortcut 触发后转发 pet-focus-input，
	// 收到后强制打开输入气泡并让 textarea 聚焦
	useEffect(() => {
		let unlisten: UnlistenFn | null = null;
		void (async () => {
			try {
				unlisten = await listen("pet-focus-input", () => {
					uiDispatch({ type: "HIDE_BUBBLE" });
					// 等一帧后打开，避免与上一帧 HIDE_BUBBLE 合并
					setTimeout(() => {
						uiDispatch({ type: "TOGGLE_INPUT_BUBBLE" });
						eventState.markRead();
						inputRef.current?.focus();
					}, 0);
				});
			} catch {
				// noop
			}
		})();
		return () => {
			unlisten?.();
		};
	}, [eventState]);

	// 当前宠物的"声音颜色"——见上方 accentColor 定义（挪到了 hook 区，
	// 因为 usePetBodyMotion 的粒子色要用它）

	const atlasUrl = mascotId === "off" ? null : getMascotAtlas(mascotId);
	const fallbackHeroUrl =
		mascotId === "off" || atlasUrl
			? null
			: getMascotAsset(mascotId, "hero") || null;

	// ── Agent 事件 → UI 状态同步 ──
	//
	// 优先级：reminder > notification > progress > task
	// 用户主动开了 input 气泡时，progress/task 不抢回去（PR_REVIEW 等被动状态除外）
	useEffect(() => {
		// reminder 是主动提醒，永远抢气泡
		if (eventState.reminder) {
			uiDispatch({ type: "SHOW_BUBBLE", bubble: "reminder" });
			uiDispatch({ type: "SET_MOTION", motion: "greet" });
			return;
		}

		if (eventState.petState === "thinking") {
			uiDispatch({ type: "SET_MOTION", motion: "thinking" });
			// 有进度信息就用 progress 气泡；否则退回 task 气泡
			uiDispatch({
				type: "SHOW_BUBBLE",
				bubble: eventState.progress ? "progress" : "task",
			});
		} else if (eventState.petState === "done") {
			uiDispatch({ type: "SET_MOTION", motion: "done" });
			uiDispatch({ type: "SHOW_BUBBLE", bubble: "notification" });
		} else if (eventState.petState === "error") {
			uiDispatch({ type: "SET_MOTION", motion: "sad" });
			uiDispatch({ type: "SHOW_BUBBLE", bubble: "notification" });
		} else if (eventState.petState === "sleepy") {
			uiDispatch({ type: "SET_MOTION", motion: "sleepy" });
		}
	}, [eventState.petState, eventState.reminder, eventState.progress]);

	// notification 自动消失计时（用户 hover 气泡时冻结）
	useEffect(() => {
		if (uiState.bubble !== "notification" || !eventState.notification) return;
		// 同一条通知不重置计时（避免父级 re-render 抖动）
		if (
			lastNotificationMessageRef.current === eventState.notification.message
		) {
			return;
		}
		lastNotificationMessageRef.current = eventState.notification.message;

		// 消息越长读得越久（4 字 ≈ 1 秒），最少 2.4s 最多 7s；再乘以用户设置的系数
		const msgLen = eventState.notification.message.length;
		const baseDwell = Math.min(7000, Math.max(2400, 1800 + msgLen * 80));
		// 连续 ≥2 次报错时，让 sad motion 持续更久（× 2，给"安抚"留时间）
		const errorBoost =
			eventState.notification.type === "error" &&
			eventState.sessionStats.consecutiveError >= 2
				? 2
				: 1;
		const dwellMs = Math.round(
			baseDwell * (eventState.dwellMultiplier ?? 1) * errorBoost,
		);

		if (notificationTimerRef.current)
			clearTimeout(notificationTimerRef.current);

		notificationTimerRef.current = setTimeout(() => {
			// 用户正悬停在气泡上 → 等他离开再走
			if (bubbleHoveredRef.current) return;
			// 走 sink 退场动画
			setBubbleSinking(true);
			setTimeout(() => {
				uiDispatch({ type: "HIDE_BUBBLE" });
				uiDispatch({ type: "SET_MOTION", motion: "idle" });
				setBubbleSinking(false);
				// 队列里还有下一条？让 reducer 自然继续
				eventState.consumeNextNotification?.();
			}, 180);
		}, dwellMs);

		return () => {
			if (notificationTimerRef.current) {
				clearTimeout(notificationTimerRef.current);
				notificationTimerRef.current = null;
			}
		};
	}, [uiState.bubble, eventState.notification]);

	// 空闲时每 5-11s 随机微动作
	useEffect(() => {
		if (uiState.motion !== "idle") return;
		const scheduleNext = () => {
			const delay = 5000 + Math.random() * 6000;
			idleMicroTimerRef.current = setTimeout(() => {
				if (mascotManager.getId() !== "off") {
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
			if (idleMicroTimerRef.current) clearTimeout(idleMicroTimerRef.current);
		};
	}, [uiState.motion]);

	// 眨眼已搬进 usePetBodyMotion：走 GSAP 直写 filter，
	// 不再每 5-9s 触发两次 setState 把整个组件重渲染一遍。

	// ── 交互处理 ──

	// 连点害羞：2 秒内 ≥ 3 次 mouseup 触发（摇晃 + 一小圈迸发）
	const registerTap = useTapBurst(playWobble);

	// 连点庆祝彩蛋：5 秒内 ≥ 10 次触发（两个 burst hook 独立计数）
	const registerCelebrate = useTapBurst(
		useCallback(() => {
			uiDispatch({ type: "SET_MOTION", motion: "done" });
			setTimeout(() => {
				uiDispatch({ type: "SET_MOTION", motion: "greet" });
				setTimeout(() => {
					uiDispatch({ type: "SET_MOTION", motion: "idle" });
				}, 1200);
			}, 400);
		}, []),
		{ threshold: 10, windowMs: 5000 },
	);

	const handleMouseEnter = useCallback(() => {
		if (isDragging) return;
		isHoveringRef.current = true;
		// 角色本体 hover 同样冻结通知 dwell 计时器（与气泡 hover 行为一致）
		bubbleHoveredRef.current = true;
		if (notificationTimerRef.current) {
			clearTimeout(notificationTimerRef.current);
			notificationTimerRef.current = null;
		}
		edgePeek.onHoverStart();
		// 150ms 防误触；hover 期间保持 greet，离开才回 idle
		hoverTimerRef.current = setTimeout(() => {
			if (isHoveringRef.current && !isDragging) {
				uiDispatch({ type: "HOVER_START" });
			}
		}, 150);
	}, [isDragging, edgePeek]);

	const handleMouseLeave = useCallback(() => {
		isHoveringRef.current = false;
		bubbleHoveredRef.current = false;
		edgePeek.onHoverEnd();
		if (hoverTimerRef.current) {
			clearTimeout(hoverTimerRef.current);
			hoverTimerRef.current = null;
		}
		// 仅当当前是 greet（hover 引起）时才回 idle，避免压掉 thinking/done/sad
		uiDispatch({ type: "HOVER_END" });
		// 离开角色本体时，若当前显示通知气泡，重启 dwell 计时器（1.5s 缓冲）
		if (uiState.bubble === "notification" && eventState.notification) {
			notificationTimerRef.current = setTimeout(() => {
				if (bubbleHoveredRef.current) return;
				setBubbleSinking(true);
				setTimeout(() => {
					uiDispatch({ type: "HIDE_BUBBLE" });
					uiDispatch({ type: "SET_MOTION", motion: "idle" });
					setBubbleSinking(false);
					eventState.consumeNextNotification?.();
				}, 180);
			}, 1500);
		}
	}, [edgePeek, uiState.bubble, eventState]);

	// 长按上下文菜单触发
	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenuOpen((prev) => !prev);
	}, []);

	// ── 拖动 / 单击 / 双击 / 长按 ──
	//
	// mousedown：开启长按定时器 + 通知主进程预备拖动
	// mousemove：超过阈值则取消长按、进入"真拖动"
	// mouseup：
	//   - 如果长按已触发 → 已处理
	//   - 如果真位移 > 阈值 → 拖动结束 + 边缘吸附
	//   - 否则视作点击：触发双击 / 单击 toggle 输入气泡

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (e.button !== 0) return;
			dragStartRef.current = { x: e.screenX, y: e.screenY };
			movedRef.current = false;
			longPressFiredRef.current = false;
			dragVelocityRef.current = [
				{ x: e.screenX, y: e.screenY, t: performance.now() },
			];
			setIsDragging(true);
			edgePeek.onDragStart();
			setContextMenuOpen(false); // 任何 mousedown 都关菜单
			// 记录 shift 状态：按住 Shift → 松手时不做边缘吸附
			shiftHeldRef.current = e.shiftKey;

			// 长按定时器：600ms 不动就弹菜单
			if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = setTimeout(() => {
				if (!movedRef.current) {
					longPressFiredRef.current = true;
					setContextMenuOpen(true);
					setIsDragging(false);
					void invoke("pet_window_drag_end").catch(() => {});
				}
			}, LONG_PRESS_MS);

			void invoke("pet_window_drag_start", {
				mouseX: e.screenX,
				mouseY: e.screenY,
			});
		},
		[edgePeek],
	);

	useEffect(() => {
		if (!isDragging) return;

		// 倾斜走 quickTo：拖动期间每次 mousemove 都要改这个角度，
		// 走 setState 等于按鼠标事件频率重渲染整个桌宠。
		const layer = motionLayerRef.current;
		const rotateTo = layer
			? gsap.quickTo(layer, "rotation", { duration: 0.25, ease: "power3" })
			: null;

		const handleMouseMove = (e: MouseEvent) => {
			const dx = e.screenX - dragStartRef.current.x;
			const dy = e.screenY - dragStartRef.current.y;
			if (
				Math.abs(dx) > DRAG_THRESHOLD_PX ||
				Math.abs(dy) > DRAG_THRESHOLD_PX
			) {
				if (!movedRef.current) {
					movedRef.current = true;
					if (longPressTimerRef.current) {
						clearTimeout(longPressTimerRef.current);
						longPressTimerRef.current = null;
					}
					// 按起始位移方向选 run-left / run-right；正好为 0 时默认右
					const initialDir: MascotMotion = dx >= 0 ? "run-right" : "run-left";
					lastDragMotionRef.current = initialDir;
					uiDispatch({ type: "SET_MOTION", motion: initialDir });
				}

				// 维护近 80ms 的位置样本：用于 mouseup 时算速度 + 计算倾斜方向
				const now = performance.now();
				const samples = dragVelocityRef.current;
				samples.push({ x: e.screenX, y: e.screenY, t: now });
				while (samples.length > 0 && now - samples[0].t > 80) {
					samples.shift();
				}

				// 短窗口内的位移 → 即时 dx/dt 决定倾斜方向（仅看横向）
				if (samples.length >= 2) {
					const first = samples[0];
					const last = samples[samples.length - 1];
					const dtSeg = Math.max(1, last.t - first.t);
					const vxSeg = (last.x - first.x) / dtSeg; // px/ms
					// 限幅 ±6deg；vxSeg ≈ ±2 px/ms 对应满倾斜
					const rot = Math.max(-6, Math.min(6, vxSeg * 3));
					rotateTo?.(rot);

					// 根据水平速度切换 sprite 朝向；阈值带 ±0.05 px/ms 内保持上次方向，避免抖动
					const DIR_THRESHOLD = 0.05;
					let nextDirMotion: MascotMotion | null = null;
					if (vxSeg > DIR_THRESHOLD) nextDirMotion = "run-right";
					else if (vxSeg < -DIR_THRESHOLD) nextDirMotion = "run-left";

					if (nextDirMotion && nextDirMotion !== lastDragMotionRef.current) {
						lastDragMotionRef.current = nextDirMotion;
						uiDispatch({ type: "SET_MOTION", motion: nextDirMotion });
					}
				}

				void invoke("pet_window_drag_move", {
					mouseX: e.screenX,
					mouseY: e.screenY,
				});
			}
		};

		const handleMouseUp = () => {
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current);
				longPressTimerRef.current = null;
			}
			if (longPressFiredRef.current) {
				// 长按已经在 timer 里处理过：drag_end 也已发，不重复
				return;
			}
			setIsDragging(false);
			// 松手回正带一次过冲摆动：手上"甩"的力道有个去处，比瞬间归零像活物。
			// 幅度按档位缩放，reduced 档 mDur 返回 0 → 直接落回 0 度。
			if (layer) {
				gsap.to(layer, {
					rotation: 0,
					duration: mDur(0.9),
					ease: "elastic.out(1, 0.45)",
					overwrite: "auto",
				});
			}
			lastDragMotionRef.current = null;
			const wasDrag = movedRef.current;

			// 算松手时的速度：取最后 ~60ms 的平均速度（px/ms）
			let vx = 0;
			let vy = 0;
			const samples = dragVelocityRef.current;
			if (samples.length >= 2) {
				const last = samples[samples.length - 1];
				const cutoff = last.t - 60;
				let oldest = samples[samples.length - 1];
				for (const s of samples) {
					if (s.t >= cutoff) {
						oldest = s;
						break;
					}
				}
				const dt = Math.max(1, last.t - oldest.t);
				vx = (last.x - oldest.x) / dt;
				vy = (last.y - oldest.y) / dt;
			}

			void invoke("pet_window_drag_end", { vx, vy }).finally(() => {
				if (wasDrag) {
					uiDispatch({ type: "SET_MOTION", motion: "idle" });
					// 边缘吸附（仅真拖动时）。按住 Shift 时跳过 snap，允许"精确放置"。
					// 如果速度有效，主进程已经做了惯性飞 + snap，这里再调一次 snap 等同 no-op；保留兼容慢拖松手的场景
					if (shiftHeldRef.current) {
						// 清掉 shift 标记
						shiftHeldRef.current = false;
					} else {
						const speed = Math.sqrt(vx * vx + vy * vy);
						if (speed <= 0.1) {
							void invoke("pet_window_snap_to_edge", {
								threshold: SNAP_THRESHOLD_PX,
							}).catch(() => {});
						}
					}
				} else {
					// 点击行为：
					// - 立即 toggle 输入气泡（去掉原来的 280ms 延迟）
					// - 如果随后 280ms 内又来一次 mouseup → 视为双击，收回气泡 + 聚焦主窗口
					const now = Date.now();
					const isDoubleClick = now - lastClickAtRef.current < DOUBLE_CLICK_MS;

					if (isDoubleClick) {
						// 双击：撤销上一次的单击 toggle，聚焦主窗口
						lastClickAtRef.current = 0;
						void invoke("pet_window_focus_main");
						uiDispatch({ type: "HIDE_BUBBLE" });
						uiDispatch({ type: "SET_MOTION", motion: "done" });
						setTimeout(() => {
							uiDispatch({ type: "SET_MOTION", motion: "idle" });
						}, 600);
					} else {
						lastClickAtRef.current = now;
						// 已读：清掉未读
						eventState.markRead();
						// 睡着状态：第一次点击唤醒，不打开输入气泡
						if (eventState.petState === "sleepy") {
							eventState.wakeUp();
							uiDispatch({ type: "SET_MOTION", motion: "greet" });
							setTimeout(
								() => uiDispatch({ type: "SET_MOTION", motion: "idle" }),
								900,
							);
						} else {
							// 立即 toggle 输入气泡，感知延迟消失
							uiDispatch({ type: "TOGGLE_INPUT_BUBBLE" });
						}
						// 连点反馈（害羞 & 庆祝彩蛋）
						registerTap();
						registerCelebrate();
					}
				}
			});
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, eventState]);

	// ── 快捷回复 ──

	const handleSendQuickReply = useCallback(() => {
		const text = inputText.trim();
		if (!text) return;
		void invoke("pet_window_send_chat", { text });
		setInputText("");
		uiDispatch({ type: "HIDE_BUBBLE" });
		uiDispatch({ type: "SET_MOTION", motion: "done" });
		setTimeout(() => {
			uiDispatch({ type: "SET_MOTION", motion: "idle" });
		}, 900);
	}, [inputText]);

	const handleFocusMain = useCallback(() => {
		void invoke("pet_window_focus_main");
		uiDispatch({ type: "HIDE_BUBBLE" });
		uiDispatch({ type: "SET_MOTION", motion: "idle" });
		eventState.markRead();
	}, [eventState]);

	// 关闭气泡走 sink 退场动画：先把 bubbleSinking 置 true，180ms 后真正 dispatch HIDE_BUBBLE
	const handleCloseBubble = useCallback(() => {
		setBubbleSinking(true);
		setTimeout(() => {
			uiDispatch({ type: "HIDE_BUBBLE" });
			if (uiState.motion !== "idle") {
				uiDispatch({ type: "SET_MOTION", motion: "idle" });
			}
			// 关掉通知 / 提醒气泡时同步清状态
			if (eventState.notification) eventState.dismissNotification();
			if (eventState.reminder) eventState.dismissReminder();
			setBubbleSinking(false);
		}, 180);
	}, [uiState.motion, eventState]);

	// 气泡 hover：冻结/恢复自动消失
	const handleBubblePointerEnter = useCallback(() => {
		bubbleHoveredRef.current = true;
		if (notificationTimerRef.current) {
			clearTimeout(notificationTimerRef.current);
			notificationTimerRef.current = null;
		}
	}, []);

	const handleBubblePointerLeave = useCallback(() => {
		bubbleHoveredRef.current = false;
		// 离开后给 1.5s 缓冲再走（让用户有反悔余地）
		if (uiState.bubble === "notification" && eventState.notification) {
			notificationTimerRef.current = setTimeout(() => {
				setBubbleSinking(true);
				setTimeout(() => {
					uiDispatch({ type: "HIDE_BUBBLE" });
					uiDispatch({ type: "SET_MOTION", motion: "idle" });
					setBubbleSinking(false);
					eventState.consumeNextNotification?.();
				}, 180);
			}, 1500);
		}
	}, [uiState.bubble, eventState.notification, eventState]);

	// ── 全局键盘：Esc 永远关闭气泡 / 菜单 ──
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			if (contextMenuOpen) {
				setContextMenuOpen(false);
				return;
			}
			if (uiState.bubble !== "none") {
				handleCloseBubble();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [uiState.bubble, contextMenuOpen, handleCloseBubble]);

	// ── 点击窗口透明区域 → 关闭气泡 / 菜单 ──
	const handleRootMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (e.target !== e.currentTarget) return;
			if (contextMenuOpen) {
				setContextMenuOpen(false);
				return;
			}
			if (uiState.bubble !== "none") {
				handleCloseBubble();
			}
		},
		[uiState.bubble, contextMenuOpen, handleCloseBubble],
	);

	// ── 上下文菜单：换肤 ──
	// 在所有可选 IP（内置 + 自定义）之间循环
	const handleCycleSkin = useCallback(() => {
		const all = mascotManager.getAllMascotIds();
		if (all.length === 0) return;
		const current = mascotManager.getId();
		if (current === "off") {
			mascotManager.setId(all[0]);
			return;
		}
		const idx = all.indexOf(current);
		const next = all[(idx + 1) % all.length];
		mascotManager.setId(next);
		setContextMenuOpen(false);
		uiDispatch({ type: "SET_MOTION", motion: "greet" });
		setTimeout(() => {
			uiDispatch({ type: "SET_MOTION", motion: "idle" });
		}, 900);
	}, []);

	const handleHidePet = useCallback(() => {
		setContextMenuOpen(false);
		void invoke("pet_window_set_enabled", { enabled: false });
	}, []);

	const handleOpenSettings = useCallback(() => {
		setContextMenuOpen(false);
		void invoke("pet_window_focus_main");
	}, []);

	const handleShowHistory = useCallback(() => {
		setContextMenuOpen(false);
		uiDispatch({ type: "SHOW_BUBBLE", bubble: "history" });
	}, []);

	// ── 渲染 ──

	// ⚠️ React Hooks 规则：所有 Hook 必须在任何条件 return 之前调用。
	// 之前 useBubblePlacement 被放在 `if (!mascotReady) return null` 之后，
	// 导致 mascotReady 由 false → true 时 Hook 调用顺序错乱，组件直接报错变成空白窗口。
	const { placement, offsetX: bubbleOffsetX } = useBubblePlacement(
		uiState.bubble !== "none",
	);

	// 精确命中检测：透明区域自动穿透，鼠标悬停在宠物/气泡上时才捕获事件
	usePetHitTest(throughClicks);

	// 还在等待 IPC 初始化（自定义桌宠列表未拉取）时，保持透明等待，不要提前 return null
	if (!mascotReady) return null;

	if (mascotId === "off" || (!atlasUrl && !fallbackHeroUrl)) return null;

	// 是否显示未读小红点（不重复 notification 气泡的可见性）
	const showUnreadDot =
		eventState.unreadCount > 0 &&
		uiState.bubble !== "notification" &&
		uiState.bubble !== "reminder";

	// 当前活动 IP（上面已 narrow 掉 "off"）
	const personalityId: MascotId = mascotId;
	// 任务已运行毫秒（用于 task bubble 选短/中/长 opener）
	const taskElapsedMs = eventState.currentTask
		? Date.now() - eventState.currentTask.startedAt
		: 0;

	const bubbleNode = uiState.bubble !== "none" && (
		<div
			className={`flex justify-center w-full ${placement === "top" ? "mb-[10px]" : "mt-[10px]"}`}
			style={{
				order: placement === "top" ? 0 : 2,
				transform:
					bubbleOffsetX !== 0 ? `translateX(${bubbleOffsetX}px)` : undefined,
			}}
		>
			{uiState.bubble === "task" && eventState.currentTask && (
				<PetTaskBubble
					title={eventState.currentTask.title}
					accentColor={accentColor}
					noInteract={isDragging}
					onPointerEnter={handleBubblePointerEnter}
					onPointerLeave={handleBubblePointerLeave}
					placement={placement}
					sinking={bubbleSinking}
					elapsedMs={taskElapsedMs}
					mascotId={personalityId}
				/>
			)}

			{uiState.bubble === "progress" && eventState.currentTask && (
				<PetProgressBubble
					title={eventState.currentTask.title}
					stepLabel={eventState.progress?.stepLabel}
					current={eventState.progress?.current}
					accentColor={accentColor}
					noInteract={isDragging}
					onPointerEnter={handleBubblePointerEnter}
					onPointerLeave={handleBubblePointerLeave}
					placement={placement}
					sinking={bubbleSinking}
				/>
			)}

			{uiState.bubble === "notification" && eventState.notification && (
				<PetNotificationBubble
					type={eventState.notification.type}
					message={eventState.notification.message}
					prefix={eventState.notification.prefix}
					onAction={handleFocusMain}
					onDismiss={handleCloseBubble}
					accentColor={accentColor}
					noInteract={isDragging}
					onPointerEnter={handleBubblePointerEnter}
					onPointerLeave={handleBubblePointerLeave}
					placement={placement}
					sinking={bubbleSinking}
					mascotId={personalityId}
				/>
			)}

			{uiState.bubble === "reminder" && eventState.reminder && (
				<PetReminderBubble
					kind={eventState.reminder.kind}
					title={eventState.reminder.title}
					detail={eventState.reminder.detail}
					onPrimary={handleFocusMain}
					onSnooze={() => {
						eventState.dismissReminder();
						uiDispatch({ type: "HIDE_BUBBLE" });
					}}
					onDismiss={handleCloseBubble}
					accentColor={accentColor}
					noInteract={isDragging}
					onPointerEnter={handleBubblePointerEnter}
					onPointerLeave={handleBubblePointerLeave}
					placement={placement}
					sinking={bubbleSinking}
				/>
			)}

			{uiState.bubble === "input" && (
				<PetInputBubble
					ref={inputRef}
					value={inputText}
					onChange={setInputText}
					onSubmit={handleSendQuickReply}
					onClose={handleCloseBubble}
					onOpenMain={handleFocusMain}
					accentColor={accentColor}
					noInteract={isDragging}
					onPointerEnter={handleBubblePointerEnter}
					onPointerLeave={handleBubblePointerLeave}
					placement={placement}
					sinking={bubbleSinking}
					mascotId={personalityId}
				/>
			)}

			{uiState.bubble === "history" && (
				<PetHistoryBubble
					items={eventState.notificationHistory}
					onClose={handleCloseBubble}
					onClear={eventState.clearHistory}
					accentColor={accentColor}
					noInteract={isDragging}
					onPointerEnter={handleBubblePointerEnter}
					onPointerLeave={handleBubblePointerLeave}
					placement={placement}
					sinking={bubbleSinking}
				/>
			)}
		</div>
	);

	return (
		<div
			data-pet-passthrough="true"
			className="relative w-full h-full flex flex-col items-center justify-end select-none"
			style={{
				background: "transparent",
				padding: "8px 8px 4px",
			}}
			onMouseDown={handleRootMouseDown}
		>
			{bubbleNode}

			{/* 角色 + 红点 + 上下文菜单的容器 */}
			<div className="relative" style={{ order: 1 }}>
				{/* 接地阴影：最底层 z-0，视觉上沉在角色脚下 */}
				<PetGroundShadow
					size={SIZE_PRESET_TO_PX[sizePreset] ?? 180}
					isDragging={isDragging}
					isPeeking={edgePeek.peeking}
					animRef={shadowRef}
				/>

				{/* 未读红点：呼吸式跳动；位置随 sizePreset 缩放 */}
				{showUnreadDot && (
					<div
						className="absolute z-10 rounded-full pointer-events-none animate-pet-unread-pulse"
						style={{
							top: `${Math.max(4, (SIZE_PRESET_TO_PX[sizePreset] ?? 180) * 0.045)}px`,
							right: `${Math.max(10, (SIZE_PRESET_TO_PX[sizePreset] ?? 180) * 0.112)}px`,
							width: "10px",
							height: "10px",
							backgroundColor: "#E0533C",
							boxShadow: `0 0 0 2px var(--t-bg-surface, #ffffff), 0 4px 8px ${withAlpha("#E0533C", 0.5)}`,
						}}
					/>
				)}

				{/* 连续动效层：视线追随（x/y）与拖动倾斜（rotation）由 GSAP 直写，
				    与下面 React 计算的离散 transform 分层，互不覆盖 */}
				<div
					ref={motionLayerRef}
					className="will-change-transform"
					style={{ transformOrigin: "50% 90%" }}
				>
					{/* 挤压/拉伸层：落地压扁、连点摇晃、idle 呼吸（GSAP 独占）。
					    原点定在脚下，压扁时头往下沉而不是整体缩，才像"踩到地面"。 */}
					<div
						ref={squashRef}
						className="will-change-transform"
						style={{ transformOrigin: "50% 100%" }}
					>
						{/* 角色本体 */}
						<div
							className="cursor-grab active:cursor-grabbing pet-peek-transition"
							style={{
								transform: (() => {
									const parts: string[] = [];
									// 拖动时放大；松开时优先级让位给 hover/input/motion。
									// 倾斜角不在这里——它在上层 motionLayer 由 GSAP 驱动。
									if (isDragging) {
										parts.push("scale(1.08)");
									} else if (uiState.bubble === "input") {
										parts.push("scale(0.98) rotate(-3deg)");
									} else if (uiState.motion === "greet") {
										parts.push("scale(1.05)");
									} else {
										parts.push("scale(1)");
									}
									// 贴墙半隐藏：整体偏出屏幕外（露 60%）
									if (edgePeek.peeking && edgePeek.side) {
										if (edgePeek.side === "left" || edgePeek.side === "right") {
											const dx =
												edgePeek.side === "left"
													? -PEEK_OFFSET_PX
													: PEEK_OFFSET_PX;
											parts.push(`translateX(${dx}px)`);
										} else {
											const dy =
												edgePeek.side === "top"
													? -PEEK_OFFSET_PX
													: PEEK_OFFSET_PX;
											parts.push(`translateY(${dy}px)`);
										}
									}
									return parts.join(" ");
								})(),
								transformOrigin: "50% 90%",
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
							{atlasUrl ? (
								<MascotSpriteFader
									atlasUrl={atlasUrl}
									motion={uiState.motion}
									size={SIZE_PRESET_TO_PX[sizePreset] ?? 180}
									paused={false}
								/>
							) : (
								<img
									src={fallbackHeroUrl ?? ""}
									alt=""
									aria-hidden="true"
									draggable={false}
									className="block object-contain"
									style={{
										width: `${SIZE_PRESET_TO_PX[sizePreset] ?? 180}px`,
										height: `${(SIZE_PRESET_TO_PX[sizePreset] ?? 180) * (208 / 192)}px`,
									}}
								/>
							)}
						</div>
					</div>
				</div>

				{/* 上下文菜单（长按 / 右键触发） */}
				{contextMenuOpen && (
					<PetContextMenu
						accentColor={accentColor}
						currentMascotId={mascotId}
						onCycleSkin={handleCycleSkin}
						onHide={handleHidePet}
						onOpenSettings={handleOpenSettings}
						onShowHistory={handleShowHistory}
						onClose={() => setContextMenuOpen(false)}
						/** 角色贴屏右侧时菜单向左展开，贴左侧 / 屏幕中段时向右展开 */
						side={edgePeek.side === "right" ? "left" : "right"}
					/>
				)}
			</div>
		</div>
	);
}

// ── 上下文菜单（迷你版） ──

interface PetContextMenuProps {
	accentColor: string;
	currentMascotId: MascotSelection;
	onCycleSkin: () => void;
	onHide: () => void;
	onOpenSettings: () => void;
	onShowHistory: () => void;
	onClose: () => void;
	/** 菜单相对角色的展开方向：右（默认）或左 */
	side?: "left" | "right";
}

function PetContextMenu({
	accentColor,
	currentMascotId,
	onCycleSkin,
	onHide,
	onOpenSettings,
	onShowHistory,
	side = "right",
}: PetContextMenuProps) {
	const nextMascotLabel = useMemo(() => {
		const all = mascotManager.getAllMascotIds();
		if (all.length === 0) return "效率引擎";
		if (currentMascotId === "off") {
			return mascotManager.getMergedMeta(all[0])?.label ?? "下一个";
		}
		const idx = all.indexOf(currentMascotId);
		const next = all[(idx + 1) % all.length];
		return mascotManager.getMergedMeta(next)?.label ?? "下一个";
	}, [currentMascotId]);

	// 菜单入场：动画挂在**内层**，外层那个 translate(±108%) 是定位用的，
	// 一旦被动画覆盖菜单会先飞到角色身上再瞬移回来。
	const menuRef = useRef<HTMLDivElement>(null);
	useGsapMotion(({ gsap, dur, amp, expressive }) => {
		const element = menuRef.current;
		if (!element) return;
		const tl = gsap.timeline();
		tl.from(element, {
			opacity: 0,
			scale: 0.9,
			y: amp(8),
			duration: dur(0.3),
			ease: EASE.spring,
			transformOrigin: side === "left" ? "100% 0%" : "0% 0%",
			clearProps: "transform,opacity",
		});
		if (expressive) {
			const items = element.querySelectorAll("button");
			if (items.length > 0) {
				tl.from(
					items,
					{
						opacity: 0,
						x: amp(side === "left" ? 6 : -6),
						duration: dur(0.26),
						ease: EASE.outExpo,
						stagger: 0.028,
						clearProps: "transform,opacity",
					},
					dur(0.06),
				);
			}
		}
	}, {});

	return (
		<div
			className="absolute z-20"
			style={{
				...(side === "left"
					? { left: "0", top: "0", transform: "translate(-108%, 8px)" }
					: { right: "0", top: "0", transform: "translate(108%, 8px)" }),
				minWidth: "168px",
			}}
			onMouseDown={(e) => e.stopPropagation()}
		>
			<div
				ref={menuRef}
				className="pet-surface-darkish rounded-2xl py-1.5"
				style={{
					backgroundColor: "var(--t-bg-surface, #ffffff)",
					backdropFilter: "blur(8px)",
					WebkitBackdropFilter: "blur(8px)",
					boxShadow: `
						0 0 0 1px ${withAlpha(accentColor, 0.1)},
						0 8px 24px -10px rgba(26, 26, 25, 0.2),
						0 24px 48px -24px ${withAlpha(accentColor, 0.22)}
					`,
				}}
			>
				<MenuButton onClick={onCycleSkin} accentColor={accentColor}>
					<span>切换皮肤</span>
					<span className="ml-auto text-[11px] text-[color:var(--t-text-light,#9d9d98)]">
						下一个：{nextMascotLabel}
					</span>
				</MenuButton>
				<MenuButton onClick={onOpenSettings} accentColor={accentColor}>
					打开主窗口
				</MenuButton>
				<MenuButton onClick={onShowHistory} accentColor={accentColor}>
					最近通知
				</MenuButton>
				<div
					className="my-1 mx-3 h-[1px]"
					style={{
						backgroundColor: "var(--t-border-subtle, rgba(0,0,0,0.06))",
					}}
				/>
				<MenuButton onClick={onHide} accentColor={accentColor} danger>
					隐藏宠物
				</MenuButton>
			</div>
		</div>
	);
}

interface MenuButtonProps {
	onClick: () => void;
	accentColor: string;
	danger?: boolean;
	children: React.ReactNode;
}

function MenuButton({
	onClick,
	accentColor,
	danger,
	children,
}: MenuButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors"
			style={{
				color: danger ? "#D9694B" : "var(--t-text-primary, #1a1a19)",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.backgroundColor = withAlpha(
					danger ? "#D9694B" : accentColor,
					0.08,
				);
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.backgroundColor = "transparent";
			}}
		>
			{children}
		</button>
	);
}
