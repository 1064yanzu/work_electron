/**
 * useTapBurst — 连点识别
 *
 * 2 秒时间窗内连点 ≥ threshold（默认 3）次触发一次回调。
 * 用于"戳 3 次宠物会害羞" 的趣味反馈。
 */

import { useCallback, useRef } from "react";

export interface UseTapBurstOptions {
	threshold?: number;
	windowMs?: number;
}

export function useTapBurst(
	onBurst: () => void,
	options: UseTapBurstOptions = {},
) {
	const threshold = options.threshold ?? 3;
	const windowMs = options.windowMs ?? 2000;
	const tapsRef = useRef<number[]>([]);

	const register = useCallback(() => {
		const now = Date.now();
		const taps = tapsRef.current;
		taps.push(now);
		// 丢弃时间窗外的
		while (taps.length > 0 && now - taps[0] > windowMs) {
			taps.shift();
		}
		if (taps.length >= threshold) {
			tapsRef.current = [];
			onBurst();
		}
	}, [onBurst, threshold, windowMs]);

	return register;
}
