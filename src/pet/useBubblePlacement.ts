/**
 * useBubblePlacement — 决定气泡放在角色上方/下方，以及水平方向偏移量
 *
 * - 垂直：当宠物窗口贴近屏幕顶部时（< 200px），气泡改为向下弹出
 * - 水平：当宠物贴近屏幕左/右边缘时，计算 offsetX 把气泡往屏幕内侧平移，
 *   避免气泡超出工作区被裁切。
 *
 * 通过 pet_window_get_position IPC 取宠物窗口位置 + 所在显示器工作区几何。
 * 触发时机：bubble 显示时（bubble !== "none"）取一次；不监听持续 resize。
 */

import { useEffect, useState } from "react";
import { invoke } from "../lib/tauriCompat";

export type BubblePlacement = "top" | "bottom";

export interface BubblePlacementResult {
	placement: BubblePlacement;
	/** 气泡容器水平偏移（CSS px），正值向右，负值向左；0 表示居中不偏移 */
	offsetX: number;
}

const TOP_BUFFER_PX = 200;
/** 气泡最大宽度（包含 Shell padding），用于判断是否超出屏幕边缘 */
const BUBBLE_W = 280;
const EDGE_MARGIN = 8;

export function useBubblePlacement(active: boolean): BubblePlacementResult {
	const [result, setResult] = useState<BubblePlacementResult>({
		placement: "top",
		offsetX: 0,
	});

	useEffect(() => {
		if (!active) return;
		let cancelled = false;
		void (async () => {
			try {
				const pos = await invoke<{
					x: number;
					y: number;
					width: number;
					displayX: number;
					displayY: number;
					displayWidth: number;
				}>("pet_window_get_position");
				if (cancelled) return;

				// 垂直：距顶不足时翻为 bottom
				const placement: BubblePlacement =
					pos.y - pos.displayY < TOP_BUFFER_PX ? "bottom" : "top";

				// 水平：气泡以宠物中心为基准居中，计算是否超出工作区边缘
				const petCenterX = pos.x + pos.width / 2;
				const bubbleLeft = petCenterX - BUBBLE_W / 2;
				const bubbleRight = petCenterX + BUBBLE_W / 2;
				const dispLeft = pos.displayX + EDGE_MARGIN;
				const dispRight = pos.displayX + pos.displayWidth - EDGE_MARGIN;

				let offsetX = 0;
				if (bubbleLeft < dispLeft) {
					offsetX = dispLeft - bubbleLeft; // 偏右
				} else if (bubbleRight > dispRight) {
					offsetX = dispRight - bubbleRight; // 偏左（负值）
				}

				setResult({ placement, offsetX });
			} catch {
				// 主进程不可用 → 默认 top，不偏移
				if (!cancelled) setResult({ placement: "top", offsetX: 0 });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [active]);

	return result;
}
