/**
 * WebDAV 自动同步 —— 增量导出、水位管理与分块序列化
 *
 * 【B8 增量化】设计说明（详见 docs/webdav接口文档.md「增量包格式与基线策略」章节）：
 *
 * 1. 水位增量：为每张参与同步的表维护 last_sync_watermark（基于 updated_at 列），
 *    持久化在 app_config 表（key = `autosync_watermark_<table>`）。每个增量周期
 *    仅导出 `updated_at > 水位` 的变更行。
 *    - 没有 updated_at 列的表（project_visits / sync_config /
 *      backup_history / file_themes / agent_artifacts / agent_audit_logs / artifacts 等）
 *      无法做水位比较，**退化为全量导出**（这些表体量普遍很小，代价可接受）。
 *      列存在性通过 PRAGMA table_info 运行时探测，不硬编码。
 *
 * 2. 周期性全量基线：每 FULL_BASELINE_MAX_INCREMENTS 次增量、或距上次全量超过
 *    FULL_BASELINE_MAX_AGE_MS，强制打一次全量包（格式与现有全量备份完全一致），
 *    保证 WebDAV 端可以从「基线 + 之后的增量」重建完整数据。
 *
 * 3. 删除语义：软删表（带 is_deleted 且更新 updated_at）的删除会被水位自然捕捉；
 *    **物理删除无法被水位捕捉**（行没了，不会出现在任何增量里），由周期性
 *    全量基线兜底 —— 这也是必须保留基线策略的核心原因之一。
 *
 * 4. 兼容性底线：现有恢复 / 文件列表 / 自动清理路径只认 `backup_*.zip` 全量包
 *    （BackupManager.listWebdavFiles、BackupHistoryManager.cleanupOldWebdavBackups
 *    均按 `.zip` 后缀过滤）。增量包命名为 `incr_<deviceId>_<ts>.json`，对这些
 *    路径完全不可见 —— **恢复功能只使用全量包，增量仅作上行备份优化**。
 *    增量包的远端清理由 cleanupStaleIncrementals 在每次新基线成功后自行完成。
 *
 * 5. 水位安全边界：新水位 = min(本轮导出行的最大 updated_at, 导出开始时间 - 2s)。
 *    向后压 2 秒制造少量重复导出（幂等、安全），避免同毫秒并发写入被漏掉。
 */
import type { DbContext } from "../db/client";
import { BACKUP_VERSION, DEFAULT_BACKUP_TABLES } from "./backupPayload";
import { WebDavService, type WebDavConfig } from "./WebDavService";

// ============ 常量 ============

export const INCREMENTAL_FORMAT = "ipo-webdav-incremental";
export const INCREMENTAL_FORMAT_VERSION = "1.0";

/** 每打满 N 次增量后强制一次全量基线 */
const FULL_BASELINE_MAX_INCREMENTS = 24;
/** 距上次全量基线超过该时长则强制全量（7 天） */
const FULL_BASELINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** 水位安全边界：防止同毫秒写入竞态漏行，宁可少量重复导出 */
const WATERMARK_SAFETY_MS = 2000;
/** 增量查询分批大小（与 backupPayload 的批量导出保持同数量级） */
const INCREMENTAL_BATCH_SIZE = 500;

/** app_config 中的水位 / 基线元数据 key */
const WATERMARK_KEY_PREFIX = "autosync_watermark_";
const KEY_INCR_COUNT = "autosync_incr_count";
const KEY_LAST_FULL_AT = "autosync_last_full_at";
const KEY_LAST_FULL_FILE = "autosync_last_full_file";

// ============ 类型 ============

export type BackupMode = "full" | "incremental";

export type IncrementalCollectResult = {
	/** 增量包 payload（可直接 stringify 上传） */
	payload: Record<string, unknown>;
	/** 本轮各水位表的新水位（上传成功后才提交） */
	newWatermarks: Record<string, number>;
	/** 水位表实际导出的变更行数（为 0 时调用方可跳过上传） */
	changedRowCount: number;
};

