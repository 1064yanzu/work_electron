import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { IPCChannel, IPCSchema } from "../shared/ipc-schema";
import type { ElectronAPI } from "../shared/preload-api";

type Invoke = <K extends IPCChannel>(
	channel: K,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

const invoke: Invoke = (channel, input) => {
	return ipcRenderer.invoke(channel, input);
};

/**
 * 主进程通过 BatchedSender 合并发送的通道。
 * 这些通道的 payload 形态为 { items: T[] }，preload 在 listener 层自动展开为多次单条调用，
 * 让所有渲染端消费方完全无感知（包括绕过 tauriEventCompat 直接 electronAPI.on 的位置）。
 *
 * 配套实现：electron/main/utils/batchedSender.ts
 */
const BATCHED_CHANNELS = new Set<string>([
	"terminal-data",
	"llm-stream-chunk",
	"agent-sdk-event",
	"tts-stream-chunk",
	"tts-clone-progress",
]);

function isBatchedPayload(value: unknown): value is { items: unknown[] } {
	if (!value || typeof value !== "object") return false;
	const items = (value as { items?: unknown }).items;
	return Array.isArray(items);
}

const on: ElectronAPI["on"] = (channel, listener) => {
	const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
		if (BATCHED_CHANNELS.has(channel) && isBatchedPayload(payload)) {
			for (const item of payload.items) {
				listener(item as never);
			}
			return;
		}
		listener(payload as never);
	};
	ipcRenderer.on(channel, wrapped);
	return () => ipcRenderer.off(channel, wrapped);
};

const api: ElectronAPI = {
	invoke,
	on,
	getPathForFile: (file: File) => {
		try {
			return webUtils.getPathForFile(file);
		} catch {
			return "";
		}
	},
};

contextBridge.exposeInMainWorld("electronAPI", api);
