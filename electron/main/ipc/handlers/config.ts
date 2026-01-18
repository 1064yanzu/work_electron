/**
 * Config IPC Handlers
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { AppConfig } from "../../../shared/types";
import type { DbContext } from "../../db/client";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

/** 默认活跃模型 */
const DEFAULT_ACTIVE_MODEL = "gpt-4o";

export function createConfigHandlers(db: DbContext) {
	const now = () => Date.now();

	const getConfig: Handler<"get_config"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = ?`,
			args: [input.key],
		});
		if (rows.rows.length === 0) return null;
		return rows.rows[0].value as string;
	};

	const setConfig: Handler<"set_config"> = async (_event, input) => {
		const timestamp = now();
		await db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [input.key, input.value, timestamp],
		});
		return { success: true };
	};

	const getAllConfigs: Handler<"get_all_configs"> = async () => {
		const rows = await db.client.execute(
			`SELECT * FROM app_config ORDER BY key`,
		);
		return rows.rows.map((row) => ({
			key: row.key as string,
			value: row.value as string,
			updated_at: row.updated_at as number,
		})) as AppConfig[];
	};

	const getActiveModel: Handler<"get_active_model"> = async () => {
		const rows = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = 'active_model'`,
			args: [],
		});
		if (rows.rows.length === 0) return DEFAULT_ACTIVE_MODEL;
		return (rows.rows[0].value as string) || DEFAULT_ACTIVE_MODEL;
	};

	const setActiveModel: Handler<"set_active_model"> = async (_event, input) => {
		const timestamp = now();
		await db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES ('active_model', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [input.model, timestamp],
		});
		return { success: true };
	};

	return {
		get_config: getConfig,
		set_config: setConfig,
		get_all_configs: getAllConfigs,
		get_active_model: getActiveModel,
		set_active_model: setActiveModel,
	};
}
