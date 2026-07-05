// useIpcListen - 通用 IPC 事件监听 Hook
//
// 背景：项目里多处用 `listen(...).then(fn => { unlistenRef = fn })` 的写法异步注册监听器，
// 如果组件在 `.then()` 回调触发前就已经 unmount，会产生「孤儿监听器」（没有被正确清理，
// 可能重复触发副作用或造成内存泄漏）。
//
// 本 Hook 统一用 `cancelled` 标志位模式处理这种竞态（参考 src/components/wiki/useWiki.ts
// 中 `wiki_generation_progress` 监听的写法）：
//   - 若订阅尚未完成组件已卸载，标记 cancelled，待 Promise resolve 后立刻调用 unlisten 并丢弃。
//   - 若订阅已完成组件仍存活，正常保留 unlisten 供卸载时调用。

import { useEffect, useRef } from "react";
import { listen } from "../lib/tauriEventCompat";

/**
 * 订阅一个 IPC 事件（基于 `window.electronAPI.on` 桥接），并在卸载时安全清理。
 *
 * @param channel IPC 事件通道名
 * @param handler 收到事件负载时的回调（内部用 ref 保存最新引用，回调本身变化不会触发重新订阅）
 * @param deps 显式声明的重新订阅依赖（例如 channel 依赖的外部状态），默认不重新订阅
 *
 * @example
 * useIpcListen<{ type: string; action: string }>("app-menu-action", (payload) => {
 *   // 处理事件
 * });
 */
export function useIpcListen<T>(
	channel: string,
	handler: (payload: T) => void,
	deps: unknown[] = [],
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		let cancelled = false;
		let unlisten: (() => void) | undefined;

		listen<T>(channel, (event) => {
			if (cancelled) return;
			handlerRef.current(event.payload);
		})
			.then((fn) => {
				if (cancelled) {
					// 组件已卸载才拿到 unlisten，立刻释放，避免孤儿监听器
					fn();
					return;
				}
				unlisten = fn;
			})
			// electronAPI 不可用（如纯浏览器环境）时 listen 会 reject，
			// 与 useWiki 的参照实现保持一致：静默吞掉，避免 unhandled rejection
			.catch(() => {});

		return () => {
			cancelled = true;
			unlisten?.();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [channel, ...deps]);
}
