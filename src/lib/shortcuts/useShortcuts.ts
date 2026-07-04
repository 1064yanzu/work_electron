// 快捷键注册中心 — React 侧安装与注册 Hook

import { useEffect } from "react";
import { shortcutRegistry } from "./registry";
import type { ShortcutDefinition } from "./types";

/**
 * 安装全局唯一的 keydown 分发器（App 挂载时调用一次）。
 * 替代散落各处的 window.addEventListener("keydown") 手写监听。
 */
export function installGlobalShortcutListener(): () => void {
	const onKeyDown = (e: KeyboardEvent) => {
		shortcutRegistry.dispatch(e);
	};
	window.addEventListener("keydown", onKeyDown);
	return () => window.removeEventListener("keydown", onKeyDown);
}

/**
 * 组件级快捷键注册：挂载时注册、卸载时反注册。
 * factory 在每次 deps 变化时重建定义（handler 闭包取到最新值）。
 */
export function useRegisterShortcuts(
	factory: () => ShortcutDefinition[],
	deps: readonly unknown[],
): void {
	// biome-ignore lint/correctness/useExhaustiveDependencies: deps 由调用方显式声明
	useEffect(() => shortcutRegistry.register(factory()), deps);
}
