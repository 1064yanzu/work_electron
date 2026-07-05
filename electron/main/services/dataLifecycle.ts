/**
 * D3+D6+D10 数据生命周期治理 —— 由 dbMaintenance 24h tick 调度。
 *
 * 覆盖：
 * - D3 孤儿清理：artifacts / agent_checkpoints 无外键，会话删除后可能残留行 + 文件，
 *   这里按「session 已不存在」兜底清扫（过期产物 / 过期 checkpoint 也一并清理）。
 * - D6 软删物理清除：sources / output_assets 的 is_deleted=1 行超过保留期后物理删除，
 *   连带 note_chunks（FTS 由触发器自动维护）/ note_chunk_embeddings（外键级联）与 storage 文件。
 *   保留期读 app_config `soft_delete_retention_days`（默认 30 天，0 = 永不清除）。
 * - D6 vault trash：`<vault_root>/.ipo-workbench/trash` 内条目 30 天后物理删除。
 * - D6 本地备份修剪：按 sync_config.local_backup_max_count 删最旧备份（兜底）。
 * - D10 访问记录：project_visits / reader_sessions 保留 90 天。
 *
 * 硬规则：每个步骤独立 try/catch，失败只 warn，绝不影响主流程；删除量记 info 日志。
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import {
	cleanupExpiredCheckpoints,
	cleanupOrphanCheckpoints,
} from "../ipc/handlers/agentCheckpoint";
import {
	cleanupExpiredArtifacts,
	cleanupOrphanArtifacts,
} from "../ipc/handlers/artifacts";
import { pruneLocalBackups } from "../ipc/handlers/localBackup";
import { getStorageSettings } from "../storage/settings";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 软删除默认保留天数（0 = 永不物理清除） */
const DEFAULT_SOFT_DELETE_RETENTION_DAYS = 30;
export const SOFT_DELETE_RETENTION_CONFIG_KEY = "soft_delete_retention_days";

/** vault 回收站保留天数 */
const VAULT_TRASH_RETENTION_DAYS = 30;

/** project_visits / reader_sessions 保留天数 */
const VISIT_LOG_RETENTION_DAYS = 90;

/** agent_checkpoints 过期保留天数（与 agent_checkpoint_cleanup IPC 默认值一致） */
const CHECKPOINT_RETENTION_DAYS = 7;

