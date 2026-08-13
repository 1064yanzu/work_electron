/**
 * 版本 9：清理旧 FTS 索引 `note_chunks_fts` 及其三个触发器。
 *
 * v3 引入 trigram 的 `note_chunks_fts_v2` 之后，旧表只在「回填尚未完成」的窗口
 * 里作为读路径兜底。窗口关闭后它就是纯负担：每次 note_chunks 写入都要多维护
 * 一套倒排索引（写放大 ~2x + 一份全量磁盘占用）。
 *
 * 清理是**有条件**的 —— 只有 `app_config.fts_version = 2` 时才动手。
 * 因此本迁移对"还没跑完回填"的库是 no-op；那些库由 `kb/ftsRebuild.ts` 在回填
 * 完成的那一刻调用同一个函数收尾（见 `kb/ftsLegacyCleanup.ts` 的说明）。
 *
 * 本版本只做条件 DROP、没有独占新表，故不设哨兵表（同 v3 / v8 的处理方式）。
 */
import { dropLegacyFtsIfReady } from "../../kb/ftsLegacyCleanup";
import type { DbContext } from "../client";

export async function runV9Migrations(ctx: DbContext): Promise<void> {
	await dropLegacyFtsIfReady(ctx);
}