type BackupRow = Record<string, unknown>;

// ============ 基础工具 ============

/** 让出事件循环，避免长任务阻塞主进程（批间 / 表间调用） */
export function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}

async function getExistingTables(db: DbContext): Promise<Set<string>> {
	const rows = await db.client.execute(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
	);
	return new Set(rows.rows.map((row) => String(row.name)));
}

/** 运行时探测表是否有 updated_at 列（进程内缓存，schema 运行期不变） */
const updatedAtColumnCache = new Map<string, boolean>();

async function tableHasUpdatedAt(
	db: DbContext,
	table: string,
): Promise<boolean> {
	const cached = updatedAtColumnCache.get(table);
	if (cached !== undefined) return cached;
	const rows = await db.client.execute(
		`PRAGMA table_info(${quoteIdentifier(table)})`,
	);
	const has = rows.rows.some((row) => String(row.name) === "updated_at");
	updatedAtColumnCache.set(table, has);
	return has;
}

// ============ app_config 配置读写（复用现有 key/value 配置表，不改 schema） ============

async function getConfigValue(
	db: DbContext,
	key: string,
): Promise<string | null> {
	const result = await db.client.execute({
		sql: "SELECT value FROM app_config WHERE key = ?",
		args: [key],
	});
	if (result.rows.length === 0) return null;
	return result.rows[0].value as string;
}

async function setConfigValue(
	db: DbContext,
	key: string,
	value: string,
): Promise<void> {
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [key, value, Date.now()],
	});
}

async function getConfigNumber(db: DbContext, key: string): Promise<number> {
	const raw = await getConfigValue(db, key);
	const n = raw === null ? Number.NaN : Number(raw);
	return Number.isFinite(n) ? n : 0;
}

/** 读取全部表水位 */
export async function readWatermarks(
	db: DbContext,
): Promise<Record<string, number>> {
	const result = await db.client.execute({
		sql: "SELECT key, value FROM app_config WHERE key LIKE ?",
		args: [`${WATERMARK_KEY_PREFIX}%`],
	});
	const watermarks: Record<string, number> = {};
	for (const row of result.rows) {
		const table = String(row.key).slice(WATERMARK_KEY_PREFIX.length);
		const value = Number(row.value);
		if (table && Number.isFinite(value)) {
			watermarks[table] = value;
		}
	}
	return watermarks;
}

// ============ 备份模式决策 ============

/**
 * 决定本轮打全量基线还是增量包。
 * - manual：用户显式触发，始终全量（用户预期是「立刻得到一份可恢复的完整备份」）
 * - 从未打过基线 → 全量
 * - 增量次数打满 / 基线过期（>7 天）→ 全量（兜底物理删除 + 控制增量链长度）
 * - 其余（startup / scheduled / change）→ 增量
 */
export async function decideBackupMode(
	db: DbContext,
	trigger: "startup" | "scheduled" | "change" | "manual",
): Promise<BackupMode> {
	if (trigger === "manual") return "full";

	const lastFullAt = await getConfigNumber(db, KEY_LAST_FULL_AT);
	if (lastFullAt <= 0) return "full";

	const incrCount = await getConfigNumber(db, KEY_INCR_COUNT);
	if (incrCount >= FULL_BASELINE_MAX_INCREMENTS) return "full";

	if (Date.now() - lastFullAt > FULL_BASELINE_MAX_AGE_MS) return "full";

	return "incremental";
}

// ============ 水位提交 ============

/**
 * 全量基线成功后：刷新全部水位、重置增量计数、记录基线时间与文件名。
 * @param exportStartTs 导出开始时刻（水位不会超过 exportStartTs - 安全边界）
 */
