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
}
