import type { IPCChannel, IPCSchema } from "./ipc-schema";

export type IpcInvoke = <K extends IPCChannel>(
	channel: K,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export type IpcOn = <TPayload>(
	channel: string,
	listener: (payload: TPayload) => void,
) => () => void;

export interface ElectronAPI {
	invoke: IpcInvoke;
	on: IpcOn;
	getPathForFile: (file: File) => string;
	/** 主进程平台标识（darwin / win32 / linux），渲染端做快捷键文案等平台适配 */
	platform: NodeJS.Platform;
}