export async function commitFullBaseline(
	db: DbContext,
	exportStartTs: number,
	fileName: string,
	excludeTables: readonly string[],
): Promise<void> {
	const excluded = new Set(excludeTables);
	const existingTables = await getExistingTables(db);
	const cap = exportStartTs - WATERMARK_SAFETY_MS;

	for (const table of DEFAULT_BACKUP_TABLES) {
		if (!existingTables.has(table) || excluded.has(table)) continue;
		if (!(await tableHasUpdatedAt(db, table))) continue;

		const result = await db.client.execute(
			`SELECT MAX(updated_at) AS m FROM ${quoteIdentifier(table)}`,
		);
		const maxUpdatedAt = Number(result.rows[0]?.m ?? 0) || 0;
		// 水位 = min(表内最大 updated_at, 导出开始 - 2s)：
		// 导出期间的新写入会落在下一个增量里，而不是被水位跳过。
		const watermark = Math.min(maxUpdatedAt, cap);
		await setConfigValue(
			db,
			`${WATERMARK_KEY_PREFIX}${table}`,
			String(Math.max(watermark, 0)),
		);
	}

	await setConfigValue(db, KEY_INCR_COUNT, "0");
	await setConfigValue(db, KEY_LAST_FULL_AT, String(exportStartTs));
	await setConfigValue(db, KEY_LAST_FULL_FILE, fileName);
}

/** 增量包上传成功后：提交新水位并递增计数（失败不提交 → 下轮自动重导，幂等） */
export async function commitIncrementalWatermarks(
	db: DbContext,
	newWatermarks: Record<string, number>,
): Promise<void> {
	for (const [table, watermark] of Object.entries(newWatermarks)) {
		await setConfigValue(
			db,
			`${WATERMARK_KEY_PREFIX}${table}`,
			String(watermark),
		);
	}
	const count = await getConfigNumber(db, KEY_INCR_COUNT);
	await setConfigValue(db, KEY_INCR_COUNT, String(count + 1));
}

// ============ 增量导出 ============

/**
 * 收集增量包 payload。
 * - 有 updated_at 的表：只导出 `updated_at > 水位` 的行（分批 + 批间让出事件循环）
 * - 无 updated_at 的表：退化为全量导出，归入 full_tables（见文件头说明第 1 条）
 */
