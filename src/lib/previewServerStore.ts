/**
 * 预览服务器前端状态管理
 * 管理每个沙盒任务对应的预览服务器生命周期
 */

import { useSyncExternalStore } from "react";
import { invoke } from "./tauriCompat";
import { listen } from "./tauriEventCompat";

export type PreviewServerMode = "dev" | "static" | "single";

export interface PreviewServerEntry {
	running: boolean;
	mode?: PreviewServerMode;
	url?: string;
	port?: number;
	ready?: boolean;
	error?: string;
}

export interface PreviewServerState {
	servers: Record<string, PreviewServerEntry>;
}

class PreviewServerStore {
	private state: PreviewServerState = { servers: {} };
	private listeners = new Set<() => void>();
	private unlistenFn: (() => void) | null = null;

	constructor() {
		this.setupEventListener();
	}

	/** 监听主进程推送的 preview-server-event */
	private async setupEventListener() {
		try {
			this.unlistenFn = await listen<{
				taskId: string;
				type: string;
				payload: Record<string, unknown>;
			}>("preview-server-event", (event) => {
				const { taskId, type, payload } = event.payload;
				if (!taskId) return;

				const current = this.state.servers[taskId] ?? { running: false };
				let next: PreviewServerEntry;

				switch (type) {
					case "started":
						next = {
							...current,
							running: true,
							url: typeof payload.url === "string" ? payload.url : current.url,
							port:
								typeof payload.port === "number" ? payload.port : current.port,
							mode: payload.mode as PreviewServerMode | undefined,
							error: undefined,
						};
						break;
					case "ready":
						next = {
							...current,
							ready: true,
							url: typeof payload.url === "string" ? payload.url : current.url,
							port:
								typeof payload.port === "number" ? payload.port : current.port,
							error: undefined,
						};
						break;
					case "error":
						next = {
							...current,
							error:
								typeof payload.message === "string"
									? payload.message
									: "未知错误",
						};
						break;
					case "stopped":
						next = {
							running: false,
							ready: false,
						};
						break;
					default:
						return;
				}

				this.state = {
					...this.state,
					servers: { ...this.state.servers, [taskId]: next },
				};
				this.emit();
			});
		} catch {
			// Electron 环境不可用时静默忽略
		}
	}

	getState = (): PreviewServerState => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	private emit() {
		for (const fn of this.listeners) fn();
	}

	/** 获取指定任务的服务器状态 */
	getServer(taskId: string): PreviewServerEntry | undefined {
		return this.state.servers[taskId];
	}

	/** 启动预览服务器 */
	async start(
		taskId: string,
		sandboxDir: string,
		mode?: PreviewServerMode,
	): Promise<boolean> {
		// 先标记为启动中
		this.state = {
			...this.state,
			servers: {
				...this.state.servers,
				[taskId]: { running: true, mode, ready: false },
			},
		};
		this.emit();

		try {
			const result = await invoke<{ url?: string; port?: number }>(
				"preview_server_start",
				{
					task_id: taskId,
					sandbox_dir: sandboxDir,
					mode: mode ?? "static",
				},
			);

			// 如果 invoke 直接返回了结果，也同步更新
			if (result?.url || result?.port) {
				const current = this.state.servers[taskId];
				this.state = {
					...this.state,
					servers: {
						...this.state.servers,
						[taskId]: {
							...current,
							url: result.url ?? current?.url,
							port: result.port ?? current?.port,
						},
					},
				};
				this.emit();
			}

			return true;
		} catch (err) {
			console.error("[PreviewServerStore] 启动失败:", err);
			this.state = {
				...this.state,
				servers: {
					...this.state.servers,
					[taskId]: {
						running: false,
						ready: false,
						error: err instanceof Error ? err.message : "启动失败",
					},
				},
			};
			this.emit();
			return false;
		}
	}

	/** 停止预览服务器 */
	async stop(taskId: string): Promise<void> {
		try {
			await invoke("preview_server_stop", { task_id: taskId });
		} catch {
			// ignore
		}
		this.state = {
			...this.state,
			servers: {
				...this.state.servers,
				[taskId]: { running: false, ready: false },
			},
		};
		this.emit();
	}

	/** 重启预览服务器 */
	async restart(taskId: string, sandboxDir: string): Promise<boolean> {
		await this.stop(taskId);
		return this.start(taskId, sandboxDir);
	}

	/** 查询预览服务器状态（拉取） */
	async getStatus(taskId: string): Promise<PreviewServerEntry | null> {
		try {
			const result = await invoke<PreviewServerEntry>("preview_server_status", {
				task_id: taskId,
			});
			if (result) {
				this.state = {
					...this.state,
					servers: { ...this.state.servers, [taskId]: result },
				};
				this.emit();
			}
			return result;
		} catch {
			return null;
		}
	}

	/** 清理监听器 */
	destroy() {
		this.unlistenFn?.();
		this.unlistenFn = null;
	}
}

export const previewServerStore = new PreviewServerStore();

/** 选择器 hook */
export function usePreviewServerStoreSelector<T>(
	selector: (state: PreviewServerState) => T,
): T {
	return useSyncExternalStore(
		previewServerStore.subscribe,
		() => selector(previewServerStore.getState()),
		() => selector(previewServerStore.getState()),
	);
}
