/**
 * MascotManager — 桌面宠物选择器
 *
 * v2: 跨窗口同步
 * - 主进程为权威源（pet-window.json:mascotId）；localStorage 仅作离线兜底
 * - setId() 通过 invoke("mascot_set_id") 让主进程广播给所有窗口
 * - 启动时 listen("mascot-id-changed") 接收广播，更新自己的 currentId
 * - 用 source 标记防回环（pet 发起的变更不触发 pet 自己回写）
 */

import { useSyncExternalStore } from "react";
import {
	type MascotId,
	type MascotSlot,
	type MascotAnimation,
	getMascotAsset,
	getMascotAnimation,
	MASCOT_IDS,
	MASCOT_META,
} from "./mascot/manifest";
import { invoke, isDesktopEnvironment } from "./tauriCompat";
import { listen, type UnlistenFn } from "./tauriEventCompat";

export type MascotSelection = MascotId | "off";

const STORAGE_KEY = "mascotId";
const DEFAULT_ID: MascotSelection = "efficiency";
const VALID_SELECTIONS: MascotSelection[] = ["off", ...MASCOT_IDS];

export type MascotChangeSource = "main" | "pet" | "system";

class MascotManager {
	private currentId: MascotSelection = DEFAULT_ID;
	private listeners = new Set<() => void>();
	private ipcInitialized = false;
	private ipcUnlisten: UnlistenFn | null = null;
	constructor() {
		if (typeof window !== "undefined") {
			const saved = window.localStorage.getItem(STORAGE_KEY);
			if (saved && (VALID_SELECTIONS as string[]).includes(saved)) {
				this.currentId = saved as MascotSelection;
			}
		}
	}

	getId(): MascotSelection {
		return this.currentId;
	}

	/**
	 * 设置当前 IP。
	 * - source: 当前窗口角色（"main" | "pet"）；调用方传入，转发给主进程后再广播回来时
	 *   带相同 source 让本窗口跳过回写避免回环
	 */
	setId(id: MascotSelection, source: MascotChangeSource = "system") {
		if (this.currentId === id) return;
		this.applyLocal(id);
		// 远端：让主进程持久化 + 广播
		if (isDesktopEnvironment()) {
			void invoke("mascot_set_id", { id, source }).catch(() => {
				// 即使 IPC 失败也保留本地变更；下次启动会从持久化恢复
			});
		}
	}

	/** 内部：仅更新本地状态 + localStorage + 通知订阅者 */
	private applyLocal(id: MascotSelection) {
		this.currentId = id;
		if (typeof window !== "undefined") {
			window.localStorage.setItem(STORAGE_KEY, id);
		}
		this.notify();
	}

	/**
	 * 在窗口启动时调用一次：
	 * 1. 从主进程拉取当前权威 IP，覆盖 localStorage
	 * 2. 监听 "mascot-id-changed" 事件，跨窗口同步
	 */
	async initFromIPC(): Promise<void> {
		if (this.ipcInitialized) return;
		this.ipcInitialized = true;
		if (!isDesktopEnvironment()) return;

		// 1. 拉权威值
		try {
			const result = await invoke<{ id: MascotSelection }>("mascot_get_id");
			if (result?.id && (VALID_SELECTIONS as string[]).includes(result.id)) {
				if (this.currentId !== result.id) {
					this.applyLocal(result.id);
				}
			}
		} catch {
			// 主进程暂未注册 handler 时静默回退
		}

		// 2. 订阅广播
		try {
			this.ipcUnlisten = await listen<{
				id: MascotSelection;
				source: MascotChangeSource;
			}>("mascot-id-changed", (event) => {
				const payload = event.payload;
				if (!payload?.id) return;
				if (!(VALID_SELECTIONS as string[]).includes(payload.id)) return;
				if (payload.id === this.currentId) return; // 已同步
				this.applyLocal(payload.id);
			});
		} catch {
			// noop
		}
	}

	/** 取当前 IP 在指定 slot 的图片 URL；off 状态返回 null */
	getAsset(slot: MascotSlot): string | null {
		if (this.currentId === "off") return null;
		return getMascotAsset(this.currentId, slot) || null;
	}

	/** 取当前 IP 的视频动画 URL；off 或缺位返回 null */
	getAnimation(animation: MascotAnimation): string | null {
		if (this.currentId === "off") return null;
		return getMascotAnimation(this.currentId, animation);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	dispose(): void {
		if (this.ipcUnlisten) {
			this.ipcUnlisten();
			this.ipcUnlisten = null;
		}
		this.ipcInitialized = false;
	}

	private notify() {
		for (const listener of this.listeners) listener();
	}
}

export const mascotManager = new MascotManager();

// 启动即拉取一次主进程权威值并监听跨窗口广播
if (typeof window !== "undefined") {
	void mascotManager.initFromIPC();
}

export interface UseMascotResult {
	id: MascotSelection;
	setId: (id: MascotSelection, source?: MascotChangeSource) => void;
	getAsset: (slot: MascotSlot) => string | null;
	getAnimation: (animation: MascotAnimation) => string | null;
	enabled: boolean;
}

const subscribe = (listener: () => void) => mascotManager.subscribe(listener);
const getSnapshot = () => mascotManager.getId();

export function useMascot(): UseMascotResult {
	const id = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return {
		id,
		setId: (next, source) => mascotManager.setId(next, source),
		getAsset: (slot) => mascotManager.getAsset(slot),
		getAnimation: (animation) => mascotManager.getAnimation(animation),
		enabled: id !== "off",
	};
}

export { MASCOT_META, MASCOT_IDS };
export type { MascotId, MascotSlot, MascotAnimation };
