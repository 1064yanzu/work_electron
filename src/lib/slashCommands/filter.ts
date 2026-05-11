/**
 * Claude Code 风格斜杠命令 —— 过滤器（matchFilter）。
 *
 * 任务：T1.4（基线） + 2026-05 升级（模糊匹配 + matchPositions）。
 *
 * 约束：
 * - 输入来自 `registry.listIndexed(ctx)` 的 {@link IndexedCommand}，已在注册时
 *   冻结好 `lowerId/lowerName/lowerDesc`，本文件热路径不再做 `toLowerCase()`。
 * - 排序语义严格分档：
 *     id 完全相等 > id 前缀 > name 前缀 > id 子串 > name 子串 > desc 子串 > fuzzy
 *   分档相同时**保持 registry 稳定排序**（Array#sort 在现代 V8 上是稳定排序）。
 * - 大小写不敏感（query 进入时已 toLowerCase）。
 * - 空串：原序返回，matchPositions 为空。
 * - Fuzzy 仅在所有"子串"档都未命中时作为兜底，按"q 全部字符按序出现在 name/id 中"
 *   命中；这给 `/cc` 命中 `/clear` 这种轻输入手感留出空间。
 * - 零外部依赖；纯函数，便于 PBT 测试。
 *
 * matchPositions 提供给 UI 做字符高亮，仅相对 `lowerName`：
 * - 前缀命中：`[0,1,...,q.length-1]`
 * - 子串命中：`[start,...,start+q.length-1]`
 * - fuzzy 命中：按序找到的字符 index 数组
 * - id-only 命中 / desc 命中：返回空数组（UI 不高亮）
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
const SCORE_FUZZY_BASE = 200;
/** 未命中；`filter` 过滤器用 `< 0` 排除。 */
const SCORE_MISS = -1;

// ---------------------------------------------------------------------------
// 导出结构
// ---------------------------------------------------------------------------

/**
 * 命中的命令条目。
 * - `definition` / `index` 透传自 Registry；
 * - `score` 便于测试或 UI 做次排序；
 * - `matchPositions` 是相对 `lowerName` 的命中字符位置数组（按 q 顺序，升序）；
 *   未在 name 上命中时为空数组（UI 不高亮 name）。
 */
export interface MatchedCommand {
	readonly definition: SlashCommandDefinition;
	readonly index: IndexedCommand["index"];
	readonly score: number;
	readonly matchPositions: readonly number[];
}

// ---------------------------------------------------------------------------
// 工具：在 target 中按序找出 q 的所有字符位置（fuzzy）
// ---------------------------------------------------------------------------

/**
 * 在 `target` 中按 `q` 的字符顺序找出每个字符的索引。
 *
 * - 返回的数组长度严格等于 `q.length`；任意字符找不到都返回 `null`。
 * - 仅做 ASCII 级 strict ordering；不做编辑距离。
 *
 * 用于 fuzzy 命中判定，也用于 matchPositions 计算。
 */
function fuzzyIndices(q: string, target: string): number[] | null {
	if (q.length === 0) return [];
	if (target.length < q.length) return null;
	const out: number[] = [];
	let cursor = 0;
	for (let i = 0; i < q.length; i++) {
		const ch = q.charCodeAt(i);
		let found = -1;
		for (let j = cursor; j < target.length; j++) {
			if (target.charCodeAt(j) === ch) {
				found = j;
				break;
			}
		}
		if (found < 0) return null;
		out.push(found);
		cursor = found + 1;
	}
	return out;
}

/**
 * 给 fuzzy 命中算一个"连续度奖励"：相邻位置差 1 视为连续，越连续奖励越高。
 *
 * 数值范围：`0`（全分散）到 `q.length - 1`（完全连续）；
 * 用于 fuzzy 内部细分排序，不进入档位。
 */
function fuzzyContiguityBonus(positions: readonly number[]): number {
	if (positions.length <= 1) return 0;
	let bonus = 0;
	for (let i = 1; i < positions.length; i++) {
		if (positions[i]! - positions[i - 1]! === 1) bonus += 1;
	}
	return bonus;
}

// ---------------------------------------------------------------------------
// 单条评分
// ---------------------------------------------------------------------------

interface ScoreResult {
	score: number;
	/** 相对 lowerName 的高亮位置数组（升序）。 */
	matchPositions: number[];
}

/**
 * 计算单条命令在给定过滤词下的分数与高亮位置。
 *
 * 约定：
 * - `qLower` 必须已预先 `toLowerCase()`；空串返回 `score = 0` 视作全部匹配，保持顺序。
 * - 档位顺序见文件头注释。
 * - matchPositions 总是相对 lowerName；不在 name 上命中（仅在 id / desc 命中）时为空数组。
 */
function scoreEntry(entry: IndexedCommand, qLower: string): ScoreResult {
	if (qLower === "") return { score: 0, matchPositions: [] };
	const { lowerId, lowerName, lowerDesc } = entry.index;

	if (lowerId === qLower) {
		return { score: SCORE_ID_EXACT, matchPositions: [] };
	}
	if (lowerId.startsWith(qLower)) {
		return { score: SCORE_ID_PREFIX, matchPositions: [] };
	}
	if (lowerName.startsWith(qLower)) {
		const positions: number[] = [];
		for (let i = 0; i < qLower.length; i++) positions.push(i);
		return { score: SCORE_NAME_PREFIX, matchPositions: positions };
	}
	const idSubIdx = lowerId.indexOf(qLower);
	if (idSubIdx >= 0) {
		return { score: SCORE_ID_SUBSTR, matchPositions: [] };
	}
	const nameSubIdx = lowerName.indexOf(qLower);
	if (nameSubIdx >= 0) {
		const positions: number[] = [];
		for (let i = 0; i < qLower.length; i++) positions.push(nameSubIdx + i);
		return { score: SCORE_NAME_SUBSTR, matchPositions: positions };
	}
	if (lowerDesc.includes(qLower)) {
		return { score: SCORE_DESC_SUBSTR, matchPositions: [] };
	}
	// Fuzzy 兜底：先在 name 上找连续顺序匹配，找不到再到 id
	const nameFuzzy = fuzzyIndices(qLower, lowerName);
	if (nameFuzzy) {
		const bonus = fuzzyContiguityBonus(nameFuzzy);
		return {
			score: SCORE_FUZZY_BASE + bonus,
			matchPositions: nameFuzzy,
		};
	}
	const idFuzzy = fuzzyIndices(qLower, lowerId);
	if (idFuzzy) {
		// id-only 模糊命中：matchPositions 在 name 上没有意义，留空
		const bonus = fuzzyContiguityBonus(idFuzzy);
		return {
			score: SCORE_FUZZY_BASE + bonus - 50, // id 模糊比 name 模糊略低
			matchPositions: [],
		};
	}
	return { score: SCORE_MISS, matchPositions: [] };
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 在已索引的命令集合中做分档匹配 + 稳定排序。
 *
 * - 空串输入 → 原序返回（score 均为 `0`，matchPositions 为空）；
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
		const result = scoreEntry(entry, qLower);
		if (result.score === SCORE_MISS) continue;
		matched.push({
			definition: entry.definition,
			index: entry.index,
			score: result.score,
			matchPositions: result.matchPositions,
		});
	}

	if (qLower === "") {
		// 空串：保持原序
		return matched;
	}

	// 稳定排序：score 降序；Array#sort 在现代 V8 上是稳定排序，同分保持原序
	matched.sort((a, b) => b.score - a.score);
	return matched;
}
