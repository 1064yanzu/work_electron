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
		// 入参校验：避免把 undefined / 空串送进主进程导致 path.resolve 抛错
		if (!taskId || !sandboxDir) {
			console.warn("[PreviewServerStore] start 参数缺失:", {
				taskId,
				sandboxDir,
			});
			this.state = {
				...this.state,
				servers: {
					...this.state.servers,
					[taskId || "unknown"]: {
						running: false,
						ready: false,
						error: "缺少 taskId 或 sandboxDir",
					},
				},
			};
			this.emit();
			return false;
		}

		// 先标记为启动中（同时清掉旧 error，否则上层 UI 判断 !error 会沿用过期失败信息）
		this.state = {
			...this.state,
			servers: {
				...this.state.servers,
				[taskId]: { running: true, mode, ready: false, error: undefined },
			},
		};
		this.emit();

		try {
			// 注意：使用 camelCase 与 IPC schema 保持一致；
			// 不传默认 mode，让主进程根据 sandbox 内容自动探测
			// （单 HTML → single；多 HTML/index.html → static；package.json+dev → dev）
			const result = await invoke<{
				url?: string;
				port?: number;
				mode?: PreviewServerMode;
			}>("preview_server_start", {
				taskId,
				sandboxDir,
				...(mode ? { mode } : {}),
			});

			// 如果 invoke 直接返回了结果，也同步更新
			if (result?.url || result?.port || result?.mode) {
				const current = this.state.servers[taskId];
				// single 模式没有 port、url 是 file://，但 service 端立即标 ready
				// → 这里乐观地把 ready=true 写入，避免 UI 等待 emit "ready" 事件的间隙
				const isSingle = result?.mode === "single";
				this.state = {
					...this.state,
					servers: {
						...this.state.servers,
						[taskId]: {
							...current,
							url: result.url ?? current?.url,
							port: result.port ?? current?.port,
							mode: result.mode ?? current?.mode,
							ready: isSingle ? true : current?.ready,
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
			await invoke("preview_server_stop", { taskId });
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
				taskId,
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
