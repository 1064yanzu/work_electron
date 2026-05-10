/**
 * petGlobalShortcut — 桌宠全局热键
 *
 * 默认绑定：Ctrl+Alt+Space（macOS: Control+Option+Space）
 * 行为：
 * 1. 若宠物窗口未启用 → 启用（更新持久化 + 创建窗口）
 * 2. 确保窗口可见 + 转到屏幕前
 * 3. 向宠物窗口渲染端发 "pet-focus-input" 事件，让 usePetEventBridge 打开输入气泡
 *
 * 为什么不在 PetApp 内部用浏览器快捷键：桌宠窗口通常不持有焦点，
 * 浏览器 keydown 事件根本不会送达；只有主进程 globalShortcut 才能跨窗口捕获。
 */

import { globalShortcut } from "electron";
import { createLogger } from "../logging/logger";
import {
	ensurePetWindow,
	forwardToPetWindow,
	setPetWindowEnabled,
} from "./petWindowService";
import {
	getPetWindowSettings,
	updatePetWindowSettings,
} from "../storage/petWindowSettings";

export const DEFAULT_PET_GLOBAL_SHORTCUT = "Control+Alt+Space";

let currentAccelerator: string | null = null;

function doInvoke() {
	const settings = getPetWindowSettings();
	if (!settings.enabled) {
		setPetWindowEnabled(true);
	}
	const win = ensurePetWindow();
	if (!win || win.isDestroyed()) return;
	try {
		if (win.isMinimized()) win.restore();
		win.showInactive(); // 不抢焦点
		win.setAlwaysOnTop(true, "floating");
	} catch {
		// noop
	}
	forwardToPetWindow("pet-focus-input", { at: Date.now() });
}

/**
 * 注册全局热键。若已有旧 accelerator，先注销。
 * 静默容忍注册失败（其他应用占用同一组合时），返回是否成功。
 */
export function registerPetGlobalShortcut(
	accelerator: string = DEFAULT_PET_GLOBAL_SHORTCUT,
): boolean {
	const logger = createLogger();
	if (currentAccelerator) {
		try {
			globalShortcut.unregister(currentAccelerator);
		} catch {
			// noop
		}
		currentAccelerator = null;
	}
	try {
		const ok = globalShortcut.register(accelerator, doInvoke);
		if (ok) {
			currentAccelerator = accelerator;
			updatePetWindowSettings({ globalShortcutEnabled: true });
			logger.info({
				msg: "Pet global shortcut registered",
				accelerator,
			});
			return true;
		}
		logger.warn({
			msg: "Pet global shortcut register returned false (likely occupied)",
			accelerator,
		});
		return false;
	} catch (err) {
		logger.warn({
			msg: "Pet global shortcut register threw",
			accelerator,
			error: err instanceof Error ? err.message : String(err),
		});
		return false;
	}
}

export function unregisterPetGlobalShortcut() {
	if (currentAccelerator) {
		try {
			globalShortcut.unregister(currentAccelerator);
		} catch {
			// noop
		}
		currentAccelerator = null;
	}
}

export function setPetGlobalShortcutEnabled(enabled: boolean) {
	updatePetWindowSettings({ globalShortcutEnabled: enabled });
	if (enabled) {
		registerPetGlobalShortcut();
	} else {
		unregisterPetGlobalShortcut();
	}
}

export function getPetGlobalShortcutActive(): boolean {
	return currentAccelerator !== null;
}
