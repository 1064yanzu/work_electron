import type { IPCChannel, IPCSchema } from "../../electron/shared/ipc-schema";

export function isElectronAvailable() {
	return typeof window !== "undefined" && !!window.electronAPI?.invoke;
}

export async function ipcInvoke<K extends IPCChannel>(
	channel: K,
	input: IPCSchema[K]["input"],
): Promise<IPCSchema[K]["output"]> {
	if (!window.electronAPI?.invoke) {
		throw new Error("当前环境不可用：请在 Electron 应用中运行。");
	}
	return window.electronAPI.invoke(channel, input);
}
