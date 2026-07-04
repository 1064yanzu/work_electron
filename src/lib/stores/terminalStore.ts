/**
 * 终端状态管理
 * 管理多终端实例的创建、切换和销毁
 */

import { useSyncExternalStore } from "react";
import { invoke } from "../../lib/tauriCompat";
import { toast } from "../../components/ui/Toast";
import { getTerminalPrefs } from "../config/terminal";
import { workspaceStore } from "../workspaceStore";

export interface RemoteTerminalMeta {
	/** PtyBridgeService 的 session id（区别于 terminal id） */
	sessionId: string;
	/** IM 渠道：feishu / telegram / slack / discord / qqbot / wechat */
	channelId: string;
	/** 对话方 ID（user/group/chat） */
	peerId: string;
	/** 对话方展示名 */
	peerName?: string;
	/** 实际执行的命令 */
	command: string;
	/** 预设 id（自由命令模式下为 undefined） */
	presetId?: string;
}

export interface TerminalInstance {
	id: string;
	name: string;
	cwd: string;
	shell: string;
	pid: number;
	createdAt: number;
	/**
	 * 是否是远控 pty。true 表示该终端由 PtyBridgeService 创建，桌面端只能
	 * 「同屏观察 + 主动输入」，关闭按钮只移除本地 tab、不杀进程。
	 */
	isRemote?: boolean;
	/** 远控元信息；仅在 isRemote 时存在 */
	remoteMeta?: RemoteTerminalMeta;
}

interface TerminalState {
	/** 所有终端实例 */
	terminals: TerminalInstance[];
	/** 当前活跃的终端 ID */
	activeTerminalId: string | null;
	/** 终端面板是否可见 */
	isVisible: boolean;
}

/**
 * 远控 pty 推送给前端的事件 payload：
 *   remote-terminal-attached → attachRemote
 *   remote-terminal-detached → detachRemote
 */
export interface RemoteTerminalAttachedPayload {
	session_id: string;
	terminal: {
		id: string;
		name: string;
		cwd: string;
		shell: string;
		pid: number;
		createdAt: number;
	};
	meta: {
		channel_id: string;
		peer_id: string;
		peer_name?: string;
		command: string;
		preset_id?: string;
	};
	/** 后端读取设置里的 autoShowOnDesktop，true 时前端要打开面板 + 切到该 tab */
	auto_show: boolean;
}

export interface RemoteTerminalDetachedPayload {
	id: string;
	reason?: string;
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
				const threadPath = workspaceStore.getCoreState().currentThreadPath;
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
			toast.error(
				`创建终端失败：${err instanceof Error ? err.message : "未知错误"}`,
			);
			return null;
		}
	}

	/** 销毁终端 */
	async destroyTerminal(id: string) {
		const existing = this.state.terminals.find((t) => t.id === id);
		// 远控 pty 的生命周期由后端 PtyBridgeService 独占管理；前端关闭按钮在
		// 这种 tab 上只做「本地移除」，不发 terminal_destroy（后端 IPC 也会拒绝）。
		if (existing?.isRemote) {
			this.detachRemote(id);
			return;
		}
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

	/**
	 * 远控 pty 接入桌面端。后端 PtyBridgeService 在创建 pty 之后会推送
	 * `remote-terminal-attached`，前端把它当成一个"特殊 tab"挂进列表即可。
	 *
	 * 注意：terminal-data 事件会由 TerminalInstance 内的监听处理，
	 * 这里不需要再订阅一次。
	 */
	attachRemote(payload: RemoteTerminalAttachedPayload): void {
		const existing = this.state.terminals.find(
			(t) => t.id === payload.terminal.id,
		);
		if (existing) {
			// 同一会话重复 attach（理论上不会发生），合并 meta 即可。
			this.state = {
				...this.state,
				terminals: this.state.terminals.map((t) =>
					t.id === payload.terminal.id
						? {
								...t,
								isRemote: true,
								remoteMeta: {
									sessionId: payload.session_id,
									channelId: payload.meta.channel_id,
									peerId: payload.meta.peer_id,
									peerName: payload.meta.peer_name,
									command: payload.meta.command,
									presetId: payload.meta.preset_id,
								},
							}
						: t,
				),
			};
			if (payload.auto_show) {
				this.state = {
					...this.state,
					activeTerminalId: payload.terminal.id,
					isVisible: true,
				};
			}
			this.emit();
			return;
		}
		const instance: TerminalInstance = {
			id: payload.terminal.id,
			name: payload.terminal.name,
			cwd: payload.terminal.cwd,
			shell: payload.terminal.shell,
			pid: payload.terminal.pid,
			createdAt: payload.terminal.createdAt,
			isRemote: true,
			remoteMeta: {
				sessionId: payload.session_id,
				channelId: payload.meta.channel_id,
				peerId: payload.meta.peer_id,
				peerName: payload.meta.peer_name,
				command: payload.meta.command,
				presetId: payload.meta.preset_id,
			},
		};
		const terminals = [...this.state.terminals, instance];
		this.state = {
			...this.state,
			terminals,
			activeTerminalId: payload.auto_show
				? instance.id
				: (this.state.activeTerminalId ?? instance.id),
			isVisible: payload.auto_show ? true : this.state.isVisible,
		};
		this.emit();
	}

	/**
	 * 仅从本地列表移除一个远控 tab；不发 terminal_destroy IPC。
	 * 用于：
	 *   - 后端 pty 退出/被强制终止后推送 `remote-terminal-detached`
	 *   - 用户在 tab 上点 × 关闭（pty 仍在 IM 端可用）
	 */
	detachRemote(id: string): void {
		const exists = this.state.terminals.some((t) => t.id === id && t.isRemote);
		if (!exists) return;
		const remaining = this.state.terminals.filter((t) => t.id !== id);
		const newActive =
			this.state.activeTerminalId === id
				? remaining[remaining.length - 1]?.id || null
				: this.state.activeTerminalId;
		this.state = {
			...this.state,
			terminals: remaining,
			activeTerminalId: newActive,
			isVisible: remaining.length > 0 && this.state.isVisible,
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

	/** 销毁所有终端（远控 tab 仅本地移除） */
	async destroyAll() {
		for (const t of this.state.terminals) {
			if (t.isRemote) continue;
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
