import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_CHANNEL_SET } from "../shared/ipcChannels.generated";
import type { IPCChannel, IPCSchema } from "../shared/ipc-schema";
import type { ElectronAPI } from "../shared/preload-api";

type Invoke = <K extends IPCChannel>(
	channel: K,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

/**
 * channel 白名单。
 *
 * `IPCChannel` 只在编译期有效 —— 一旦渲染端出现任何 `as any` 或运行时拼出来的
 * channel 名，类型约束就形同虚设，请求会原样打到 `ipcRenderer.invoke`。白名单
 * 把这条缝堵上：不在 schema 里的名字连主进程都到不了，而且报错信息比
 * "No handler registered for 'xxx'" 明确得多（后者分不清是拼错还是漏注册）。
 *
 * 白名单数据由 `scripts/generate-ipc-channels.mjs` 从 ipc-schema.ts 生成，
 * `npm run check:ipc` 会在漂移时报错，不存在手工维护成本。
 */
const invoke: Invoke = (channel, input) => {
	if (!IPC_CHANNEL_SET.has(channel)) {
		return Promise.reject(
			new Error(
				`[preload] 未知的 IPC channel: ${String(channel)}。它不在 electron/shared/ipc-schema.ts 中；` +
					`新增命令后请运行 npm run generate:ipc。`,
			),
		);
	}
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
	platform: process.platform,
};

contextBridge.exposeInMainWorld("electronAPI", api);
