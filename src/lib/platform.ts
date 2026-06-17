/**
 * 平台检测与快捷键修饰符文案
 *
 * Windows / Linux 上不该展示 mac 专属的 ⌘ 符号。
 * 优先用 preload 暴露的 process.platform（更可靠），
 * 回退到 navigator.platform（极少数桥接未就绪的早期调用）。
 */

function detectIsMac(): boolean {
	try {
		const fromBridge = (
			window as unknown as {
				electronAPI?: { platform?: string };
			}
		).electronAPI?.platform;
		if (typeof fromBridge === "string") return fromBridge === "darwin";
	} catch {
		// 忽略，走 navigator 回退
	}
	return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
}

export const isMac: boolean = detectIsMac();

/** 修饰键展示文案：mac 为 ⌘，其余平台为 Ctrl */
export const modKey: string = isMac ? "⌘" : "Ctrl";

/** 组合快捷键展示文案，如 shortcut("K") → "⌘K" / "Ctrl+K" */
export function shortcut(key: string): string {
	return isMac ? `${modKey}${key}` : `${modKey}+${key}`;
}
