import path from "node:path";
import { BrowserWindow, screen } from "electron";
import { getPetWindowSettings } from "../storage/petWindowSettings";

export function createPetWindow({
	preloadPath,
	rendererUrl,
	rendererDist,
}: {
	preloadPath: string;
	rendererUrl?: string;
	rendererDist: string;
}): BrowserWindow {
	const settings = getPetWindowSettings();

	// 默认位置：屏幕右下角 work area，距边 24px（避开菜单栏 / Dock / 任务栏）
	const displays = screen.getAllDisplays();
	const primary = displays[0] ?? screen.getPrimaryDisplay();
	const wa = primary.workArea;
	// 窗口尺寸：宠物本身 180×195，气泡（输入气泡）外宽约 260，
	// 加上左右 padding 与三角箭头呼吸，需要至少 300×360。
	// 整个窗口透明，多出来的空间用户感受不到，但能容纳气泡完整呈现。
	const winW = 300;
	const winH = 360;
	const margin = 24;

	const defaultX = wa.x + wa.width - winW - margin;
	const defaultY = wa.y + wa.height - winH - margin;

	// 持久化的位置可能来自不同显示器配置，需要 clamp 到当前可视的 work area
	let posX = settings.x >= 0 ? settings.x : defaultX;
	let posY = settings.y >= 0 ? settings.y : defaultY;
	const targetDisplay = screen.getDisplayNearestPoint({
		x: posX + Math.round(winW / 2),
		y: posY + Math.round(winH / 2),
	});
	const targetWa = targetDisplay.workArea;
	posX = Math.max(
		targetWa.x,
		Math.min(posX, targetWa.x + targetWa.width - winW),
	);
	posY = Math.max(
		targetWa.y,
		Math.min(posY, targetWa.y + targetWa.height - winH),
	);

	const win = new BrowserWindow({
		width: winW,
		height: winH,
		x: posX,
		y: posY,
		frame: false,
		transparent: true,
		// 显式声明 32-bit 全透明背景：避免某些 macOS/Windows 环境下
		// transparent:true 不生效时露出默认白底
		backgroundColor: "#00000000",
		resizable: false,
		hasShadow: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		show: false,
		// macOS: 使用 panel 类型实现跨 Space 可见且不抢焦点
		...(process.platform === "darwin" ? { type: "panel" as const } : {}),
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
			// preload 只使用 contextBridge/ipcRenderer/webUtils，显式声明沙箱加固
			sandbox: true,
		},
	});

	// 跨所有桌面空间可见（含全屏 Space）
	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	win.setAlwaysOnTop(true, "floating");

	// 精确命中检测模式：始终以 forward 模式启动。
	// - throughClicks=true：永久穿透，渲染层动态逻辑感知后会保持 ignore=true
	// - throughClicks=false：动态模式，渲染层 usePetHitTest 实时切换捕获/穿透
	// 两种情况都先调 setIgnoreMouseEvents(true, { forward: true })，mousemove 仍能转发到 renderer
	win.setIgnoreMouseEvents(true, { forward: true });

	// 加载页面：#/pet 哈希路由复用主渲染进程入口
	if (rendererUrl) {
		win.loadURL(`${rendererUrl}#/pet`);
	} else {
		win.loadFile(path.join(rendererDist, "index.html"), {
			hash: "/pet",
		});
	}

	win.once("ready-to-show", () => {
		win.showInactive(); // 不抢焦点
	});

	return win;
}
