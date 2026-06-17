/**
 * Agent 数据保留策略
 *
 * 定期清理过期的 agent_sessions 及其级联数据（tasks, messages, checkpoints）。
 * 默认保留最近 90 天的会话，用户可在设置面板自行调整。
 *
 * 注意：agent_tasks / agent_messages / agent_checkpoints 表均以 ON DELETE CASCADE
 * 外键引用 agent_sessions，因此只需 DELETE 会话即可级联清理所有关联数据。
 */

import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 默认保留天数 */
const DEFAULT_RETENTION_DAYS = 90;

/** 扫描结果 */
export interface AgentRetentionScanResult {
	expired_sessions: number;
	total_sessions: number;
	retention_days: number;
	cutoff_date: string;
}

/** 清理结果 */
export interface AgentRetentionCleanResult {
	deleted_sessions: number;
	retention_days: number;
}

/** 从 app_config 读取保留天数 */
async function getRetentionDays(db: DbContext): Promise<number> {
	try {
		const rows = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = 'agent.retention_days'`,
			args: [],
		});
		if (rows.rows.length > 0) {
			const val = Number(rows.rows[0]?.value);
			if (Number.isFinite(val) && val >= 7) {
				return Math.floor(val);
			}
		}
	} catch {
		// ignore, use default
	}
	return DEFAULT_RETENTION_DAYS;
}

/** 扫描过期的 agent 会话 */
export async function scanExpiredAgentSessions(
	db: DbContext,
): Promise<AgentRetentionScanResult> {
	const retentionDays = await getRetentionDays(db);
	const cutoff = Date.now() - retentionDays * DAY_MS;

	const [expiredResult, totalResult] = await Promise.all([
		db.client.execute({
			sql: `SELECT COUNT(1) AS c FROM agent_sessions WHERE updated_at < ?`,
			args: [cutoff],
		}),
		db.client.execute({
			sql: `SELECT COUNT(1) AS c FROM agent_sessions`,
			args: [],
		}),
	]);

	return {
		expired_sessions: Number((expiredResult.rows[0] as any)?.c ?? 0),
		total_sessions: Number((totalResult.rows[0] as any)?.c ?? 0),
		retention_days: retentionDays,
		cutoff_date: new Date(cutoff).toISOString().slice(0, 10),
	};
}

/**
 * 清理过期的 agent 会话（及其级联数据）。
 * 不删除仍处于 active/running 状态的会话。
 */
export async function cleanExpiredAgentSessions(
	db: DbContext,
	logger?: Logger,
): Promise<AgentRetentionCleanResult> {
	const retentionDays = await getRetentionDays(db);
	const cutoff = Date.now() - retentionDays * DAY_MS;

	// 跳过仍在运行中的会话
	const result = await db.client.execute({
		sql: `DELETE FROM agent_sessions
		      WHERE updated_at < ?
		      AND status NOT IN ('active', 'running')`,
		args: [cutoff],
	});

	const deleted = result.rowsAffected ?? 0;

	if (deleted > 0) {
		logger?.info({
			msg: "Agent retention cleanup completed",
			deleted_sessions: deleted,
			retention_days: retentionDays,
		});
	}

	return { deleted_sessions: deleted, retention_days: retentionDays };
}
