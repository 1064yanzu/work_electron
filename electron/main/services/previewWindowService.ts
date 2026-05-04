/**
 * 预览窗口服务
 * 弹出独立的 BrowserWindow 加载预览 URL
 * 关闭窗口不影响主进程的预览服务器
 */
import { BrowserWindow, shell } from "electron";

/** 窗口尺寸常量 */
const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 800;
const WINDOW_MIN_WIDTH = 800;
const WINDOW_MIN_HEIGHT = 600;

/** 已打开的预览窗口记录 */
const previewWindows = new Map<
	number,
	{ taskId: string; window: BrowserWindow }
>();

/**
 * 打开独立预览窗口
 * @param taskId  Agent 任务 ID，用于窗口标题
 * @param url     预览地址（http:// 或 file://）
 * @returns 窗口 ID
 */
export function openPreviewWindow(
	taskId: string,
	url: string,
): { windowId: number } {
	const window = new BrowserWindow({
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		minWidth: WINDOW_MIN_WIDTH,
		minHeight: WINDOW_MIN_HEIGHT,
		title: `Preview - ${taskId}`,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			// 预览窗口不需要 preload 脚本
		},
	});

	// 用外部浏览器打开链接，而非在预览窗口内导航
	window.webContents.setWindowOpenHandler(({ url: openUrl }) => {
		shell.openExternal(openUrl);
		return { action: "deny" };
	});

	// 加载预览 URL
	window.loadURL(url);

	// 窗口关闭时清理记录
	const windowId = window.id;
	window.on("closed", () => {
		previewWindows.delete(windowId);
	});

	previewWindows.set(windowId, { taskId, window });

	return { windowId };
}

/**
 * 关闭指定任务的所有预览窗口
 */
export function closePreviewWindowsForTask(taskId: string): void {
	for (const [id, entry] of previewWindows) {
		if (entry.taskId === taskId && !entry.window.isDestroyed()) {
			entry.window.close();
			previewWindows.delete(id);
		}
	}
}

/**
 * 关闭所有预览窗口
 */
export function closeAllPreviewWindows(): void {
	for (const [, entry] of previewWindows) {
		if (!entry.window.isDestroyed()) {
			entry.window.close();
		}
	}
	previewWindows.clear();
}
