/**
 * useBubblePlacement — 决定气泡放在角色上方还是下方
 *
 * 当宠物窗口贴近屏幕顶部时，向上弹出气泡会被裁切；这时改成向下弹出。
 * 通过 pet_window_get_position 取宠物窗口当前位置 + 所在显示器工作区，
 * 判断"距屏幕顶部 < 200px → bottom"。
 *
 * 触发时机：bubble 显示时（bubble !== "none"）取一次；不监听 resize，
 * 避免高频抖动（用户拖动后会先 snap，气泡也会重新 mount 再次 query）。
 */

import { useEffect, useState } from "react";
import { invoke } from "../lib/tauriCompat";

export type BubblePlacement = "top" | "bottom";

const TOP_BUFFER_PX = 200;

export function useBubblePlacement(active: boolean): BubblePlacement {
	const [placement, setPlacement] = useState<BubblePlacement>("top");

	useEffect(() => {
		if (!active) return;
		let cancelled = false;
		void (async () => {
			try {
				const pos = await invoke<{
					y: number;
					displayY: number;
				}>("pet_window_get_position");
				if (cancelled) return;
				const distFromTop = pos.y - pos.displayY;
				setPlacement(distFromTop < TOP_BUFFER_PX ? "bottom" : "top");
			} catch {
				// 主进程不可用 → 默认 top
				if (!cancelled) setPlacement("top");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [active]);

	return placement;
}
