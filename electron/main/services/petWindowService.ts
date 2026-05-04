/**
 * PetWindowService — 桌面宠物窗口生命周期管理
 *
 * 单例服务：确保宠物窗口存在、控制启停、转发 Agent 事件。
 */

import type { BrowserWindow } from "electron";
import { screen } from "electron";
import { createPetWindow } from "../windows/createPetWindow";
import {
	getPetWindowSettings,
	updatePetWindowSettings,
	type PetWindowSettingsData,
} from "../storage/petWindowSettings";
import { createLogger } from "../logging/logger";

let petWindow: BrowserWindow | null = null;
let preloadPath = "";
let rendererUrl: string | undefined;
let rendererDist = "";
let initialized = false;

export function initPetWindowService(config: {
	preloadPath: string;
	rendererUrl?: string;
	rendererDist: string;
}) {
	preloadPath = config.preloadPath;
	rendererUrl = config.rendererUrl;
	rendererDist = config.rendererDist;
	initialized = true;
}

export function ensurePetWindow(): BrowserWindow | null {
	if (!initialized) return null;
	if (petWindow && !petWindow.isDestroyed()) return petWindow;

	try {
		petWindow = createPetWindow({ preloadPath, rendererUrl, rendererDist });
		petWindow.on("closed", () => {
			petWindow = null;
		});
		return petWindow;
	} catch (err) {
		const logger = createLogger();
		logger.error({
			msg: "Failed to create pet window",
			error: err instanceof Error ? err.message : String(err),
		});
		return null;
	}
}

export function setPetWindowEnabled(enabled: boolean) {
	updatePetWindowSettings({ enabled });
	if (enabled) {
		ensurePetWindow();
	} else {
		destroyPetWindow();
	}
}

/**
 * 把窗口位置 clamp 到当前所在显示器的工作区内，避免显示器切换/恢复持久化位置时
 * 宠物跑出屏幕外。
 */
function clampToWorkArea(
	x: number,
	y: number,
	winW: number,
	winH: number,
): { x: number; y: number } {
	const display = screen.getDisplayNearestPoint({
		x: x + Math.round(winW / 2),
		y: y + Math.round(winH / 2),
	});
	const wa = display.workArea;
	return {
		x: Math.max(wa.x, Math.min(x, wa.x + wa.width - winW)),
		y: Math.max(wa.y, Math.min(y, wa.y + wa.height - winH)),
	};
}

export function setPetWindowPosition(x: number, y: number) {
	if (petWindow && !petWindow.isDestroyed()) {
		const [winW, winH] = petWindow.getSize();
		const clamped = clampToWorkArea(x, y, winW, winH);
		updatePetWindowSettings({ x: clamped.x, y: clamped.y });
		petWindow.setPosition(clamped.x, clamped.y);
	} else {
		updatePetWindowSettings({ x, y });
	}
}

export function setPetWindowThroughClicks(enabled: boolean) {
	updatePetWindowSettings({ throughClicks: enabled });
	if (petWindow && !petWindow.isDestroyed()) {
		petWindow.setIgnoreMouseEvents(enabled, { forward: true });
	}
}

export function getPetWindowState(): PetWindowSettingsData {
	return getPetWindowSettings();
}

export function focusMainWindow(getMainWindow: () => BrowserWindow | null) {
	const mainWin = getMainWindow();
	if (mainWin && !mainWin.isDestroyed()) {
		if (mainWin.isMinimized()) mainWin.restore();
		mainWin.show();
		mainWin.focus();
	}
}

export function sendChatToMainWindow(
	getMainWindow: () => BrowserWindow | null,
	text: string,
) {
	const mainWin = getMainWindow();
	if (mainWin && !mainWin.isDestroyed()) {
		if (mainWin.isMinimized()) mainWin.restore();
		mainWin.show();
		mainWin.focus();
		mainWin.webContents.send("pet-quick-reply", { text });
	}
}

export function forwardToPetWindow(channel: string, payload: unknown) {
	if (!petWindow || petWindow.isDestroyed()) return;
	try {
		petWindow.webContents.send(channel, payload);
	} catch {
		// 窗口可能正在关闭，静默忽略
	}
}

export function destroyPetWindow() {
	if (petWindow && !petWindow.isDestroyed()) {
		petWindow.destroy();
	}
	petWindow = null;
}

export function getPetWindow(): BrowserWindow | null {
	if (petWindow && !petWindow.isDestroyed()) return petWindow;
	return null;
}

/**
 * 根据持久化设置启动宠物窗口（在 bootstrapApp 的 createWindow 之后调用）
 */
export function bootPetWindow() {
	if (!initialized) return;
	const settings = getPetWindowSettings();
	if (settings.enabled) {
		ensurePetWindow();
	}
}