export async function collectIncrementalPayload(
	db: DbContext,
	options: {
		deviceId: string;
		excludeTables: readonly string[];
	},
): Promise<IncrementalCollectResult> {
	const exportStartTs = Date.now();
	const excluded = new Set(options.excludeTables);
	const existingTables = await getExistingTables(db);
	const watermarks = await readWatermarks(db);

	const tables: Record<string, BackupRow[]> = {};
	const incrementalTables: string[] = [];
	const fullTables: string[] = [];
	const appliedWatermarks: Record<string, number> = {};
	const newWatermarks: Record<string, number> = {};
	let changedRowCount = 0;

	const watermarkCap = exportStartTs - WATERMARK_SAFETY_MS;

	for (const table of DEFAULT_BACKUP_TABLES) {
		if (!existingTables.has(table) || excluded.has(table)) continue;

		if (await tableHasUpdatedAt(db, table)) {
			const watermark = watermarks[table] ?? 0;
			appliedWatermarks[table] = watermark;

			const rows: BackupRow[] = [];
			let maxUpdatedAt = watermark;
			let offset = 0;
			for (;;) {
				const batch = await db.client.execute({
					sql: `SELECT * FROM ${quoteIdentifier(table)} WHERE updated_at > ? ORDER BY updated_at ASC LIMIT ? OFFSET ?`,
					args: [watermark, INCREMENTAL_BATCH_SIZE, offset],
				});
				if (batch.rows.length === 0) break;
				for (const row of batch.rows) {
					const record = { ...(row as BackupRow) };
					rows.push(record);
					const rowUpdatedAt = Number(record.updated_at) || 0;
					if (rowUpdatedAt > maxUpdatedAt) maxUpdatedAt = rowUpdatedAt;
				}
				offset += batch.rows.length;
				// 批间让出事件循环，避免大表增量阻塞主进程
				await yieldToEventLoop();
				if (batch.rows.length < INCREMENTAL_BATCH_SIZE) break;
			}

			if (rows.length > 0) {
				tables[table] = rows;
				incrementalTables.push(table);
				changedRowCount += rows.length;
			}
			// 新水位向后压 2s 安全边界（幂等重导优于漏行），且不回退
			newWatermarks[table] = Math.max(
				watermark,
				Math.min(maxUpdatedAt, watermarkCap),
			);
		} else {
			// 无 updated_at 列 → 无法水位比较，退化为全量导出。
			// 这些表（project_visits / sync_config / backup_history /
			// file_themes / agent_artifacts / agent_audit_logs / artifacts）体量普遍很小。
			const rows: BackupRow[] = [];
			let offset = 0;
			for (;;) {
				const batch = await db.client.execute({
					sql: `SELECT * FROM ${quoteIdentifier(table)} LIMIT ? OFFSET ?`,
					args: [INCREMENTAL_BATCH_SIZE, offset],
				});
				if (batch.rows.length === 0) break;
				for (const row of batch.rows) {
					rows.push({ ...(row as BackupRow) });
				}
				offset += batch.rows.length;
				await yieldToEventLoop();
				if (batch.rows.length < INCREMENTAL_BATCH_SIZE) break;
			}
			tables[table] = rows;
			fullTables.push(table);
		}
	}

	const baseVersion = await getConfigNumber(db, KEY_LAST_FULL_AT);
	const baseFile = await getConfigValue(db, KEY_LAST_FULL_FILE);

	const payload: Record<string, unknown> = {
		format: INCREMENTAL_FORMAT,
		format_version: INCREMENTAL_FORMAT_VERSION,
		backup_version: BACKUP_VERSION,
		device_id: options.deviceId,
		created_at: exportStartTs,
		// 基线元数据：恢复端（未来若支持增量重放）按 base_version/base_file 定位基线
		base_version: baseVersion,
		base_file: baseFile,
		watermarks: appliedWatermarks,
		new_watermarks: newWatermarks,
		incremental_tables: incrementalTables,
		full_tables: fullTables,
		tables,
	};

	return { payload, newWatermarks, changedRowCount };
}

// ============ 分块序列化（让出事件循环） ============

async function stringifyTablesChunked(
	tablesValue: Record<string, unknown>,
	cache: Map<unknown, string>,
): Promise<string> {
	const parts: string[] = [];
	for (const [name, rows] of Object.entries(tablesValue)) {
		if (rows === undefined) continue;
		let json: string | undefined;
		if (rows !== null && typeof rows === "object") {
			json = cache.get(rows);
		}
		if (json === undefined) {
			json = JSON.stringify(rows) ?? "null";
			if (rows !== null && typeof rows === "object") {
				cache.set(rows, json);
			}
		}
		parts.push(`${JSON.stringify(name)}:${json}`);
		// 表间让出事件循环：把一次整库 stringify 拆成 O(表数) 个小任务
		await yieldToEventLoop();
	}
	return `{${parts.join(",")}}`;
}

/**
 * 分块序列化备份 payload：顶层逐 key、db_snapshot.tables / tables 逐表 stringify，
 * 段间 setImmediate 让出事件循环，替代一次性的同步 JSON.stringify(整库)。
 *
 * 输出与 JSON.stringify(payload) 语义等价（紧凑格式、同枚举顺序、跳过 undefined），
 * 因此全量包字节格式与旧实现保持兼容。顶层的 legacy 别名字段（projects / outputs 等）
 * 与 db_snapshot.tables 内是同一数组引用，通过 cache 复用已序列化的字符串，
 * 避免同一大数组被 stringify 两次。
 */
