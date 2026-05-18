/**
 * userData 缓存 janitor IPC handler
 * - userdata_janitor_scan：仅扫描可清理项（dry-run），返回每个 scope 的字节数与文件数
 * - userdata_janitor_execute：按 scopes 数组执行真正的删除；省略 scopes 时清理所有 scope
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import { executeUserData, scanUserData } from "../../services/userDataJanitor";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createUserDataJanitorHandlers() {
	const userdata_janitor_scan: Handler<"userdata_janitor_scan"> = async () => {
		return scanUserData();
	};

	const userdata_janitor_execute: Handler<"userdata_janitor_execute"> = async (
		_event,
		input,
	) => {
		return executeUserData(input.scopes);
	};

	return { userdata_janitor_scan, userdata_janitor_execute };
}
