/**
 * 凭证保险库 —— 用 Electron `safeStorage` 加密落库的敏感字段。
 *
 * ## 存储格式
 *
 * 密文统一写成 `enc:v1:<base64>`，其中 base64 是 `safeStorage.encryptString()`
 * 返回的 Buffer。带前缀的好处是解密出口可以做到**幂等**：读到明文原样返回，
 * 读到密文才解。因此可以在所有读取点无脑套 `decryptSecret()`，不需要先判断
 * 这一行有没有被迁移过。
 *
 * ## 降级策略
 *
 * `safeStorage.isEncryptionAvailable()` 在部分 Linux 桌面环境（没有 keyring）
 * 会返回 false。此时 `encryptSecret()` 原样返回明文并记一条 warn —— 宁可退回
 * 到加密前的行为，也不能让用户的 API key 写不进去。
 *
 * ## 跨设备可移植性
 *
 * safeStorage 的密钥是**本机绑定**的，密文换台机器解不开。所以 WebDAV / 本地
 * 备份的导出路径必须先解密成明文再写进备份文件（见 `services/backupPayload.ts`
 * 的 `decryptSecretColumns`），导入时再重新加密。这样备份文件的内容与加密前
 * 完全一致，跨设备恢复的行为不变。
 */
import { safeStorage } from "electron";
import { createLogger } from "../logging/logger";

const PREFIX = "enc:v1:";

let warnedUnavailable = false;
let warnedDecryptFailure = false;

function logger() {
	return createLogger();
}

/** 当前进程是否具备真正的加密能力。 */
export function isSecretEncryptionAvailable(): boolean {
	try {
		return safeStorage.isEncryptionAvailable();
	} catch {
		return false;
	}
}

/** 值是否已经是本模块产出的密文。 */
export function isEncryptedSecret(value: unknown): value is string {
	return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * 加密一个敏感值。
 *
 * - 空值 / undefined 原样返回（不产生 `enc:v1:` 空壳，避免把"未配置"变成"已配置"）
 * - 已经是密文的原样返回（幂等，重复迁移安全）
 * - 加密不可用时返回明文
 */
export function encryptSecret<T extends string | null | undefined>(
	value: T,
): T | string {
	if (typeof value !== "string" || value.length === 0) return value;
	if (isEncryptedSecret(value)) return value;

	if (!isSecretEncryptionAvailable()) {
		if (!warnedUnavailable) {
			warnedUnavailable = true;
			logger().warn({
				msg: "safeStorage 不可用，敏感字段将以明文存储",
				scope: "secret-vault",
			});
		}
		return value;
	}

	try {
		const buf = safeStorage.encryptString(value);
		return PREFIX + buf.toString("base64");
	} catch (error) {
		logger().warn({
			msg: "敏感字段加密失败，回落明文存储",
			scope: "secret-vault",
			error: error instanceof Error ? error.message : String(error),
		});
		return value;
	}
}

/**
 * 解密一个敏感值。对明文幂等。
 *
 * 解密失败（典型场景：从别的设备恢复了密文备份）返回空串而不是抛错——
 * 调用方会把它当作"未配置"处理并提示用户重新填写，比整条链路崩掉体验好。
 */
export function decryptSecret<T extends string | null | undefined>(
	value: T,
): T | string {
	if (typeof value !== "string" || value.length === 0) return value;
	if (!isEncryptedSecret(value)) return value;

	try {
		const buf = Buffer.from(value.slice(PREFIX.length), "base64");
		return safeStorage.decryptString(buf);
	} catch (error) {
		if (!warnedDecryptFailure) {
			warnedDecryptFailure = true;
			logger().warn({
				msg: "敏感字段解密失败（密文可能来自其他设备），已按未配置处理，请在设置面板重新填写",
				scope: "secret-vault",
				error: error instanceof Error ? error.message : String(error),
			});
		}
		return "";
	}
}

/** 表 → 需要加解密的列。备份导出/导入与启动迁移共用这份清单。 */
export const SECRET_COLUMNS: Readonly<Record<string, readonly string[]>> = {
	providers: ["api_key"],
	sync_config: ["webdav_password"],
};

/**
 * `app_config` 是 key/value 表，敏感内容按 key 判定而不是按列。
 * 这里列的是整块 value 都要加密的 key（远控配置里有飞书 appSecret 与各 IM token）。
 */
const SECRET_APP_CONFIG_KEYS = new Set<string>(["remote.control.config"]);

type Transform = (value: string) => string;

function mapSecretCells(
	table: string,
	rows: Record<string, unknown>[],
	shouldTransform: (value: unknown) => boolean,
	transform: Transform,
): Record<string, unknown>[] {
	if (rows.length === 0) return rows;

	if (table === "app_config") {
		return rows.map((row) => {
			if (!SECRET_APP_CONFIG_KEYS.has(String(row.key ?? ""))) return row;
			if (!shouldTransform(row.value)) return row;
			return { ...row, value: transform(String(row.value)) };
		});
	}

	const columns = SECRET_COLUMNS[table];
	if (!columns) return rows;
	return rows.map((row) => {
		let next: Record<string, unknown> | null = null;
		for (const column of columns) {
			if (!shouldTransform(row[column])) continue;
			next ??= { ...row };
			next[column] = transform(String(row[column]));
		}
		return next ?? row;
	});
}

/**
 * 解密一批行对象的敏感字段（用于备份导出）。
 *
 * safeStorage 的密钥本机绑定，密文换台机器解不开。备份文件必须落明文，
 * 才能保持"换设备恢复后 API key 还能用"这个加密改造前就有的行为。
 */
export function decryptSecretColumns(
	table: string,
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	return mapSecretCells(
		table,
		rows,
		(value) => isEncryptedSecret(value),
		(value) => String(decryptSecret(value)),
	);
}

/** 加密一批行对象的敏感字段（用于备份导入，把明文备份重新纳入保险库）。 */
export function encryptSecretColumns(
	table: string,
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	return mapSecretCells(
		table,
		rows,
		(value) =>
			typeof value === "string" &&
			value.length > 0 &&
			!isEncryptedSecret(value),
		(value) => String(encryptSecret(value)),
	);
}

/** 该表是否含有需要加解密处理的字段。 */
export function tableHasSecrets(table: string): boolean {
	return table === "app_config" || table in SECRET_COLUMNS;
}