/** 读取软删除保留天数；>=0 的整数有效，0 表示永不清除 */
async function getSoftDeleteRetentionDays(db: DbContext): Promise<number> {
	try {
		const rows = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = ?`,
			args: [SOFT_DELETE_RETENTION_CONFIG_KEY],
		});
		const raw = rows.rows[0]?.value;
		if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
			const n = Number(raw);
			if (Number.isFinite(n) && n >= 0) return Math.floor(n);
		}
	} catch {
		// 读取失败用默认值
	}
	return DEFAULT_SOFT_DELETE_RETENTION_DAYS;
}

/**
 * D6：物理清除超过保留期的软删 sources。
 * note_chunks 直接 DELETE（FTS 由触发器维护，note_chunk_embeddings 外键级联）；
 * notes 由 sources 外键级联删除；storage 文件直接 unlink（保留期即安全窗口）。
 */
async function purgeSoftDeletedSources(
	db: DbContext,
	cutoff: number,
	logger?: Logger,
): Promise<{ purged: number; filesRemoved: number }> {
	const rows = await db.client.execute({
		sql: `SELECT id, storage_path FROM sources WHERE is_deleted = 1 AND updated_at < ?`,
		args: [cutoff],
	});

	let purged = 0;
	let filesRemoved = 0;
	for (const row of rows.rows) {
		const id = row.id as string;
		const storagePath = row.storage_path as string | null;

		if (storagePath) {
			try {
				await fs.unlink(storagePath);
				filesRemoved++;
			} catch {
				// 文件可能已不存在或被移入 trash，忽略
			}
		}

		try {
			// 显式删 chunks：FTS 由触发器（含并行的 v2 触发器）自动维护，不手写 FTS 删除语句
			await db.client.execute({
				sql: `DELETE FROM note_chunks WHERE source_id = ? OR note_id IN (SELECT id FROM notes WHERE source_id = ?)`,
				args: [id, id],
			});
			await db.client.execute({
				sql: `DELETE FROM sources WHERE id = ?`,
				args: [id],
			});
			purged++;
		} catch (err) {
			logger?.warn({
				msg: "Soft-delete purge: source row delete failed",
				source_id: id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
	return { purged, filesRemoved };
}

/** D6：物理清除超过保留期的软删 output_assets（含 storage 文件）。 */
async function purgeSoftDeletedOutputs(
	db: DbContext,
	cutoff: number,
	logger?: Logger,
): Promise<{ purged: number; filesRemoved: number }> {
	const rows = await db.client.execute({
		sql: `SELECT id, storage_path FROM output_assets WHERE is_deleted = 1 AND updated_at < ?`,
		args: [cutoff],
	});

	let purged = 0;
	let filesRemoved = 0;
	for (const row of rows.rows) {
		const id = row.id as string;
		const storagePath = row.storage_path as string | null;

		if (storagePath) {
			try {
				await fs.unlink(storagePath);
				filesRemoved++;
			} catch {
				// 忽略
			}
		}

		try {
			await db.client.execute({
				sql: `DELETE FROM output_assets WHERE id = ?`,
				args: [id],
			});
			purged++;
		} catch (err) {
			logger?.warn({
				msg: "Soft-delete purge: output row delete failed",
				output_id: id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
	return { purged, filesRemoved };
}

/**
 * D6：清空超期的 vault 回收站条目。
 * 条目由 storage/sync.ts 的 moveFileToVaultTrash 写入，文件名前缀是写入时的时间戳
 * （`<Date.now()>-<name>`）；没有前缀的退回用 mtime 判断。
 */
async function purgeVaultTrash(
	db: DbContext,
	logger?: Logger,
): Promise<number> {
	let trashDir: string;
	try {
		const settings = await getStorageSettings(db);
		trashDir = path.join(settings.vault_root, ".ipo-workbench", "trash");
	} catch {
		return 0;
	}

	let entries: string[];
	try {
		entries = await fs.readdir(trashDir);
	} catch {
		// trash 目录不存在
		return 0;
	}

	const cutoff = Date.now() - VAULT_TRASH_RETENTION_DAYS * DAY_MS;
	let removed = 0;
	for (const name of entries) {
		const fullPath = path.join(trashDir, name);
		let trashedAt: number | null = null;

		const match = /^(\d{10,})-/.exec(name);
		if (match) {
			const n = Number(match[1]);
			if (Number.isFinite(n)) trashedAt = n;
		}
		if (trashedAt === null) {
			try {
				trashedAt = (await fs.stat(fullPath)).mtimeMs;
			} catch {
				continue;
			}
		}

		if (trashedAt < cutoff) {
			try {
				await fs.rm(fullPath, { recursive: true, force: true });
				removed++;
			} catch (err) {
				logger?.warn({
					msg: "Vault trash purge: remove entry failed",
					entry: name,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}
	return removed;
}

/** D10：project_visits / reader_sessions 只增不删 —— 按 90 天保留期修剪。 */
async function purgeVisitLogs(
	db: DbContext,
): Promise<{ projectVisits: number; readerSessions: number }> {
	const cutoff = Date.now() - VISIT_LOG_RETENTION_DAYS * DAY_MS;
	const visits = await db.client.execute({
		sql: `DELETE FROM project_visits WHERE visited_at < ?`,
		args: [cutoff],
	});
	const sessions = await db.client.execute({
		sql: `DELETE FROM reader_sessions WHERE started_at < ?`,
		args: [cutoff],
	});
	return {
		projectVisits: visits.rowsAffected ?? 0,
		readerSessions: sessions.rowsAffected ?? 0,
	};
}

/**
 * 数据生命周期清理总入口 —— dbMaintenance 启动延迟 + 24h tick 调用。
 * 每个步骤独立容错：单步失败只 warn，其余步骤继续，绝不抛出。
 */
export async function runDataLifecycleCleanup(
	db: DbContext,
	logger?: Logger,
): Promise<void> {
	const summary: Record<string, number> = {};

	const step = async (name: string, fn: () => Promise<number>) => {
		try {
			const count = await fn();
			if (count > 0) summary[name] = count;
		} catch (err) {
			logger?.warn({
				msg: "Data lifecycle step failed",
				step: name,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	};

	// D3：过期产物 + 孤儿产物（行 + 文件）
	await step("expired_artifacts", async () => {
		const r = await cleanupExpiredArtifacts(db);
		if (r.errors.length > 0) {
			logger?.warn({
				msg: "Expired artifact cleanup errors",
				errors: r.errors,
			});
		}
		return r.deleted_count;
	});
	await step("orphan_artifacts", async () => {
		const r = await cleanupOrphanArtifacts(db);
		if (r.errors.length > 0) {
			logger?.warn({ msg: "Orphan artifact cleanup errors", errors: r.errors });
		}
		return r.deleted_count;
	});

	// D3：孤儿 + 过期 checkpoint
	await step("orphan_checkpoints", () => cleanupOrphanCheckpoints(db));
	await step("expired_checkpoints", () =>
		cleanupExpiredCheckpoints(db, CHECKPOINT_RETENTION_DAYS),
	);

	// D6：软删物理清除（0 = 永不清除）
	const retentionDays = await getSoftDeleteRetentionDays(db);
	if (retentionDays > 0) {
		const cutoff = Date.now() - retentionDays * DAY_MS;
		await step("purged_sources", async () => {
			const r = await purgeSoftDeletedSources(db, cutoff, logger);
			if (r.filesRemoved > 0) summary.purged_source_files = r.filesRemoved;
			return r.purged;
		});
		await step("purged_outputs", async () => {
			const r = await purgeSoftDeletedOutputs(db, cutoff, logger);
			if (r.filesRemoved > 0) summary.purged_output_files = r.filesRemoved;
			return r.purged;
		});
	}

	// D6：vault 回收站 30 天清空
	await step("vault_trash_removed", () => purgeVaultTrash(db, logger));

	// D10：访问记录 90 天保留
	await step("project_visits", async () => {
		const r = await purgeVisitLogs(db);
		if (r.readerSessions > 0) summary.reader_sessions = r.readerSessions;
		return r.projectVisits;
	});

	// D6：本地备份修剪兜底（内部自吞异常并记自己的日志）
	await step("local_backups_pruned", async () => {
		const r = await pruneLocalBackups(db, logger);
		return r.deleted;
	});

	if (Object.keys(summary).length > 0) {
		logger?.info({
			msg: "Data lifecycle cleanup completed",
			soft_delete_retention_days: retentionDays,
			...summary,
		});
	}
}
