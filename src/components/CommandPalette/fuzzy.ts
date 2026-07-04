// 命令面板模糊匹配 — 自研 ~100 行，返回命中下标供高亮
//
// 打分优先级：标题前缀 > 标题连续子串 > 词首/驼峰/中文按字命中 > 稀疏字符序列。
// keywords / description / group 只做子串降权匹配（不参与高亮）。

import type { CommandItem } from "./types";

export interface FuzzyResult {
	score: number;
	/** 命中字符在原文中的下标（供高亮渲染） */
	indices: number[];
}

/** 是否是"词首"位置：串首、分隔符后、camelCase 大写、CJK 字符视为独立词 */
function isWordStart(text: string, index: number): boolean {
	if (index === 0) return true;
	const prev = text[index - 1];
	const curr = text[index];
	if (/[\s\-_/.:：·]/.test(prev)) return true;
	// camelCase 边界
	if (/[a-z]/.test(prev) && /[A-Z]/.test(curr)) return true;
	// CJK 每个字都可作为词首
	if (/[一-鿿]/.test(curr)) return true;
	return false;
}

/**
 * 对单个文本做模糊匹配。
 * 返回 null 表示未命中；score 越大越靠前。
 */
export function fuzzyMatch(text: string, query: string): FuzzyResult | null {
	if (!query) return { score: 1, indices: [] };
	const t = text.toLowerCase();
	const q = query.toLowerCase();

	// 1) 前缀命中
	if (t.startsWith(q)) {
		return {
			score: 100,
			indices: Array.from({ length: q.length }, (_, i) => i),
		};
	}

	// 2) 连续子串命中（越靠前越好）
	const subIndex = t.indexOf(q);
	if (subIndex >= 0) {
		return {
			score: Math.max(60, 85 - subIndex),
			indices: Array.from({ length: q.length }, (_, i) => subIndex + i),
		};
	}

	// 3) 字符子序列（贪心）：相邻加分、词首加分
	const indices: number[] = [];
	let qi = 0;
	let score = 0;
	let lastHit = -2;
	for (let i = 0; i < t.length && qi < q.length; i++) {
		if (t[i] !== q[qi]) continue;
		indices.push(i);
		score += 4;
		if (i === lastHit + 1) score += 5; // 连续
		if (isWordStart(text, i)) score += 8; // 词首/驼峰/中文字
		lastHit = i;
		qi++;
	}
	if (qi < q.length) return null;

	// 稀疏惩罚：命中跨度越大越靠后
	const spread = indices[indices.length - 1] - indices[0] + 1;
	score = Math.max(2, score - Math.floor((spread - q.length) / 2));
	return { score: Math.min(score, 55), indices };
}

export interface CommandScore {
	score: number;
	/** 标题命中下标（其他字段命中时为空，不高亮） */
	titleIndices: number[];
}

/** 对一条命令打分：标题全权重，keywords/description/group 子串降权 */
export function scoreCommandItem(
	item: CommandItem,
	query: string,
): CommandScore | null {
	if (!query) return { score: 1, titleIndices: [] };
	const q = query.toLowerCase();

	const titleResult = fuzzyMatch(item.title, query);
	if (titleResult) {
		return {
			score: titleResult.score + 100,
			titleIndices: titleResult.indices,
		};
	}
	const keywords = (item.keywords || []).join(" ").toLowerCase();
	if (keywords.includes(q)) return { score: 60, titleIndices: [] };
	const desc = (item.description || "").toLowerCase();
	if (desc.includes(q)) return { score: 40, titleIndices: [] };
	if (item.group.toLowerCase().includes(q)) {
		return { score: 20, titleIndices: [] };
	}
	return null;
}
