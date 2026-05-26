import {
	BrowserWindow,
	type BrowserWindow as BrowserWindowType,
} from "electron";

/**
 * 判断主应用是否处于用户前台语境。
 *
 * 这里不只看 BrowserWindow.isFocused()：桌宠本身也是应用窗口，
 * 用户点击桌宠时 Electron app 仍然是 active。只要主窗口可见且应用处于前台，
 * 桌宠语音就应该抑制，避免和主窗口对话朗读重复。
 */
export function isMainWindowForeground(win: BrowserWindowType | null): boolean {
	if (!win || win.isDestroyed()) return false;
	if (!win.isVisible() || win.isMinimized()) return false;
	return win.isFocused() || BrowserWindow.getFocusedWindow() !== null;
}
