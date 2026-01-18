import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer } from "electron";
import type { IPCChannel, IPCSchema } from "../shared/ipc-schema";
import type { ElectronAPI } from "../shared/preload-api";

type Invoke = <K extends IPCChannel>(
	channel: K,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

const invoke: Invoke = (channel, input) => {
	return ipcRenderer.invoke(channel, input);
};

const on: ElectronAPI["on"] = (channel, listener) => {
	const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
		listener(payload as never);
	};
	ipcRenderer.on(channel, wrapped);
	return () => ipcRenderer.off(channel, wrapped);
};

const api: ElectronAPI = { invoke, on };

contextBridge.exposeInMainWorld("electronAPI", api);
