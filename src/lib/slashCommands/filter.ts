/**
 * Claude Code 风格斜杠命令 —— 过滤器（matchFilter）。
 *
 * 任务：T1.4。
 *
 * 约束：
 * - 输入来自 `registry.listIndexed(ctx)` 的 {@link IndexedCommand}，已在注册时
 *   冻结好 `lowerId/lowerName/lowerDesc`，本文件热路径不再做 `toLowerCase()`。
 * - 排序语义严格三段式（id-prefix > name-prefix > substring），命中分数越高越靠前；
 *   分数相同时**保持 registry 稳定排序**（即输入数组中的相对顺序）—— 使用
 *   `Array#sort` 的稳定排序特性（V8 在 Node ≥ 12 上为稳定排序）。
 * - 零外部依赖；纯函数，便于 PBT 测试。
 */

import type { IndexedCommand } from "./registry";
import type { SlashCommandDefinition } from "./types";

// ---------------------------------------------------------------------------
// 评分档位（离散化，避免浮点比较）
// ---------------------------------------------------------------------------

const SCORE_ID_EXACT = 1000;
const SCORE_ID_PREFIX = 900;
const SCORE_NAME_PREFIX = 800;
const SCORE_ID_SUBSTR = 600;
const SCORE_NAME_SUBSTR = 500;
const SCORE_DESC_SUBSTR = 400;
/** 未命中；`filter` 过滤器用 `< 0` 排除。 */
const SCORE_MISS = -1;

// ---------------------------------------------------------------------------
// 导出结构
// ---------------------------------------------------------------------------

/**
 * 命中的命令条目；`definition` / `index` 透传自 Registry，`score` 便于测试或
 * UI 做次排序。
 */
export interface MatchedCommand {
	readonly definition: SlashCommandDefinition;
	readonly index: IndexedCommand["index"];
	readonly score: number;
}

// ---------------------------------------------------------------------------
// 单条评分
// ---------------------------------------------------------------------------

/**
 * 计算单条命令在给定过滤词下的分数。
 *
 * 约定：
 * - `qLower` 必须已预先 `toLowerCase()`；空串返回 `0`（视作全部匹配，保持顺序）。
 * - id 完全相等 → `SCORE_ID_EXACT`；
 * - id 前缀 → `SCORE_ID_PREFIX`；
 * - name 前缀 → `SCORE_NAME_PREFIX`；
 * - id 子串 → `SCORE_ID_SUBSTR`；
 * - name 子串 → `SCORE_NAME_SUBSTR`；
 * - description 子串 → `SCORE_DESC_SUBSTR`；
 * - 均不命中 → `SCORE_MISS`。
 */
function scoreEntry(entry: IndexedCommand, qLower: string): number {
	if (qLower === "") return 0;
	const { lowerId, lowerName, lowerDesc } = entry.index;

	if (lowerId === qLower) return SCORE_ID_EXACT;
	if (lowerId.startsWith(qLower)) return SCORE_ID_PREFIX;
	if (lowerName.startsWith(qLower)) return SCORE_NAME_PREFIX;
	if (lowerId.includes(qLower)) return SCORE_ID_SUBSTR;
	if (lowerName.includes(qLower)) return SCORE_NAME_SUBSTR;
	if (lowerDesc.includes(qLower)) return SCORE_DESC_SUBSTR;
	return SCORE_MISS;
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 在已索引的命令集合中做三段式匹配 + 稳定排序。
 *
 * - 空串输入 → 原序返回（score 均为 `0`）；
 * - 非空输入 → 仅保留命中条目（score ≥ 0），按 score 降序排序；
 *   同分命令维持 `defs` 中的相对顺序（稳定排序）。
 *
 * 注意：本函数**不修改**入参数组；也不持有 `defs` 以外的状态。
 */
export function matchFilter(
	q: string,
	defs: readonly IndexedCommand[],
): MatchedCommand[] {
	const qLower = String(q ?? "").toLowerCase();

	const matched: MatchedCommand[] = [];
	for (const entry of defs) {
		const score = scoreEntry(entry, qLower);
		if (score === SCORE_MISS) continue;
		matched.push({
			definition: entry.definition,
			index: entry.index,
			score,
		});
	}

	if (qLower === "") {
		// 空串：保持原序
		return matched;
	}

	// 稳定排序：score 降序；`Array#sort` 在现代 V8 上是稳定排序，同分保持原序
	matched.sort((a, b) => b.score - a.score);
	return matched;
}
