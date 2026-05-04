/**
 * MascotManager — 桌面宠物选择器
 *
 * 与 themeManager 同款单例 + localStorage 持久化模式。
 * - 持久化 key: mascotId
 * - 默认: "efficiency"
 * - "off": 完全关闭，组件层 fallback 到原 SVG
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

export type MascotSelection = MascotId | "off";

const STORAGE_KEY = "mascotId";
const DEFAULT_ID: MascotSelection = "efficiency";
const VALID_SELECTIONS: MascotSelection[] = ["off", ...MASCOT_IDS];

class MascotManager {
	private currentId: MascotSelection = DEFAULT_ID;
	private listeners = new Set<() => void>();

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

	setId(id: MascotSelection) {
		if (this.currentId === id) return;
		this.currentId = id;
		if (typeof window !== "undefined") {
			window.localStorage.setItem(STORAGE_KEY, id);
		}
		this.notify();
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

	private notify() {
		for (const listener of this.listeners) listener();
	}
}

export const mascotManager = new MascotManager();

export interface UseMascotResult {
	id: MascotSelection;
	setId: (id: MascotSelection) => void;
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
		setId: (next) => mascotManager.setId(next),
		getAsset: (slot) => mascotManager.getAsset(slot),
		getAnimation: (animation) => mascotManager.getAnimation(animation),
		enabled: id !== "off",
	};
}

export { MASCOT_META, MASCOT_IDS };
export type { MascotId, MascotSlot, MascotAnimation };
