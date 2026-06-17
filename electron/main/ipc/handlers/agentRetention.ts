/**
 * Agent 数据保留策略 IPC handler
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	scanExpiredAgentSessions,
	cleanExpiredAgentSessions,
} from "../../services/agentRetention";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createAgentRetentionHandlers(db: DbContext) {
	const agent_retention_scan: Handler<"agent_retention_scan"> = async () => {
		return scanExpiredAgentSessions(db);
	};

	const agent_retention_clean: Handler<"agent_retention_clean"> = async () => {
		return cleanExpiredAgentSessions(db);
	};

	return { agent_retention_scan, agent_retention_clean };
}
