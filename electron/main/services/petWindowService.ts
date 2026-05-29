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
	type MascotIdPersisted,
	type PetWindowSettingsData,
} from "../storage/petWindowSettings";
import { createLogger } from "../logging/logger";

let petWindow: BrowserWindow | null = null;
let preloadPath = "";
let rendererUrl: string | undefined;
let rendererDist = "";
let initialized = false;
let getMainWindowRef: (() => BrowserWindow | null) | null = null;

export function initPetWindowService(config: {
	preloadPath: string;
	rendererUrl?: string;
	rendererDist: string;
	getMainWindow?: () => BrowserWindow | null;
}) {
	preloadPath = config.preloadPath;
	rendererUrl = config.rendererUrl;
	rendererDist = config.rendererDist;
	if (config.getMainWindow) {
		getMainWindowRef = config.getMainWindow;
	}
	initialized = true;
}

/** 让 IPC 注册器把主窗口引用回填进来（避免循环依赖） */
export function bindMainWindowGetter(getter: () => BrowserWindow | null) {
	getMainWindowRef = getter;
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

/**
 * 拖动结束后，把宠物窗口"贴墙"。
 * - 若离左/右边缘小于 threshold（默认 80px），则用 ~180ms 帧动画滑到该边缘外侧 4px
 *   末段轻微弹性（cubic-bezier(0.34, 1.56, 0.64, 1)），落地后通知渲染端做"反弹"动效
 * - 否则保持原位
 * - 上下方向不强制（用户可能想放在屏幕中段）
 */
export function snapPetWindowToNearestEdge(threshold = 80): {
	snapped: boolean;
	x: number;
	y: number;
} {
	if (!petWindow || petWindow.isDestroyed()) {
		return { snapped: false, x: 0, y: 0 };
	}
	const [winW, winH] = petWindow.getSize();
	const [curX, curY] = petWindow.getPosition();
	const display = screen.getDisplayNearestPoint({
		x: curX + Math.round(winW / 2),
		y: curY + Math.round(winH / 2),
	});
	const wa = display.workArea;

	const distLeft = curX - wa.x;
	const distRight = wa.x + wa.width - (curX + winW);

	let nextX = curX;
	let snapped = false;
	const margin = 4;
	if (distLeft <= threshold && distLeft <= distRight) {
		nextX = wa.x + margin;
		snapped = nextX !== curX;
	} else if (distRight <= threshold && distRight < distLeft) {
		nextX = wa.x + wa.width - winW - margin;
		snapped = nextX !== curX;
	}

	if (snapped) {
		const clamped = clampToWorkArea(nextX, curY, winW, winH);
		animatePetWindowTo(clamped.x, clamped.y, 180, "elastic-out");
		updatePetWindowSettings({ x: clamped.x, y: clamped.y });
		return { snapped: true, x: clamped.x, y: clamped.y };
	}
	return { snapped: false, x: curX, y: curY };
}

/** 动画跑动控制锁：fling 或 snap 期间禁用其它 setPosition */
let animationToken = 0;

function easeElasticOut(t: number): number {
	// 尾段稍带 overshoot（cubic-bezier(0.34, 1.56, 0.64, 1) 的 numeric 近似）
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	const c4 = (2 * Math.PI) / 3;
	return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

function animatePetWindowTo(
	targetX: number,
	targetY: number,
	durationMs: number,
	easing: "elastic-out" | "out-cubic" = "out-cubic",
) {
	if (!petWindow || petWindow.isDestroyed()) return;
	const win = petWindow;
	const [winW, winH] = win.getSize();
	const [startX, startY] = win.getPosition();
	const startedAt = Date.now();
	const myToken = ++animationToken;
	const ease = easing === "elastic-out" ? easeElasticOut : easeOutCubic;

	const tick = () => {
		if (myToken !== animationToken) return; // 被新的动画/拖动取消
		if (!petWindow || petWindow.isDestroyed()) return;
		const elapsed = Date.now() - startedAt;
		const t = Math.min(1, elapsed / durationMs);
		const k = ease(t);
		const x = Math.round(startX + (targetX - startX) * k);
		const y = Math.round(startY + (targetY - startY) * k);
		const clamped = clampToWorkArea(x, y, winW, winH);
		try {
			win.setPosition(clamped.x, clamped.y);
		} catch {
			return;
		}
		if (t < 1) {
			setTimeout(tick, 16);
		} else {
			// 末端通知渲染端做落地反弹效果
			try {
				win.webContents.send("pet-landed", { x: clamped.x, y: clamped.y });
			} catch {
				// noop
			}
		}
	};
	tick();
}

/** 是否有动画跑动中（让 dragStart 接管时强制取消） */
export function cancelPetWindowAnimation() {
	animationToken++;
}

/**
 * 松手时用速度让宠物按惯性飞 ~200ms，再贴墙吸附。
 * vx, vy 单位 px/ms（鼠标最近 ~60ms 的位移除以时间）。
 */
export function flingAndSnapPetWindow(
	vx: number,
	vy: number,
	threshold = 80,
): void {
	if (!petWindow || petWindow.isDestroyed()) return;
	const [winW, winH] = petWindow.getSize();
	const [curX, curY] = petWindow.getPosition();
	const display = screen.getDisplayNearestPoint({
		x: curX + Math.round(winW / 2),
		y: curY + Math.round(winH / 2),
	});
	const wa = display.workArea;

	// 速度 → 飞行距离（×120 取得自然手感）
	const FLIGHT_MS = 200;
	const SCALE = 120;
	const flightX = Math.round(vx * SCALE);
	const flightY = Math.round(vy * SCALE);

	// 飞行目标先 clamp 到工作区
	const tentativeX = curX + flightX;
	const tentativeY = curY + flightY;
	const flightTargetX = Math.max(
		wa.x,
		Math.min(tentativeX, wa.x + wa.width - winW),
	);
	const flightTargetY = Math.max(
		wa.y,
		Math.min(tentativeY, wa.y + wa.height - winH),
	);

	// 超过 8px 才走 fling，否则直接 snap
	const distSq = flightX * flightX + flightY * flightY;
	if (distSq < 64) {
		snapPetWindowToNearestEdge(threshold);
		return;
	}

	// 第一阶段：fling
	animatePetWindowTo(flightTargetX, flightTargetY, FLIGHT_MS, "out-cubic");
	// 第二阶段：fling 完成后再 snap（180ms 偏后续）
	setTimeout(() => {
		// fling 落地的位置可能贴近边缘了，让 snap 决定要不要继续吸附
		snapPetWindowToNearestEdge(threshold);
	}, FLIGHT_MS + 20);
}

export function setPetWindowThroughClicks(enabled: boolean) {
	updatePetWindowSettings({ throughClicks: enabled });
	if (petWindow && !petWindow.isDestroyed()) {
		// 无论开启或关闭，都先进入 forward 模式：
		// - throughClicks=true：永久穿透（渲染层动态逻辑会感知到并禁用自身）
		// - throughClicks=false：动态模式，渲染层的 usePetHitTest 负责后续管理
		petWindow.setIgnoreMouseEvents(true, { forward: true });
	}
}

/**
 * 动态设置鼠标事件忽略（由渲染层精确命中检测驱动）。
 * ignore=true  → 透明区域穿透，鼠标事件转发给背后的窗口
 * ignore=false → 窗口正常捕获鼠标事件（光标在宠物/气泡上时）
 */
export function setPetWindowMouseIgnore(ignore: boolean) {
	if (petWindow && !petWindow.isDestroyed()) {
		if (ignore) {
			petWindow.setIgnoreMouseEvents(true, { forward: true });
		} else {
			petWindow.setIgnoreMouseEvents(false);
		}
	}
}

export function getPetWindowState(): PetWindowSettingsData {
	return getPetWindowSettings();
}

/** 取宠物窗口当前位置 + 所在 display 工作区几何（供气泡 placement 决策） */
export function getPetWindowPosition(): {
	x: number;
	y: number;
	width: number;
	height: number;
	displayX: number;
	displayY: number;
	displayWidth: number;
	displayHeight: number;
} {
	if (!petWindow || petWindow.isDestroyed()) {
		// 回落：返回主显示器工作区，让前端不至于崩
		const primary = screen.getPrimaryDisplay().workArea;
		return {
			x: primary.x,
			y: primary.y,
			width: 0,
			height: 0,
			displayX: primary.x,
			displayY: primary.y,
			displayWidth: primary.width,
			displayHeight: primary.height,
		};
	}
	const [winX, winY] = petWindow.getPosition();
	const [winW, winH] = petWindow.getSize();
	const display = screen.getDisplayNearestPoint({
		x: winX + Math.round(winW / 2),
		y: winY + Math.round(winH / 2),
	});
	return {
		x: winX,
		y: winY,
		width: winW,
		height: winH,
		displayX: display.workArea.x,
		displayY: display.workArea.y,
		displayWidth: display.workArea.width,
		displayHeight: display.workArea.height,
	};
}

/** 获取所有需要接收宠物相关广播的窗口（main + pet） */
export function getMascotBroadcastTargets(): BrowserWindow[] {
	const main = getMainWindowRef?.() ?? null;
	const targets: BrowserWindow[] = [];
	if (main && !main.isDestroyed()) targets.push(main);
	if (petWindow && !petWindow.isDestroyed()) targets.push(petWindow);
	return targets;
}

/**
 * 广播宠物 IP 变更：同时给主窗口和宠物窗口发 "mascot-id-changed" 事件，
 * 携带 source 让接收方可去重避免回环。持久化也由本函数负责。
 */
export function broadcastMascotChange(
	id: MascotIdPersisted,
	source: "main" | "pet" | "system",
): void {
	updatePetWindowSettings({ mascotId: id });
	const payload = { id, source };
	for (const win of getMascotBroadcastTargets()) {
		try {
			win.webContents.send("mascot-id-changed", payload);
		} catch {
			// 窗口可能正在关闭
		}
	}
}

/** 广播 size 档位变更，让宠物窗口重新读取设置 */
export function broadcastPetSettingsChange(
	patch: Partial<PetWindowSettingsData>,
): void {
	updatePetWindowSettings(patch);
	const main = getMainWindowRef?.() ?? null;
	const targets: BrowserWindow[] = [];
	if (main && !main.isDestroyed()) targets.push(main);
	if (petWindow && !petWindow.isDestroyed()) targets.push(petWindow);
	for (const win of targets) {
		try {
			win.webContents.send("pet-settings-changed", { patch });
		} catch {
			// noop
		}
	}
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
