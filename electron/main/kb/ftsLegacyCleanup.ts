/**
 * 旧 FTS 索引（`note_chunks_fts`，unicode61 分词）的清理。
 *
 * ## 背景
 *
 * v3 引入了 trigram 分词的 `note_chunks_fts_v2` 来修中文检索，但为了让存量库
 * 在回填完成前仍能搜索，旧表和它的三个触发器（`note_chunks_ai/ad/au`）被保留了
 * 下来。代价是**每次 note_chunks 写入都要同时维护两套 FTS 索引**：写放大约 2 倍，
 * 磁盘上多一份全量倒排。
 *
 * ## 为什么不能无条件 DROP
 *
 * 只有 `fts_version = 2`（回填完成、读路径已切到 v2）时旧表才真正没人用。
 * 回填是分批异步跑的，一台机器上可能启动了三次都还没跑完 —— 那三次都不能删。
 *
 * ## 两个触发时机
 *
 * 1. **v9 迁移**：覆盖"回填早就完成了、只是没人来收尾"的存量库。
 * 2. **回填完成的那一刻**（`runFtsBackfill` 末尾）：覆盖本次才刚跑完的库。
 *
 * 两处调用同一个幂等函数，谁先到谁清。
 */
import type { DbContext } from "../db/client";

type CleanupLogger = {
	info: (entry: Record<string, unknown>) => unknown;
	warn: (entry: Record<string, unknown>) => unknown;
};

const LEGACY_TABLE = "note_chunks_fts";
const LEGACY_TRIGGERS = ["note_chunks_ai", "note_chunks_ad", "note_chunks_au"];

/** 旧 FTS 表是否还在。读路径在 `fts_version = 1` 时依赖它。 */
export async function legacyFtsTableExists(db: DbContext): Promise<boolean> {
	try {
		const res = await db.client.execute({
			sql: `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
			args: [LEGACY_TABLE],
		});
		return res.rows.length > 0;
	} catch {
		// 查不出来就当它还在，宁可少删一次也不要误删读路径依赖的表
		return true;
	}
}

async function readFtsVersion(db: DbContext): Promise<number> {
	try {
		const res = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = 'fts_version'`,
		});
		const raw = (res.rows[0] as Record<string, unknown> | undefined)?.value;
		const n = Number(raw ?? 1);
		return Number.isFinite(n) ? n : 1;
	} catch {
		return 1;
	}
}

/**
 * 回填已完成时清掉旧 FTS 表与触发器。幂等；任何一步失败都只记 warn，
 * 下次启动（或下次回填完成）会重试。
 *
 * @returns 是否真的执行了清理
 */
export async function dropLegacyFtsIfReady(
	db: DbContext,
	logger?: CleanupLogger,
): Promise<boolean> {
	try {
		if ((await readFtsVersion(db)) !== 2) return false;
		if (!(await legacyFtsTableExists(db))) return false;

		// 先删触发器再删表：触发器体里引用了 note_chunks_fts，
		// 反过来做会在某些 SQLite 版本上留下悬空触发器
		for (const trigger of LEGACY_TRIGGERS) {
			await db.client.execute(`DROP TRIGGER IF EXISTS ${trigger}`);
		}
		await db.client.execute(`DROP TABLE IF EXISTS ${LEGACY_TABLE}`);

		logger?.info({
			msg: "已清理旧 FTS 索引（note_chunks_fts + 三个触发器），note_chunks 写入不再双写",
			scope: "kb",
		});
		return true;
	} catch (error) {
		logger?.warn({
			msg: "清理旧 FTS 索引失败（下次启动重试）",
			scope: "kb",
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}
