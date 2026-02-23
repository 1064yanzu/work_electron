import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";

type BackupRow = Record<string, unknown>;

type BackupLogger = Pick<Logger, "info" | "warn" | "error">;

type ImportOptions = {
	overwrite: boolean;
	clearAllFirst: boolean;
};

const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
	overwrite: true,
	clearAllFirst: true,
};

const NOOP_LOGGER: BackupLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
};

const BACKUP_VERSION = "2.0.0";

// 仅包含真实业务数据表；FTS 虚表为派生数据，不直接备份。
const DEFAULT_BACKUP_TABLES = [
	"projects",
	"project_visits",
	"folders",
	"sources",
	"notes",
	"note_chunks",
	"note_chunk_embeddings",
	"providers",
	"app_config",
	"output_assets",
	"workflow_nodes",
	"workflow_run_logs",
	"sync_config",
	"backup_history",
	"cards",
	"themes",
	"file_themes",
	"agent_sessions",
	"agent_tasks",
	"agent_nodes",
	"agent_tool_calls",
	"agent_artifacts",
	"agent_messages",
	"agent_audit_logs",
	"agent_memories",
	"mcp_servers",
	"artifacts",
	"agent_checkpoints",
] as const;

const EXCLUDED_TABLES = new Set(["sqlite_sequence", "note_chunks_fts"]);

export type ImportCount = {
	projects: number;
	folders: number;
	sources: number;
	notes: number;
};

export type NormalizedBackupPayload = {
	version: string;
	mode: "snapshot" | "legacy";
	tables: Record<string, BackupRow[]>;
};

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
}

function ensureRowArray(value: unknown): BackupRow[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item) => item && typeof item === "object" && !Array.isArray(item))
		.map((item) => ({ ...(item as Record<string, unknown>) }));
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeSqlArg(
	value: unknown,
): string | number | bigint | Uint8Array | null {
	if (value === undefined || value === null) return null;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "bigint"
	) {
		return value;
	}
	if (typeof value === "boolean") {
		return value ? 1 : 0;
	}
	if (value instanceof Uint8Array) {
		return value;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	return JSON.stringify(value);
}

async function getExistingTables(db: DbContext): Promise<Set<string>> {
	const rows = await db.client.execute(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
	);
	return new Set(rows.rows.map((row) => String(row.name)));
}

async function getTableColumns(
	db: DbContext,
	table: string,
	cache: Map<string, string[]>,
): Promise<string[]> {
	const cached = cache.get(table);
	if (cached) return cached;
	const rows = await db.client.execute(`PRAGMA table_info(${quoteIdentifier(table)})`);
	const cols = rows.rows
		.map((row) => String(row.name || ""))
		.filter((name) => name.length > 0);
	cache.set(table, cols);
	return cols;
}

function withFallback(
	tables: Record<string, BackupRow[]>,
	table: string,
	...candidates: unknown[]
): void {
	if ((tables[table]?.length ?? 0) > 0) return;
	for (const candidate of candidates) {
		const rows = ensureRowArray(candidate);
		if (rows.length > 0) {
			tables[table] = rows;
			return;
		}
	}
}

// 大表分批导出时的批次大小
const LARGE_TABLE_BATCH_SIZE = 500;
// 行数超过此阈值的表将使用分批导出
const LARGE_TABLE_THRESHOLD = 1000;

export async function collectFullBackupPayload(
	db: DbContext,
): Promise<Record<string, unknown>> {
	const existingTables = await getExistingTables(db);
	const tables: Record<string, BackupRow[]> = {};

	for (const table of DEFAULT_BACKUP_TABLES) {
		if (!existingTables.has(table)) {
			continue;
		}

		// 先查行数，决定是全量还是分批导出
		const countResult = await db.client.execute(
			`SELECT COUNT(1) AS c FROM ${quoteIdentifier(table)}`,
		);
		const rowCount = Number((countResult.rows[0] as any)?.c ?? 0);

		if (rowCount <= LARGE_TABLE_THRESHOLD) {
			// 小表全量导出
			const rows = await db.client.execute(`SELECT * FROM ${quoteIdentifier(table)}`);
			tables[table] = rows.rows.map((row) => ({ ...(row as BackupRow) }));
		} else {
			// 大表分批导出，降低内存峰值
			const allRows: BackupRow[] = [];
			let offset = 0;
			for (;;) {
				const batch = await db.client.execute({
					sql: `SELECT * FROM ${quoteIdentifier(table)} LIMIT ? OFFSET ?`,
					args: [LARGE_TABLE_BATCH_SIZE, offset],
				});
				if (batch.rows.length === 0) break;
				for (const row of batch.rows) {
					allRows.push({ ...(row as BackupRow) });
				}
				offset += batch.rows.length;
				if (batch.rows.length < LARGE_TABLE_BATCH_SIZE) break;
			}
			tables[table] = allRows;
		}
	}

	return {
		version: BACKUP_VERSION,
		exported_at: Date.now(),
		db_snapshot: { tables },
		// 兼容旧前端读取字段
		projects: tables.projects ?? [],
		folders: tables.folders ?? [],
		sources: tables.sources ?? [],
		notes: tables.notes ?? [],
		note_chunks: tables.note_chunks ?? [],
		providers: tables.providers ?? [],
		app_config: tables.app_config ?? [],
		output_assets: tables.output_assets ?? [],
		outputs: tables.output_assets ?? [],
		sync_config: tables.sync_config ?? [],
	};
}

