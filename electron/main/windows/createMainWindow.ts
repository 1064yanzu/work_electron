import path from "node:path";
import { BrowserWindow } from "electron";
import { setMainWindow } from "../ipc/register";

export function createMainWindow({
	rendererUrl,
	rendererDist,
	publicDir,
	preloadPath,
}: {
	rendererUrl?: string;
	rendererDist: string;
	publicDir: string;
	preloadPath: string;
}) {
	const win = new BrowserWindow({
		icon: path.join(publicDir, "electron-vite.svg"),
		width: 1400,
		height: 900,
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	// 设置主窗口引用，用于 LLM 流式输出
	setMainWindow(win);

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
