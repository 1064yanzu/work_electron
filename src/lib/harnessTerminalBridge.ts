/**
 * Harness Terminal Bridge
 *
 * 常驻订阅主进程推送的 Harness Hub 迁移 pty 事件：
 *   - harness-terminal-attached → terminalStore.attachHarness（按 auto_show 唤起面板）
 *   - terminal-exit（harness- 前缀）→ terminalStore.detachHarness
 *
 * 与 remoteTerminalBridge 同理，必须挂在 App 顶层而不是 TerminalPanel 里：
 * TerminalPanel 受 `terminalStore.isVisible` 条件渲染、初始为 false，而
 * isVisible 恰恰由 attached 事件翻 true——监听放面板内会形成死锁，
 * 首次 attach 永远收不到。
 */

import { useEffect } from "react";
import {
	type HarnessTerminalAttachedPayload,
	terminalStore,
} from "./stores/terminalStore";

/** 与主进程 ptyLauncher 的 HARNESS_PTY_PREFIX 保持一致。 */
const HARNESS_PTY_PREFIX = "harness-pty-";

export function useHarnessTerminalBridge(): void {
	useEffect(() => {
		const unsubAttached =
			window.electronAPI?.on<HarnessTerminalAttachedPayload>(
				"harness-terminal-attached",
				(payload) => {
					terminalStore.attachHarness(payload);
				},
			);

		// CLI 进程自己退出时，把 tab 一并摘掉（pty 已经没了，留着是死 tab）
		const unsubExit = window.electronAPI?.on<{ id: string }>(
			"terminal-exit",
			(payload) => {
				if (payload?.id?.startsWith(HARNESS_PTY_PREFIX)) {
					terminalStore.detachHarness(payload.id);
				}
			},
		);

		return () => {
			unsubAttached?.();
			unsubExit?.();
		};
	}, []);
}
