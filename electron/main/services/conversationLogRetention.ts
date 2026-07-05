/**
 * conversations 审计日志轮转（B4）
 *
 * loggedFetch 会把对话级 HTTP 审计日志双写到 `logs/conversations/<yyyy-mm-dd>/<hh-mm>/<conversationId>/http.jsonl`，
 * winston 的 DailyRotateFile 只管 `logs/*.log`，不覆盖该子目录，长期使用会无界增长。
 *
 * 策略：保留 14 天，按文件 mtime 判断过期；删完文件后自底向上清掉空目录。
 * 目录来源复用 loggedFetch 的 getConversationsLogDir（与 logger 同源：
 * 开发 <repo>/logs，生产 userData/logs），保证写入与清理指向同一位置。
 *
 * 调度：由 dbMaintenance 在应用启动后延迟触发一次（后台、不阻塞启动），
 * 并挂在其 24h 周期 tick 上，与 agentRetention 同一模式。
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { getConversationsLogDir } from "../http/utils/loggedFetch";
import type { Logger } from "../logging/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** conversations 审计日志保留天数 */
const CONVERSATION_LOG_RETENTION_DAYS = 14;

export interface ConversationLogCleanResult {
	removed_files: number;
	removed_bytes: number;
	retention_days: number;
}

interface ExpiredItem {
	path: string;
	size: number;
	isDir: boolean;
}

/** 递归收集过期文件（按 mtime）+ 所有目录（目录在删空后按需 rmdir） */
async function walkExpired(
	dir: string,
	cutoffMs: number,
): Promise<ExpiredItem[]> {
	const out: ExpiredItem[] = [];
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fsp.readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		try {
			if (entry.isDirectory()) {
				out.push(...(await walkExpired(full, cutoffMs)));
				// 目录本身作为候选：删除阶段仅在已空时 rmdir，不会误删仍有新日志的目录
				out.push({ path: full, size: 0, isDir: true });
			} else if (entry.isFile()) {
				const st = await fsp.stat(full);
				if (st.mtimeMs < cutoffMs) {
					out.push({ path: full, size: st.size, isDir: false });
				}
			}
		} catch {
			// 单个 entry 失败跳过
		}
	}
	return out;
}

/**
 * 清理过期的 conversations 审计日志。
 * 所有异常都在内部吞掉（只记 warn），保证后台调度安全。
 */
export async function cleanExpiredConversationLogs(
	logger?: Logger,
): Promise<ConversationLogCleanResult> {
	const result: ConversationLogCleanResult = {
		removed_files: 0,
		removed_bytes: 0,
		retention_days: CONVERSATION_LOG_RETENTION_DAYS,
	};
	try {
		const root = getConversationsLogDir();
		const cutoff = Date.now() - CONVERSATION_LOG_RETENTION_DAYS * DAY_MS;
		const items = await walkExpired(root, cutoff);
		// 先删文件，再删空目录（按路径深度倒序，子项先于父项）
		const ordered = [...items].sort((a, b) => b.path.length - a.path.length);
		for (const item of ordered) {
			try {
				if (item.isDir) {
					// 仅在目录已空时删除（非空时 rmdir 抛 ENOTEMPTY，忽略即可）
					await fsp.rmdir(item.path).catch(() => {});
				} else {
					await fsp.unlink(item.path);
					result.removed_files++;
					result.removed_bytes += item.size;
				}
			} catch {
				// 单个删除失败跳过
			}
		}
		if (result.removed_files > 0) {
			logger?.info({
				msg: "Conversation log retention cleanup completed",
				removed_files: result.removed_files,
				removed_bytes: result.removed_bytes,
				retention_days: CONVERSATION_LOG_RETENTION_DAYS,
			});
		}
	} catch (err) {
		logger?.warn({
			msg: "Conversation log retention cleanup failed",
			error: err instanceof Error ? err.message : String(err),
		});
	}
	return result;
}
