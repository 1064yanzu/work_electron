/**
 * 终端状态管理
 * 管理多终端实例的创建、切换和销毁
 */

import { useSyncExternalStore } from "react";
import { invoke } from "../../lib/tauriCompat";
import { getTerminalPrefs } from "../config/terminal";
import { workspaceStore } from "../workspaceStore";

export interface TerminalInstance {
	id: string;
	name: string;
	cwd: string;
	shell: string;
	pid: number;
	createdAt: number;
}

interface TerminalState {
	/** 所有终端实例 */
	terminals: TerminalInstance[];
	/** 当前活跃的终端 ID */
	activeTerminalId: string | null;
	/** 终端面板是否可见 */
	isVisible: boolean;
}

let counter = 0;

class TerminalStore {
	private state: TerminalState = {
		terminals: [],
		activeTerminalId: null,
		isVisible: false,
	};
	private listeners = new Set<() => void>();

	getState = (): TerminalState => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		for (const fn of this.listeners) fn();
	}

	/** 根据偏好配置解析 cwd */
	private async resolveCwd(explicitCwd?: string): Promise<string | undefined> {
		if (explicitCwd) return explicitCwd;
		try {
			const prefs = await getTerminalPrefs();
			if (prefs.defaultCwdMode === "thread") {
				const threadPath =
					workspaceStore.getCoreState().currentThreadPath;
				if (threadPath) return threadPath;
			}
		} catch {
			// ignore
		}
		return undefined; // 后端会 fallback 到 os.homedir()
	}

	/** 创建新终端 */
	async createTerminal(cwd?: string): Promise<TerminalInstance | null> {
		const id = `term-${Date.now()}-${++counter}`;
		try {
			const [resolvedCwd, prefs] = await Promise.all([
				this.resolveCwd(cwd),
				getTerminalPrefs().catch(() => null),
			]);
			const info = await invoke<TerminalInstance>("terminal_create", {
				id,
				cwd: resolvedCwd,
				...(prefs?.shellPath ? { shell: prefs.shellPath } : {}),
			});
			const instance: TerminalInstance = {
				id: info.id,
				name: info.name,
				cwd: info.cwd,
				shell: info.shell,
				pid: info.pid,
				createdAt: info.createdAt,
			};
			this.state = {
				...this.state,
				terminals: [...this.state.terminals, instance],
				activeTerminalId: instance.id,
				isVisible: true,
			};
			this.emit();
			return instance;
		} catch (err) {
			console.error("[TerminalStore] 创建终端失败:", err);
			return null;
		}
	}

	/** 销毁终端 */
	async destroyTerminal(id: string) {
		try {
			await invoke("terminal_destroy", { id });
		} catch {
			// ignore
		}
		const remaining = this.state.terminals.filter((t) => t.id !== id);
		const newActive =
			this.state.activeTerminalId === id
				? remaining[remaining.length - 1]?.id || null
				: this.state.activeTerminalId;
		this.state = {
			...this.state,
			terminals: remaining,
			activeTerminalId: newActive,
			isVisible: remaining.length > 0,
		};
		this.emit();
	}

	/** 切换活跃终端 */
	setActiveTerminal(id: string) {
		if (this.state.activeTerminalId === id) return;
		this.state = { ...this.state, activeTerminalId: id };
		this.emit();
	}

	/** 切换面板可见性 */
	toggleVisible() {
		if (!this.state.isVisible && this.state.terminals.length === 0) {
			// 没有终端时自动创建一个（createTerminal 内部会解析 cwd）
			void this.createTerminal();
			return;
		}
		this.state = { ...this.state, isVisible: !this.state.isVisible };
		this.emit();
	}

	/** 设置面板可见性 */
	setVisible(visible: boolean) {
		this.state = { ...this.state, isVisible: visible };
		this.emit();
	}

	/** 处理终端退出事件 */
	handleTerminalExit(id: string) {
		const remaining = this.state.terminals.filter((t) => t.id !== id);
		const newActive =
			this.state.activeTerminalId === id
				? remaining[remaining.length - 1]?.id || null
				: this.state.activeTerminalId;
		this.state = {
			...this.state,
			terminals: remaining,
			activeTerminalId: newActive,
		};
		this.emit();
	}

	/** 重命名终端 */
	renameTerminal(id: string, name: string) {
		this.state = {
			...this.state,
			terminals: this.state.terminals.map((t) =>
				t.id === id ? { ...t, name } : t,
			),
		};
		this.emit();
	}

	/** 销毁所有终端 */
	async destroyAll() {
		for (const t of this.state.terminals) {
			try {
				await invoke("terminal_destroy", { id: t.id });
			} catch {
				// ignore
			}
		}
		this.state = {
			terminals: [],
			activeTerminalId: null,
			isVisible: false,
		};
		this.emit();
	}
}

export const terminalStore = new TerminalStore();

/** 选择器 hook */
export function useTerminalStoreSelector<T>(
	selector: (state: TerminalState) => T,
): T {
	return useSyncExternalStore(
		terminalStore.subscribe,
		() => selector(terminalStore.getState()),
		() => selector(terminalStore.getState()),
	);
}
