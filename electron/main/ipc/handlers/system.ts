/**
 * 系统级 handler — 操作系统层信息（用户名、平台等）
 */
import os from "node:os";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function sanitizeUsername(raw: string): string {
	let name = (raw || "").trim();
	if (name.includes("\\")) name = name.split("\\").pop() ?? name;
	if (name.includes("@")) name = name.split("@").shift() ?? name;
	return name.trim();
}

export function createSystemHandlers() {
	const get_user_info: Handler<"system_get_user_info"> = async () => {
		try {
			const info = os.userInfo();
			return {
				username: sanitizeUsername(info.username),
				platform: process.platform,
			};
		} catch {
			return { username: "", platform: process.platform };
		}
	};

	return { get_user_info };
}
