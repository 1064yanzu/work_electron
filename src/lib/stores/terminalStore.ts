/**
 * 终端状态管理
 * 管理多终端实例的创建、切换和销毁
 */

import { useSyncExternalStore } from "react";
import { invoke } from "../../lib/tauriCompat";
import { toast } from "../../components/ui/toastBus";
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
	/**
	 * 是否是 Harness Hub 迁移 pty。true 表示该终端由 harnessHub/ptyLauncher 创建
	 * （虚拟屏就绪探测 + 交接包注入），关闭走 harness_pty_close 而非 terminal_destroy。
	 * 与 isRemote 互斥。
	 */
	isHarness?: boolean;
	/** Harness 元信息；仅在 isHarness 时存在 */
	harnessMeta?: HarnessTerminalMeta;
	/**
	 * 是否由中间栏的 CLI 标签页托管。true 表示这个 pty 的"显示位置"在中栏标签，
	 * 底部终端面板不再重复渲染它——同一个 pty 挂两个 xterm 会互相抢 resize。
	 * 生命周期仍然归 terminalStore 管（创建 / 销毁 / 退出都走同一套）。
	 */
	hostedInCenter?: boolean;
}

/** Harness 迁移 pty 的元信息。 */
export interface HarnessTerminalMeta {
	/** 目标 harness（claude-code / codex / ...） */
	harness: string;
	/** 后端 pty id（等同 terminal id，保留以便语义清晰） */
	ptyId: string;
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

/**
 * Harness Hub 迁移 pty 推送给前端的事件 payload：
 *   harness-terminal-attached → attachHarness
 */
export interface HarnessTerminalAttachedPayload {
	pty_id: string;
	harness: string;
	terminal: {
		id: string;
		name: string;
		cwd: string;
		shell: string;
		pid: number;
		createdAt: number;
	};
	/** true 时前端要打开终端面板 + 切到该 tab */
	auto_show: boolean;
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

	/**
	 * 创建一个「由中栏标签页托管」的终端。
	 *
	 * 与 `createTerminal` 的差别只有三处：打上 `hostedInCenter` 标记、用调用方给的
	 * 名字、**不碰底部面板的可见性与激活项**——它压根不该出现在底部面板里。
	 */
	async createHostedTerminal(options: {
		name: string;
		cwd?: string;
	}): Promise<TerminalInstance | null> {
		const id = `term-${Date.now()}-${++counter}`;
		try {
			const [resolvedCwd, prefs] = await Promise.all([
				this.resolveCwd(options.cwd),
				getTerminalPrefs().catch(() => null),
			]);
			const info = await invoke<TerminalInstance>("terminal_create", {
				id,
				cwd: resolvedCwd,
				...(prefs?.shellPath ? { shell: prefs.shellPath } : {}),
			});
			const instance: TerminalInstance = {
				id: info.id,
				name: options.name,
				cwd: info.cwd,
				shell: info.shell,
				pid: info.pid,
				createdAt: info.createdAt,
				hostedInCenter: true,
			};
			this.state = {
				...this.state,
				terminals: [...this.state.terminals, instance],
			};
			this.emit();
			return instance;
		} catch (err) {
			console.error("[TerminalStore] 创建托管终端失败:", err);
			toast.error(
				`启动失败：${err instanceof Error ? err.message : "未知错误"}`,
			);
			return null;
		}
	}

	/** 向某个终端的 pty 写入（中栏 CLI 标签页用它把启动命令打进去）。 */
	async write(id: string, data: string): Promise<void> {
		try {
			await invoke("terminal_write", { id, data });
		} catch (err) {
			console.error("[TerminalStore] 写入终端失败:", err);
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
		// Harness 迁移 pty：terminal_destroy 同样被后端前缀保护挡掉，
		// 必须走专用命令真正结束 CLI 进程，再移除本地 tab。
		if (existing?.isHarness) {
			try {
				await invoke("harness_pty_close", { pty_id: id });
			} catch {
				// ignore
			}
			this.detachHarness(id);
			return;
		}
		try {
			await invoke("terminal_destroy", { id });
		} catch {
			// ignore
		}
		const remaining = this.state.terminals.filter((t) => t.id !== id);
		// 底部面板的激活项 / 可见性只按"面板里的终端"算：中栏托管的 CLI
		// 终端不在面板里露面，不该把面板顶开、也不该被选中
		const inPanel = remaining.filter((t) => !t.hostedInCenter);
		const newActive =
			this.state.activeTerminalId === id
				? inPanel[inPanel.length - 1]?.id || null
				: this.state.activeTerminalId;
		this.state = {
			...this.state,
			terminals: remaining,
			activeTerminalId: newActive,
			isVisible: inPanel.length > 0 && this.state.isVisible,
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

	/**
	 * Harness Hub 迁移 pty 接入桌面端。ptyLauncher 创建 pty 后推送
	 * `harness-terminal-attached`，前端把它当成一个特殊 tab 挂进列表。
	 *
	 * 与远控 tab 的差别：关闭时走 harness_pty_close（真正结束 CLI 进程），
	 * 而远控 tab 只做本地移除。
	 */
	attachHarness(payload: HarnessTerminalAttachedPayload): void {
		const meta: HarnessTerminalMeta = {
			harness: payload.harness,
			ptyId: payload.pty_id,
		};
		const existing = this.state.terminals.find(
			(t) => t.id === payload.terminal.id,
		);
		if (existing) {
			this.state = {
				...this.state,
				terminals: this.state.terminals.map((t) =>
					t.id === payload.terminal.id
						? { ...t, isHarness: true, harnessMeta: meta }
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
			isHarness: true,
			harnessMeta: meta,
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

	/** 仅从本地列表移除一个 harness tab（pty 已在后端退出时用）。 */
	detachHarness(id: string): void {
		const exists = this.state.terminals.some((t) => t.id === id && t.isHarness);
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
		const inPanel = this.state.terminals.filter((t) => !t.hostedInCenter);
		if (!this.state.isVisible && inPanel.length === 0) {
			// 面板里没有终端时自动创建一个（createTerminal 内部会解析 cwd）
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
		const inPanel = remaining.filter((t) => !t.hostedInCenter);
		const newActive =
			this.state.activeTerminalId === id
				? inPanel[inPanel.length - 1]?.id || null
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
				// harness pty 的 terminal_destroy 会被后端前缀保护拒掉，
				// 必须走专用命令，否则 pty 变成孤儿进程
				if (t.isHarness) {
					await invoke("harness_pty_close", { pty_id: t.id });
				} else {
					await invoke("terminal_destroy", { id: t.id });
				}
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
