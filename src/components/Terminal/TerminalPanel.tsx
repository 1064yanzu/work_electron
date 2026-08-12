/**
 * 终端面板
 * 整合标签栏和终端实例，作为中间面板底部的可折叠区域
 */

import { useCallback, useEffect, useMemo } from "react";
import { Terminal } from "lucide-react";
import {
	terminalStore,
	useTerminalStoreSelector,
} from "../../lib/stores/terminalStore";
import { TerminalInstance } from "./TerminalInstance";
import { TerminalTabBar } from "./TerminalTabBar";

export function TerminalPanel() {
	const allTerminals = useTerminalStoreSelector((s) => s.terminals);
	const activeId = useTerminalStoreSelector((s) => s.activeTerminalId);
	// 中栏 CLI 标签页托管的终端在那边渲染，这里不能重复挂一个 xterm——
	// 同一个 pty 挂两份会互相抢 terminal_resize
	const terminals = useMemo(
		() => allTerminals.filter((t) => !t.hostedInCenter),
		[allTerminals],
	);

	// 监听终端退出事件 -> 更新 store
	// （远控 pty 的 attached/detached 由 App 顶层 useRemoteTerminalBridge 处理，
	//  因为 TerminalPanel 是按 isVisible 条件渲染的，远控首次 attach 必须能在
	//  面板未挂载时就被接收并把 isVisible 翻 true。）
	useEffect(() => {
		const unsubExit = window.electronAPI?.on<{
			id: string;
			exitCode: number;
			signal?: number;
		}>("terminal-exit", (payload) => {
			terminalStore.handleTerminalExit(payload.id);
		});

		return () => {
			unsubExit?.();
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
						// 远控与 harness pty 的尺寸都由主进程锁定，桌面端不得 resize
						isRemote={t.isRemote || t.isHarness}
						onExit={() => handleTerminalExit(t.id)}
					/>
				))}
			</div>
		</div>
	);
}

export default TerminalPanel;
