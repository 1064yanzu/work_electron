/**
 * Remote Terminal Bridge
 *
 * 常驻订阅主进程推送的远控 pty 事件：
 *   - remote-terminal-attached → terminalStore.attachRemote（按 auto_show 自动唤起面板）
 *   - remote-terminal-detached → terminalStore.detachRemote
 *
 * 必须挂在 App 顶层而不是 TerminalPanel 里：TerminalPanel 受
 * `terminalStore.isVisible` 条件渲染，初始为 false，事件由 attached 触发
 * 翻 true，存在「先有鸡还是先有蛋」的死锁——若监听放在 TerminalPanel 中，
 * 首次 attached 永远接不到，面板也就永远唤不起来。
 */

import { useEffect } from "react";
import {
	type RemoteTerminalAttachedPayload,
	type RemoteTerminalDetachedPayload,
	terminalStore,
} from "./stores/terminalStore";

export function useRemoteTerminalBridge(): void {
	useEffect(() => {
		const unsubAttached = window.electronAPI?.on<RemoteTerminalAttachedPayload>(
			"remote-terminal-attached",
			(payload) => {
				terminalStore.attachRemote(payload);
			},
		);

		const unsubDetached = window.electronAPI?.on<RemoteTerminalDetachedPayload>(
			"remote-terminal-detached",
			(payload) => {
				terminalStore.detachRemote(payload.id);
			},
		);

		return () => {
			unsubAttached?.();
			unsubDetached?.();
		};
	}, []);
}
