import type { BrowserWindow, WebContents } from "electron";

export function sendToLiveWebContents(
	target: BrowserWindow | WebContents | null | undefined,
	channel: string,
	...args: unknown[]
): boolean {
	if (!target) return false;

	const webContents =
		"webContents" in target
			? target.isDestroyed()
				? null
				: target.webContents
			: target;
	if (!webContents) return false;
	if (webContents.isDestroyed()) return false;

	try {
		const frame = webContents.mainFrame;
		if (frame.isDestroyed() || frame.detached) return false;
		frame.send(channel, ...args);
		return true;
	} catch {
		return false;
	}
}
