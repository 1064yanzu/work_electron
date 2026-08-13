// createIpcSubscription — 模块级（非组件）IPC 订阅工具
//
// 组件里订阅 IPC 用 `src/hooks/useIpcListen.ts`；但 store / service 这类
// 模块级单例没有组件生命周期，之前各写各的 `listen(...).then(fn => ...)`，
// 反复出现同两个问题：
//
//  1. **孤儿监听器**：`listen()` 是异步的。如果在 Promise resolve 之前就调用了
//     清理逻辑，拿到的 unlisten 没人调用，监听器永久挂在 electronAPI 上。
//     热重载 / 反复切换会话时会叠出多份，同一个事件被处理 N 次。
//  2. **重复订阅**：模块级订阅往往在「首次使用时」惰性建立，缺少幂等保护时
//     并发调用会建立多条订阅。
//
// 这里把这两件事一次性收口：`start()` 幂等，`stop()` 无论订阅处于哪个阶段
// 都能正确释放。

import { listen } from "./tauriEventCompat";

export interface IpcSubscription {
	/** 幂等：已订阅时直接返回，不会重复注册。 */
	start: () => void;
	/** 释放订阅。订阅尚在 in-flight 时也能正确取消（resolve 后立即 unlisten）。 */
	stop: () => void;
	/** 当前是否处于订阅状态（含 in-flight）。 */
	isActive: () => boolean;
}

/**
 * 创建一个可反复 start/stop 的模块级 IPC 订阅。
 *
 * @example
 * const sub = createIpcSubscription<{ id: string }>("terminal-exit", (p) => {
 *   terminalStore.handleTerminalExit(p.id);
 * });
 * sub.start();
 */
export function createIpcSubscription<T>(
	channel: string,
	handler: (payload: T) => void,
): IpcSubscription {
	let active = false;
	let unlisten: (() => void) | null = null;
	// 每次 start 递增：resolve 回来的 unlisten 如果不属于当前这一轮订阅，
	// 说明中途 stop（或 stop 后又 start）过，直接丢弃
	let generation = 0;

	function start() {
		if (active) return;
		active = true;
		const myGeneration = ++generation;

		listen<T>(channel, (event) => {
			if (!active || myGeneration !== generation) return;
			handler(event.payload);
		})
			.then((fn) => {
				if (!active || myGeneration !== generation) {
					// 已经 stop 了才拿到 unlisten，立刻释放
					fn();
					return;
				}
				unlisten = fn;
			})
			// electronAPI 不可用（纯浏览器环境）时 listen 会 reject，
			// 与 useIpcListen 保持一致：静默吞掉，避免 unhandled rejection
			.catch(() => {
				if (myGeneration === generation) active = false;
			});
	}

	function stop() {
		if (!active) return;
		active = false;
		// 递增 generation：in-flight 的那次 listen resolve 后会走「立刻释放」分支
		generation++;
		unlisten?.();
		unlisten = null;
	}

	return { start, stop, isActive: () => active };
}
