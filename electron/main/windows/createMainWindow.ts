import path from "node:path";
import { app, BrowserWindow } from "electron";
import { setMainWindow } from "../ipc/register";
import { applyMenuBarPolicyToWindow } from "../menu";

export function createMainWindow({
	rendererUrl,
	rendererDist,
	publicDir: _publicDir,
	preloadPath,
}: {
	rendererUrl?: string;
	rendererDist: string;
	publicDir: string;
	preloadPath: string;
}) {
	// dev 模式用 build/icon.png 兜底 Dock/任务栏；prod 由 electron-builder 通过
	// .icns / .ico 注入到 .app Info.plist / .exe 资源段，BrowserWindow.icon 不再需要。
	const iconPath =
		!app.isPackaged && process.env.APP_ROOT
			? path.join(process.env.APP_ROOT, "build", "icon.png")
			: undefined;

	const win = new BrowserWindow({
		...(iconPath ? { icon: iconPath } : {}),
		width: 1400,
		height: 900,
		// Windows / Linux 上默认隐藏顶部菜单栏，避免顶栏冗余；按 Alt 可临时弹出
		autoHideMenuBar: process.platform !== "darwin",
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	applyMenuBarPolicyToWindow(win);

	// 设置主窗口引用，用于 LLM 流式输出
	setMainWindow(win);

	// 窗口销毁时释放所有持有的引用，避免 BrowserWindow 对象残留导致 GC 不掉（M3）
	win.on("closed", () => {
		setMainWindow(null);
	});

	win.webContents.on("did-finish-load", () => {
		win.webContents.send("main-process-message", new Date().toLocaleString());
	});

	if (rendererUrl) {
		win.loadURL(rendererUrl);
	} else {
		win.loadFile(path.join(rendererDist, "index.html"));
	}

	return win;
}
