/**
 * 存量明文凭证 → safeStorage 密文的一次性迁移。
 *
 * 为什么不在每个读取点做「读到明文就写回」：读取点有十几处（providers 列表、
 * LLM 调用层、代理路由、图像生成、TTS、WebDAV 调度器……），每处都加写回既啰嗦
 * 又会在只读路径上引入意外的写事务。集中在启动后的 idle 阶段扫一遍更干净，
 * 而且天然幂等（`encryptSecret` 对密文是 no-op）。
 *
 * 迁移只覆盖**已知的存储位置**：
 * - `providers.api_key`
 * - `sync_config.webdav_password`
 * - `tts_settings.providers` JSON 里每个条目的 `api_key`
 * - `app_config['remote.control.config']` 整块 JSON（含飞书 appSecret / 各 IM token）
 */
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { REMOTE_CONTROL_CONFIG_KEY } from "../remote-control/core/defaults";
import {
	encryptSecret,
	isEncryptedSecret,
	isSecretEncryptionAvailable,
} from "./secretVault";

async function migrateColumn(
	db: DbContext,
	table: string,
	column: string,
	idColumn = "id",
): Promise<number> {
	const rows = await db.client.execute(
		`SELECT ${idColumn} AS __id, ${column} AS __value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`,
	);
	let migrated = 0;
	for (const row of rows.rows as unknown as Record<string, unknown>[]) {
		const value = row.__value;
		if (typeof value !== "string" || isEncryptedSecret(value)) continue;
		await db.client.execute({
			sql: `UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`,
			args: [String(encryptSecret(value)), row.__id as string],
		});
		migrated += 1;
	}
	return migrated;
}

async function migrateTtsProviders(db: DbContext): Promise<number> {
	const rows = await db.client.execute(
		`SELECT id, providers FROM tts_settings WHERE providers IS NOT NULL AND providers <> ''`,
	);
	let migrated = 0;
	for (const row of rows.rows as unknown as Record<string, unknown>[]) {
		const raw = row.providers;
		if (typeof raw !== "string") continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			continue;
		}
		if (!Array.isArray(parsed)) continue;

		let changed = false;
		const next = parsed.map((item) => {
			if (!item || typeof item !== "object") return item;
			const entry = item as Record<string, unknown>;
			const key = entry.api_key;
			if (typeof key !== "string" || !key || isEncryptedSecret(key))
				return entry;
			changed = true;
			return { ...entry, api_key: encryptSecret(key) };
		});
		if (!changed) continue;

		await db.client.execute({
			sql: `UPDATE tts_settings SET providers = ? WHERE id = ?`,
			args: [JSON.stringify(next), row.id as string],
		});
		migrated += 1;
	}
	return migrated;
}

async function migrateRemoteControlConfig(db: DbContext): Promise<number> {
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [REMOTE_CONTROL_CONFIG_KEY],
	});
	const value = rows.rows[0]?.value;
	if (typeof value !== "string" || !value || isEncryptedSecret(value)) return 0;

	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
		      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [REMOTE_CONTROL_CONFIG_KEY, String(encryptSecret(value)), Date.now()],
	});
	return 1;
}

/**
 * 把库里所有已知的明文凭证升级为密文。失败不影响启动：
 * 任何一项抛错都只记 warn，下次启动会重试（迁移幂等）。
 */
export async function migratePlaintextSecrets(
	db: DbContext,
	logger: Logger,
): Promise<void> {
	if (!isSecretEncryptionAvailable()) {
		logger.warn({
			msg: "safeStorage 不可用，跳过凭证加密迁移（敏感字段保持明文）",
			scope: "secret-vault",
		});
		return;
	}

	const tasks: Array<[string, () => Promise<number>]> = [
		["providers.api_key", () => migrateColumn(db, "providers", "api_key")],
		[
			"sync_config.webdav_password",
			() => migrateColumn(db, "sync_config", "webdav_password"),
		],
		["tts_settings.providers", () => migrateTtsProviders(db)],
		["remote.control.config", () => migrateRemoteControlConfig(db)],
	];

	const summary: Record<string, number> = {};
	for (const [name, run] of tasks) {
		try {
			const count = await run();
			if (count > 0) summary[name] = count;
		} catch (error) {
			logger.warn({
				msg: "凭证加密迁移失败（下次启动重试）",
				scope: "secret-vault",
				target: name,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	if (Object.keys(summary).length > 0) {
		logger.info({
			msg: "已将存量明文凭证升级为 safeStorage 密文",
			scope: "secret-vault",
			...summary,
		});
	}
}
