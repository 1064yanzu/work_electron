// 通用 Store 工厂函数 - 避免重复的 subscribe/getState/emit/selector 样板代码

import { useCallback, useRef, useSyncExternalStore } from "react";

export interface ReadableStoreApi<T> {
	getState: () => T;
	subscribe: (listener: () => void) => () => void;
}

export interface StoreApi<T> extends ReadableStoreApi<T> {
	setState: (updater: (state: T) => T) => void;
}

/**
 * 创建一个轻量级的外部状态存储，
 * 与 React 的 useSyncExternalStore 完全兼容。
 */
export function createStore<T>(initialState: T): StoreApi<T> {
	let state = initialState;
	const listeners = new Set<() => void>();

	function emit() {
		for (const listener of listeners) {
			listener();
		}
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
			state = updater(state);
			emit();
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

/**
 * 创建绑定到 Store 的 React Selector Hook。
 * 允许组件只订阅需要的状态字段，减少不必要的重渲染。
 */
export function createUseStoreSelector<T>(store: ReadableStoreApi<T>) {
	return function useStoreSelector<R>(selector: (state: T) => R): R {
		const selectorRef = useRef(selector);
		selectorRef.current = selector;

		const getSnapshot = useCallback(
			() => selectorRef.current(store.getState()),
			[],
		);

		return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
	};
}
