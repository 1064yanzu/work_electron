// 通用 Store 工厂函数 - 避免重复的 subscribe/getState/emit/selector 样板代码

import { useCallback, useRef, useSyncExternalStore } from "react";

export interface ReadableStoreApi<T> {
	getState: () => T;
	subscribe: (listener: () => void) => () => void;
}

export interface StoreApi<T> extends ReadableStoreApi<T> {
	setState: (updater: (state: T) => T) => void;
}

export interface CreateStoreOptions {
	/**
	 * emit 节流窗口（毫秒）。默认 0 = 不节流，每次 setState 同步通知。
	 *
	 * 流式场景（Agent 输出、终端输出）下 setState 频率可达每秒数百次，
	 * 直接同步 emit 会让 React 以同样频率重渲染。设置该值后：
	 * 距上次 emit 已超过窗口 → 立即 emit（前沿）；
	 * 否则安排一次尾沿 emit，窗口内的多次变更合并成一次通知。
	 *
	 * 注意：节流只影响**通知时机**，`getState()` 始终返回最新状态，
	 * 因此不会读到过期数据。
	 */
	emitThrottleMs?: number;
}

/**
 * 创建一个轻量级的外部状态存储，
 * 与 React 的 useSyncExternalStore 完全兼容。
 */
export function createStore<T>(
	initialState: T,
	options: CreateStoreOptions = {},
): StoreApi<T> {
	const throttleMs = Math.max(0, options.emitThrottleMs ?? 0);
	let state = initialState;
	const listeners = new Set<() => void>();

	let emitScheduled = false;
	let lastEmitTime = 0;

	function emit() {
		for (const listener of listeners) {
			listener();
		}
	}

	function scheduleEmit() {
		if (throttleMs === 0) {
			emit();
			return;
		}

		const now = Date.now();
		if (now - lastEmitTime >= throttleMs) {
			lastEmitTime = now;
			emit();
			return;
		}

		if (emitScheduled) return;
		emitScheduled = true;
		setTimeout(
			() => {
				emitScheduled = false;
				lastEmitTime = Date.now();
				emit();
			},
			throttleMs - (now - lastEmitTime),
		);
	}

	return {
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setState: (updater: (prev: T) => T) => {
			const nextState = updater(state);
			if (Object.is(nextState, state)) {
				return;
			}
			state = nextState;
			scheduleEmit();
		},
	};
}

/**
 * 创建绑定到 Store 的 React Hook。
 * 返回完整的 state 对象。
 */
export function createUseStore<T>(store: ReadableStoreApi<T>) {
	return function useStore(): T {
		return useSyncExternalStore(
			store.subscribe,
			store.getState,
			store.getState,
		);
	};
}

/** 「尚未计算过」的哨兵。用 null/undefined 当哨兵会让返回 null 的 selector 永远命不中缓存。 */
const EMPTY = Symbol("empty");

/**
 * 创建绑定到 Store 的 React Selector Hook。
 * 允许组件只订阅需要的状态字段，减少不必要的重渲染。
 *
 * 两层保护缺一不可：
 * 1. state 引用没变 → 直接复用上次结果，跳过 selector 执行；
 * 2. state 变了但 selector 结果 Object.is 相同 → 返回**上次的引用**，
 *    让 useSyncExternalStore 判定为「无变化」从而跳过重渲染。
 *
 * 少了第 2 层，任何返回新对象/新数组的 selector 都会在每次 emit 时触发重渲染，
 * 极端情况下（selector 每次都造新对象）会直接变成无限渲染循环。
 */
export function createUseStoreSelector<T>(store: ReadableStoreApi<T>) {
	return function useStoreSelector<R>(selector: (state: T) => R): R {
		const selectorRef = useRef(selector);
		const lastStateRef = useRef<T | typeof EMPTY>(EMPTY);
		const lastSelectedRef = useRef<R | typeof EMPTY>(EMPTY);
		selectorRef.current = selector;

		const getSnapshot = useCallback(() => {
			const nextState = store.getState();
			// 同一份 state 引用：直接复用上次的 selected 结果
			if (
				lastSelectedRef.current !== EMPTY &&
				lastStateRef.current === nextState
			) {
				return lastSelectedRef.current;
			}

			const nextSelected = selectorRef.current(nextState);
			lastStateRef.current = nextState;

			// state 引用变了但 selector 结果相同（Object.is）：保持上次的引用，
			// 让 useSyncExternalStore 跳过不必要的更新
			if (
				lastSelectedRef.current !== EMPTY &&
				Object.is(lastSelectedRef.current, nextSelected)
			) {
				return lastSelectedRef.current;
			}

			lastSelectedRef.current = nextSelected;
			return nextSelected;
		}, []);

		return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
	};
}
