import { useEffect, useRef, useState } from "react";

/**
 * 节流一个高频变化的值：在 `enabled` 为 true 时，最多每 `intervalMs` 更新一次返回值；
 * `enabled` 为 false 时立即透传最新值（不节流）。
 *
 * 典型用途：Agent 流式输出期间（毫秒级高频更新）用于渲染的值只需要以较低帧率刷新，
 * 减少下游重渲染/重排布局的次数。
 */
export function useThrottledValue<T>(
	value: T,
	intervalMs: number,
	enabled: boolean,
): T {
	const [throttledValue, setThrottledValue] = useState(value);
	const lastUpdateRef = useRef(0);
	const pendingRef = useRef<T>(value);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!enabled) {
			pendingRef.current = value;
			lastUpdateRef.current = 0;
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
			setThrottledValue(value);
			return;
		}

		pendingRef.current = value;
		const now = Date.now();
		const elapsed = now - lastUpdateRef.current;
		if (elapsed >= intervalMs) {
			lastUpdateRef.current = now;
			setThrottledValue(value);
			return;
		}

		if (timeoutRef.current !== null) return;

		timeoutRef.current = setTimeout(() => {
			timeoutRef.current = null;
			lastUpdateRef.current = Date.now();
			setThrottledValue(pendingRef.current);
		}, intervalMs - elapsed);
	}, [value, intervalMs, enabled]);

	useEffect(() => {
		return () => {
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
		};
	}, []);

	return throttledValue;
}