export function normalizeBackupPayload(raw: unknown): NormalizedBackupPayload {
	const root = asRecord(raw);
	const data = asRecord(root.data);
	const snapshot = asRecord(root.db_snapshot);
	const snapshotTables = asRecord(snapshot.tables);
	const tables: Record<string, BackupRow[]> = {};
	const hasSnapshotTables = Object.keys(snapshotTables).length > 0;

	for (const [table, value] of Object.entries(snapshotTables)) {
		tables[table] = ensureRowArray(value);
	}

	if (hasSnapshotTables) {
		for (const table of DEFAULT_BACKUP_TABLES) {
			withFallback(tables, table, data[table], root[table]);
		}
	} else {
		for (const table of DEFAULT_BACKUP_TABLES) {
			const rows = ensureRowArray(data[table] ?? root[table]);
			if (rows.length > 0) {
				tables[table] = rows;
			}
		}
	}

	// 兼容旧格式字段
	withFallback(
		tables,
		"projects",
		data.projects,
		root.projects,
		data.project ? [data.project] : [],
		root.project ? [root.project] : [],
	);
	withFallback(
		tables,
		"app_config",
		data.app_config,
		root.app_config,
		data.configs,
		root.configs,
	);
	withFallback(
		tables,
		"output_assets",
		data.output_assets,
		root.output_assets,
		data.outputs,
		root.outputs,
	);
	withFallback(tables, "sync_config", data.sync_config, root.sync_config);

	return {
		version: String(root.version ?? data.version ?? BACKUP_VERSION),
		mode: hasSnapshotTables ? "snapshot" : "legacy",
		tables,
	};
}

export async function importNormalizedBackupPayload(
	db: DbContext,
	normalized: NormalizedBackupPayload,
	options?: Partial<ImportOptions>,
	logger?: BackupLogger,
): Promise<{ importedCount: ImportCount }> {
	const mergedOptions: ImportOptions = {
		...DEFAULT_IMPORT_OPTIONS,
		...(options || {}),
	};
	const effectiveLogger = logger ?? NOOP_LOGGER;

	const hasAnyRows = Object.values(normalized.tables).some(
		(rows) => Array.isArray(rows) && rows.length > 0,
	);
	if (!normalized.version || !hasAnyRows) {
		throw new Error("Invalid import file format");
	}

	const existingTables = await getExistingTables(db);
	const backupTableSet = new Set<string>(
		normalized.mode === "snapshot"
			? [...DEFAULT_BACKUP_TABLES, ...Object.keys(normalized.tables)]
			: Object.keys(normalized.tables),
	);
	const targetTables = Array.from(backupTableSet).filter(
		(table) => existingTables.has(table) && !EXCLUDED_TABLES.has(table),
	);
	const tableColumnCache = new Map<string, string[]>();
	const insertedByTable: Record<string, number> = {};

	await db.client.execute("PRAGMA foreign_keys = OFF");
	await db.client.execute("BEGIN TRANSACTION");

	try {
		if (mergedOptions.clearAllFirst) {
			for (const table of [...targetTables].reverse()) {
				try {
					await db.client.execute(`DELETE FROM ${quoteIdentifier(table)}`);
				} catch (error) {
					effectiveLogger.warn({
						msg: "Clear table failed before full restore",
						table,
						error: String(error),
					});
				}
			}
		}

		for (const table of targetTables) {
			const rows = ensureRowArray(normalized.tables[table]);
			insertedByTable[table] = 0;

			if (rows.length === 0) continue;

			const columns = await getTableColumns(db, table, tableColumnCache);
			if (columns.length === 0) continue;

			const insertKeyword = mergedOptions.overwrite
				? "INSERT OR REPLACE"
				: "INSERT OR IGNORE";

			for (const row of rows) {
				const rowColumns = columns.filter((col) =>
					Object.prototype.hasOwnProperty.call(row, col),
				);
				if (rowColumns.length === 0) continue;

				const sql = `${insertKeyword} INTO ${quoteIdentifier(table)} (${rowColumns
					.map((col) => quoteIdentifier(col))
					.join(", ")}) VALUES (${rowColumns.map(() => "?").join(", ")})`;

				const args = rowColumns.map((col) => normalizeSqlArg(row[col]));

				await db.client.execute({ sql, args });
				insertedByTable[table] += 1;
			}
		}

		// 保底写入默认 sync_config 行，避免后续读取出现空配置。
		if (
			targetTables.includes("sync_config") &&
			(insertedByTable.sync_config ?? 0) === 0
		) {
			await db.client.execute(
				`INSERT OR IGNORE INTO sync_config (id) VALUES ('default')`,
			);
		}

		await db.client.execute("COMMIT");
	} catch (error) {
		await db.client.execute("ROLLBACK");
		throw error;
	} finally {
		await db.client.execute("PRAGMA foreign_keys = ON");
	}

	const importedCount: ImportCount = {
		projects: insertedByTable.projects ?? 0,
		folders: insertedByTable.folders ?? 0,
		sources: insertedByTable.sources ?? 0,
		notes: insertedByTable.notes ?? 0,
	};

	effectiveLogger.info({
		msg: "Full backup imported",
		importedCount,
	});

	return { importedCount };
}

export async function importBackupPayload(
	db: DbContext,
	raw: unknown,
	options?: Partial<ImportOptions>,
	logger?: BackupLogger,
): Promise<{ importedCount: ImportCount }> {
	const normalized = normalizeBackupPayload(raw);
	return await importNormalizedBackupPayload(db, normalized, options, logger);
}
