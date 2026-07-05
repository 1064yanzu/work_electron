/**
 * Config IPC Handlers
 */
import type { IpcMainInvokeEvent } from "electron";
import { app } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { AppConfig } from "../../../shared/types";
import type { DbContext } from "../../db/client";
import { invalidateProviderCache } from "../../llm/invoke";
import { setFileLogLevel } from "../../logging/logger";
import {
	getWindowsCloseBehavior,
	setWindowsCloseBehavior,
} from "../../services/windowClosePreference";

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
		// 让 invoke.ts 中的 active_model 缓存与 provider 缓存即时失效，避免 30s 窗口期间继续走旧值。
		invalidateProviderCache();
		return { success: true };
	};

	const getCloseBehavior: Handler<"app_get_close_behavior"> = async () => {
		return {
			windows: await getWindowsCloseBehavior(db),
			platform: process.platform,
		};
	};

	const setCloseBehavior: Handler<"app_set_close_behavior"> = async (
		_event,
		input,
	) => {
		const windows = await setWindowsCloseBehavior(db, input.windows);
		return { success: true, windows };
	};

	// 文件日志级别：持久化到 app_config 并立即生效（B9 设置面板闭环）。
	// "default" = 清除自定义配置，恢复默认（env LOG_FILE_LEVEL > 生产 info / 开发 debug）。
	const setLogFileLevel: Handler<"set_log_file_level"> = async (
		_event,
		input,
	) => {
		if (input.level === "default") {
			await db.client.execute({
				sql: `DELETE FROM app_config WHERE key = 'log_file_level'`,
				args: [],
			});
			const fallback =
				process.env.LOG_FILE_LEVEL ?? (app.isPackaged ? "info" : "debug");
			return { success: true, effective_level: setFileLogLevel(fallback) };
		}
		await db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES ('log_file_level', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [input.level, now()],
		});
		return { success: true, effective_level: setFileLogLevel(input.level) };
	};

	return {
		get_config: getConfig,
		set_config: setConfig,
		get_all_configs: getAllConfigs,
		get_active_model: getActiveModel,
		set_active_model: setActiveModel,
		app_get_close_behavior: getCloseBehavior,
		app_set_close_behavior: setCloseBehavior,
		set_log_file_level: setLogFileLevel,
	};
}
