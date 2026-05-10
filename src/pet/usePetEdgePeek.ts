/**
 * usePetEdgePeek — 贴墙后"半隐藏/hover 完整露出"
 *
 * 触发时机：
 * - 落地反弹事件（pet-landed）后，若宠物离屏幕左右边缘 ≤ 8px，判定为"贴墙"
 * - 贴墙后 800ms 内若无 hover → 切换到"peek" 状态，角色 translateX 向屏幕外偏出一截（露 60%）
 * - hover 角色 / 进入拖动 / 离开贴墙位置 → 回到完整显示
 *
 * 返回：
 * - side: 当前贴墙方向（"left" | "right" | null）
 * - peeking: 是否当前处于半隐藏状态（CSS transform 让角色向外偏出）
 * - onHoverStart / onHoverEnd：hover 回调，由 PetApp 挂到角色容器
 *
 * 设计取舍：
 * - 不订阅 pet_window_get_position 高频轮询，避免抖动；只在 `pet-landed`、hover 这类离散事件下更新
 * - prefers-reduced-motion 由使用方决定是否把 CSS 过渡关掉
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../lib/tauriCompat";
import { listen, type UnlistenFn } from "../lib/tauriEventCompat";

export type PetEdgeSide = "left" | "right" | null;

export interface PetEdgePeekApi {
	side: PetEdgeSide;
	peeking: boolean;
	onHoverStart: () => void;
	onHoverEnd: () => void;
	/** 拖动开始时强制取消 peek，结束后由 pet-landed 事件重新判定 */
	onDragStart: () => void;
}

/** 判定贴墙的阈值：窗口距工作区左右边缘 ≤ 这个值算贴墙 */
const STUCK_PX = 8;
/** 落地后多久进入 peek */
const PEEK_DELAY_MS = 800;
/** peek 的实际偏移（向屏幕外偏出多少），px */
export const PEEK_OFFSET_PX = 48;

export function usePetEdgePeek(enabled: boolean): PetEdgePeekApi {
	const [side, setSide] = useState<PetEdgeSide>(null);
	const [peeking, setPeeking] = useState(false);
	const hoverRef = useRef(false);
	const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearPeekTimer = () => {
		if (peekTimerRef.current) {
			clearTimeout(peekTimerRef.current);
			peekTimerRef.current = null;
		}
	};

	const evaluateStuck = useCallback(async () => {
		try {
			const pos = await invoke<{
				x: number;
				width: number;
				displayX: number;
				displayWidth: number;
			}>("pet_window_get_position");
			const distLeft = pos.x - pos.displayX;
			const distRight = pos.displayX + pos.displayWidth - (pos.x + pos.width);
			if (distLeft <= STUCK_PX && distLeft <= distRight) {
				setSide("left");
				return "left" as const;
			}
			if (distRight <= STUCK_PX) {
				setSide("right");
				return "right" as const;
			}
			setSide(null);
			return null;
		} catch {
			setSide(null);
			return null;
		}
	}, []);

	const schedulePeek = useCallback(() => {
		clearPeekTimer();
		peekTimerRef.current = setTimeout(() => {
			if (!hoverRef.current) setPeeking(true);
		}, PEEK_DELAY_MS);
	}, []);

	// 初始化时评估一次（冷启动时桌宠本来就贴墙的场景）
	useEffect(() => {
		if (!enabled) return;
		void (async () => {
			const result = await evaluateStuck();
			if (result) schedulePeek();
		})();
		return () => {
			clearPeekTimer();
		};
	}, [enabled, evaluateStuck, schedulePeek]);

	// 监听 pet-landed（落地反弹），重新评估是否贴墙
	useEffect(() => {
		if (!enabled) return;
		let unlisten: UnlistenFn | null = null;
		void (async () => {
			try {
				unlisten = await listen("pet-landed", () => {
					setPeeking(false);
					void (async () => {
						const result = await evaluateStuck();
						if (result) {
							schedulePeek();
						} else {
							clearPeekTimer();
						}
					})();
				});
			} catch {
				// noop
			}
		})();
		return () => {
			unlisten?.();
		};
	}, [enabled, evaluateStuck, schedulePeek]);

	const onHoverStart = useCallback(() => {
		hoverRef.current = true;
		clearPeekTimer();
		setPeeking(false);
	}, []);

	const onHoverEnd = useCallback(() => {
		hoverRef.current = false;
		if (side) schedulePeek();
	}, [side, schedulePeek]);

	const onDragStart = useCallback(() => {
		clearPeekTimer();
		setPeeking(false);
		setSide(null);
	}, []);

	return { side, peeking, onHoverStart, onHoverEnd, onDragStart };
}
