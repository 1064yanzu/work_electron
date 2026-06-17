import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, nativeTheme } from "electron";
import { setMainWindow } from "../ipc/register";
import { applyMenuBarPolicyToWindow } from "../menu";

/**
 * 读取持久化的窗口背景色，避免启动时白屏闪烁。
 * 渲染端 ThemeManager 应用主题时会把当前背景色写入
 * userData/window-background.json（双写，主进程只读）。
 * 读不到时按系统亮暗模式兜底：暗色用暖深色、亮色用奶油白。
 */
function resolveStartupBackgroundColor(): string {
	try {
		const raw = fs.readFileSync(
			path.join(app.getPath("userData"), "window-background.json"),
			"utf-8",
		);
		const parsed = JSON.parse(raw) as { backgroundColor?: string };
		if (
			typeof parsed.backgroundColor === "string" &&
			/^#[0-9a-fA-F]{6}$/.test(parsed.backgroundColor)
		) {
			return parsed.backgroundColor;
		}
	} catch {
		// 文件不存在（首次启动）或损坏，走兜底
	}
	return nativeTheme.shouldUseDarkColors ? "#1a1a1a" : "#faf9f5";
}

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
		// 先隐藏，ready-to-show 后再显示；配合 backgroundColor 消除启动白屏闪烁
		show: false,
		backgroundColor: resolveStartupBackgroundColor(),
		// Windows / Linux 上默认隐藏顶部菜单栏，避免顶栏冗余；按 Alt 可临时弹出
		autoHideMenuBar: process.platform !== "darwin",
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	applyMenuBarPolicyToWindow(win);

	win.once("ready-to-show", () => {
		win.show();
	});

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
