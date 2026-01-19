import type { NoteChunkSearchHit } from "./api";

export type KbRelevanceLevel = "none" | "low" | "medium" | "high";

export interface KbRelevanceAssessment {
	level: KbRelevanceLevel;
	score: number;
	matchedTerms: string[];
}

function tokenize(query: string): string[] {
	return query
		.toLowerCase()
		.replace(/[\u200b\u200c\u200d\ufeff]/g, "")
		.split(/[^\p{L}\p{N}]+/u)
		.map((s) => s.trim())
		.filter((s) => s.length >= 2)
		.slice(0, 12);
}

export function assessKbRelevance(
	query: string,
	hits: NoteChunkSearchHit[],
): KbRelevanceAssessment {
	if (!Array.isArray(hits) || hits.length === 0) {
		return { level: "none", score: 0, matchedTerms: [] };
	}

	const terms = tokenize(query);
	if (terms.length === 0) {
		return {
			level: hits.length > 0 ? "low" : "none",
			score: hits.length > 0 ? 0.2 : 0,
			matchedTerms: [],
		};
	}

	const top = hits.slice(0, 6);
	const text = top
		.map((h) => `${h.source_title || ""}\n${h.snippet || ""}`)
		.join("\n")
		.toLowerCase();

	const matched = terms.filter((t) => text.includes(t));

	// 简单启发式：命中词越多、score 越高，相关性越高。
	const avgScore =
		top.reduce(
			(acc, h) => acc + (typeof h.score === "number" ? h.score : 0),
			0,
		) / top.length;
	const termRatio = matched.length / terms.length;

	let combined = Math.max(0, Math.min(1, termRatio * 0.7 + avgScore * 0.3));

	// 没有任何命中词时，避免仅凭向量分数把噪声判成 medium/high
	if (matched.length === 0) {
		combined = Math.min(combined, 0.04);
	}

	let level: KbRelevanceLevel = "low";
	if (combined < 0.05) level = "low";
	else if (combined < 0.18) level = "medium";
	else level = "high";

	return { level, score: combined, matchedTerms: matched };
}
