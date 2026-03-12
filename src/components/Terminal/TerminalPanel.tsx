/**
 * 终端面板
 * 整合标签栏和终端实例，作为中间面板底部的可折叠区域
 */

import { useCallback, useEffect } from "react";
import { Terminal } from "lucide-react";
import {
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
		const unsub = window.electronAPI?.on<{
			id: string;
			exitCode: number;
			signal?: number;
		}>("terminal-exit", (payload) => {
			terminalStore.handleTerminalExit(payload.id);
		});
		return () => {
			unsub?.();
		};
	}, []);

	// 快捷键: Ctrl+` 切换终端面板
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "`") {
				e.preventDefault();
				terminalStore.toggleVisible();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const handleTerminalExit = useCallback((id: string) => {
		terminalStore.handleTerminalExit(id);
	}, []);

	if (terminals.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full bg-[#1a1b26] text-zinc-500">
				<button
					type="button"
					onClick={() => terminalStore.createTerminal()}
					className="flex items-center gap-2 px-4 py-2.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
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
			<div className="flex-1 min-h-0 bg-[#1a1b26]">
				{terminals.map((t) => (
					<TerminalInstance
						key={t.id}
						terminalId={t.id}
						isActive={t.id === activeId}
						onExit={() => handleTerminalExit(t.id)}
					/>
				))}
			</div>
		</div>
	);
}

export default TerminalPanel;
