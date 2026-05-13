/**
 * 终端面板
 * 整合标签栏和终端实例，作为中间面板底部的可折叠区域
 */

import { useCallback, useEffect } from "react";
import { Terminal } from "lucide-react";
import {
	type RemoteTerminalAttachedPayload,
	type RemoteTerminalDetachedPayload,
	terminalStore,
	useTerminalStoreSelector,
} from "../../lib/stores/terminalStore";
import { TerminalInstance } from "./TerminalInstance";
import { TerminalTabBar } from "./TerminalTabBar";

export function TerminalPanel() {
	const terminals = useTerminalStoreSelector((s) => s.terminals);
	const activeId = useTerminalStoreSelector((s) => s.activeTerminalId);

	// 监听终端退出事件 -> 更新 store
	useEffect(() => {
		const unsubExit = window.electronAPI?.on<{
			id: string;
			exitCode: number;
			signal?: number;
		}>("terminal-exit", (payload) => {
			terminalStore.handleTerminalExit(payload.id);
		});

		// 远控 pty 接入桌面端
		const unsubRemoteAttached =
			window.electronAPI?.on<RemoteTerminalAttachedPayload>(
				"remote-terminal-attached",
				(payload) => {
					terminalStore.attachRemote(payload);
				},
			);

		// 远控 pty 在 IM 端关闭 / 强制终止
		const unsubRemoteDetached =
			window.electronAPI?.on<RemoteTerminalDetachedPayload>(
				"remote-terminal-detached",
				(payload) => {
					terminalStore.detachRemote(payload.id);
				},
			);

		return () => {
			unsubExit?.();
			unsubRemoteAttached?.();
			unsubRemoteDetached?.();
		};
	}, []);

	const handleTerminalExit = useCallback((id: string) => {
		terminalStore.handleTerminalExit(id);
	}, []);

	if (terminals.length === 0) {
		return (
			<div
				className="flex flex-col items-center justify-center h-full text-text-muted"
				style={{ backgroundColor: "var(--t-bg)" }}
			>
				<button
					type="button"
					onClick={() => terminalStore.createTerminal()}
					className="flex items-center gap-2 px-4 py-2.5 text-text-secondary hover:text-text-primary hover:bg-warm-200 rounded-lg transition-colors cursor-pointer"
				>
					<Terminal className="w-4 h-4" />
					<span className="text-sm">新建终端</span>
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<TerminalTabBar />
			<div className="flex-1 min-h-0">
				{terminals.map((t) => (
					<TerminalInstance
						key={t.id}
						terminalId={t.id}
						isActive={t.id === activeId}
						isRemote={t.isRemote}
						onExit={() => handleTerminalExit(t.id)}
					/>
				))}
			</div>
		</div>
	);
}

export default TerminalPanel;