export async function stringifyBackupPayloadChunked(
	payload: Record<string, unknown>,
): Promise<string> {
	const cache = new Map<unknown, string>();
	const parts: string[] = [];

	for (const [key, value] of Object.entries(payload)) {
		if (value === undefined) continue;
		let json: string;

		if (
			key === "db_snapshot" &&
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value)
		) {
			// db_snapshot: { tables: { <table>: rows[] } } —— 逐表序列化
			const snapshot = value as Record<string, unknown>;
			const snapshotParts: string[] = [];
			for (const [snapKey, snapValue] of Object.entries(snapshot)) {
				if (snapValue === undefined) continue;
				if (
					snapKey === "tables" &&
					snapValue !== null &&
					typeof snapValue === "object" &&
					!Array.isArray(snapValue)
				) {
					snapshotParts.push(
						`"tables":${await stringifyTablesChunked(
							snapValue as Record<string, unknown>,
							cache,
						)}`,
					);
				} else {
					snapshotParts.push(
						`${JSON.stringify(snapKey)}:${JSON.stringify(snapValue) ?? "null"}`,
					);
				}
			}
			json = `{${snapshotParts.join(",")}}`;
		} else if (
			key === "tables" &&
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value)
		) {
			// 增量包顶层 tables —— 同样逐表序列化
			json = await stringifyTablesChunked(
				value as Record<string, unknown>,
				cache,
			);
		} else {
			let cached: string | undefined;
			if (value !== null && typeof value === "object") {
				cached = cache.get(value);
			}
			if (cached !== undefined) {
				json = cached;
			} else {
				json = JSON.stringify(value) ?? "null";
				if (value !== null && typeof value === "object") {
					cache.set(value, json);
				}
				await yieldToEventLoop();
			}
		}

		parts.push(`${JSON.stringify(key)}:${json}`);
	}

	return `{${parts.join(",")}}`;
}

// ============ 增量包命名 / 远端清理 ============

/** 生成增量包文件名：incr_<deviceId>_<ts>.json（.json 后缀对恢复/清理路径不可见） */
export function generateIncrementalFileName(deviceId: string): string {
	const timestamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.split(".")[0];
	return `incr_${deviceId}_${timestamp}.json`;
}

/** 上传增量包（纯 JSON 直传，不走 zip 打包 / Data 目录拷贝流程） */
export async function uploadIncrementalPackage(
	webdavConfig: WebDavConfig,
	fileName: string,
	dataJson: string,
): Promise<void> {
	const webdavService = new WebDavService(webdavConfig);
	const result = await webdavService.putFileContents(fileName, dataJson, {
		overwrite: true,
	});
	if (result instanceof Error) {
		throw result;
	}
}

/**
 * 新基线成功后清理本设备旧增量包。
 * 现有 cleanupOldWebdavBackups 只处理 .zip，增量 .json 需要在此自行清理，
 * 否则会在 WebDAV 端无限累积。只删「早于新基线」的本设备增量文件 ——
 * 新基线已完整覆盖它们的内容。
 */
export async function cleanupStaleIncrementals(
	webdavConfig: WebDavConfig,
	deviceId: string,
	baselineTime: number,
): Promise<number> {
	const webdavService = new WebDavService(webdavConfig);
	const response = await webdavService.getDirectoryContents();
	const files = Array.isArray(response)
		? response
		: (response as { data: unknown[] }).data;

	const prefix = `incr_${deviceId}_`;
	let deletedCount = 0;

	for (const file of files as Array<{
		type: string;
		basename: string;
		lastmod: string;
	}>) {
		if (file.type !== "file") continue;
		if (!file.basename.startsWith(prefix) || !file.basename.endsWith(".json")) {
			continue;
		}
		const modified = new Date(file.lastmod).getTime();
		if (Number.isFinite(modified) && modified >= baselineTime) continue;

		try {
			await webdavService.deleteFile(file.basename);
			deletedCount++;
		} catch (error) {
			console.error(
				`[incrementalBackup] Failed to delete stale incremental ${file.basename}:`,
				error,
			);
		}
	}

	return deletedCount;
}
