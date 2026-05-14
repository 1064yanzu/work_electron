/**
 * 5 维设计自检引擎
 *
 * 用一个轻量 LLM 调用对 HTML 设计稿做 5 维评分：
 *   philosophy / hierarchy / execution / functional / innovation
 *
 * 返回 JSON：{ scores, total, notes, fixes }
 *
 * 评分模板来自 `library/critique-rubric.md`；本引擎只负责调 LLM + 解析输出。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { invokeLlm } from "../llm/invoke";
import type { DbContext } from "../db/client";
import { getDesignLibraryRoot } from "./resourcePaths";
import { getMainArtifactPath } from "./designsDir";

export interface CritiqueResult {
	scores: {
		philosophy: number;
		hierarchy: number;
		execution: number;
		functional: number;
		innovation: number;
	};
	total: number;
	notes: string;
	fixes: string[];
	passed?: boolean;
	lowest_dim?: string;
	lowest_score?: number;
	regenerate_reason?: string;
}

const DEFAULT_RESULT: CritiqueResult = {
	scores: {
		philosophy: 0,
		hierarchy: 0,
		execution: 0,
		functional: 0,
		innovation: 0,
	},
	total: 0,
	notes: "",
	fixes: [],
};

const DIM_KEYS = [
	"philosophy",
	"hierarchy",
	"execution",
	"functional",
	"innovation",
] as const;

function computeGate(result: CritiqueResult): CritiqueResult {
	const dims = result.scores;
	const entries = DIM_KEYS.map((k) => [k, dims[k]] as const);
	let lowest = entries[0];
	for (const e of entries) {
		if (e[1] < lowest[1]) lowest = e;
	}
	const allAboveSix = entries.every(([, v]) => v >= 6);
	const passed = result.total >= 40 && allAboveSix;
	return {
		...result,
		passed,
		lowest_dim: lowest[0],
		lowest_score: lowest[1],
		regenerate_reason:
			result.regenerate_reason ||
			(passed
				? ""
				: `最弱维度「${lowest[0]}」仅 ${lowest[1]} 分，下一轮请专攻这点：${result.fixes[0] ?? "提升整体表现力"}`),
	};
}

function extractScore(line: string): number | null {
	const match = line.match(/(\d{1,2})/);
	if (!match) return null;
	const n = Number(match[1]);
	if (!Number.isFinite(n)) return null;
	return Math.max(0, Math.min(10, n));
}

function parseLlmJson(raw: string): CritiqueResult | null {
	// 先尝试 ```json 围栏
	const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenceMatch ? fenceMatch[1] : raw;
	try {
		const parsed = JSON.parse(candidate);
		if (parsed && typeof parsed === "object" && parsed.scores) {
			const s = parsed.scores;
			const result: CritiqueResult = {
				scores: {
					philosophy: Number(s.philosophy ?? 0),
					hierarchy: Number(s.hierarchy ?? 0),
					execution: Number(s.execution ?? 0),
					functional: Number(s.functional ?? 0),
					innovation: Number(s.innovation ?? 0),
				},
				total: Number(parsed.total ?? 0),
				notes: String(parsed.notes ?? ""),
				fixes: Array.isArray(parsed.fixes)
					? parsed.fixes.map((f: unknown) => String(f))
					: [],
			};
			if (typeof parsed.passed === "boolean") result.passed = parsed.passed;
			if (typeof parsed.lowest_dim === "string")
				result.lowest_dim = parsed.lowest_dim;
			if (typeof parsed.lowest_score === "number")
				result.lowest_score = parsed.lowest_score;
			if (typeof parsed.regenerate_reason === "string")
				result.regenerate_reason = parsed.regenerate_reason;
			if (result.total === 0) {
				result.total =
					result.scores.philosophy +
					result.scores.hierarchy +
					result.scores.execution +
					result.scores.functional +
					result.scores.innovation;
			}
			return result;
		}
	} catch {
		// 不是合法 JSON：试着用启发式从 markdown 表格提取
	}

	// 退化解析：找形如 "philosophy: 8" 的行
	const map = new Map<string, number>();
	for (const rawLine of raw.split("\n")) {
		const line = rawLine.toLowerCase();
		for (const key of [
			"philosophy",
			"hierarchy",
			"execution",
			"functional",
			"innovation",
		]) {
			if (line.includes(key)) {
				const score = extractScore(line);
				if (score !== null) map.set(key, score);
			}
		}
	}
	if (map.size === 0) return null;
	const philosophy = map.get("philosophy") ?? 0;
	const hierarchy = map.get("hierarchy") ?? 0;
	const execution = map.get("execution") ?? 0;
	const functional = map.get("functional") ?? 0;
	const innovation = map.get("innovation") ?? 0;
	return {
		scores: { philosophy, hierarchy, execution, functional, innovation },
		total: philosophy + hierarchy + execution + functional + innovation,
		notes: "（从非结构化输出降级解析）",
		fixes: [],
	};
}

export interface RunCritiqueOptions {
	sessionId: string;
	model?: string;
	gateMode?: boolean;
}

export async function runCritique(
	db: DbContext,
	opts: RunCritiqueOptions,
): Promise<CritiqueResult> {
	const htmlPath = await getMainArtifactPath(opts.sessionId);
	if (!htmlPath) {
		return DEFAULT_RESULT;
	}

	let html = "";
	try {
		html = await fs.readFile(htmlPath, "utf-8");
	} catch {
		return DEFAULT_RESULT;
	}

	// 大文件截断到 60k 字符（评分不需要完整 HTML）
	const truncated = html.length > 60000 ? `${html.slice(0, 60000)}\n<!-- truncated -->` : html;

	const libRoot = getDesignLibraryRoot();
	let rubric = "";
	try {
		rubric = await fs.readFile(path.join(libRoot, "critique-rubric.md"), "utf-8");
	} catch {
		rubric =
			"按 philosophy / hierarchy / execution / functional / innovation 各打 1-10 分。";
	}

	const gate = opts.gateMode === true;
	const gateHint = gate
		? [
				"",
				"# Self-Gate 契约（gate_mode=true）",
				"必须额外在 JSON 中包含 `passed`、`lowest_dim`、`lowest_score`、`regenerate_reason` 四个字段。",
				"- passed: 总分 ≥ 40 且每维 ≥ 6 才为 true",
				"- lowest_dim / lowest_score: 最弱维度",
				"- regenerate_reason: 一句话告诉下一轮该专攻什么",
			].join("\n")
		: "";

	const prompt = [
		"你是一位资深设计评审。下面给你一份 HTML 设计稿，请按 5 维评分表给出严格的评分。",
		"",
		"# 评分契约",
		rubric,
		gateHint,
		"",
		"# 输出格式（严格 JSON，禁止额外说明）",
		"```json",
		"{",
		'  "scores": { "philosophy": 8, "hierarchy": 7, "execution": 9, "functional": 8, "innovation": 6 },',
		'  "total": 38,',
		'  "notes": "整体克制、像 Linear；hero 字号差异不够拉开",',
		'  "fixes": ["把 H2 改成 clamp(24px, 4vw, 32px)", "icon 描边改 1.5px"]' +
			(gate
				? ",\n  \"passed\": false,\n  \"lowest_dim\": \"innovation\",\n  \"lowest_score\": 6,\n  \"regenerate_reason\": \"hero 缺少记忆点\""
				: ""),
		"}",
		"```",
		"",
		"# 待评设计稿",
		"```html",
		truncated,
		"```",
	].join("\n");

	const llmResult = await invokeLlm(db, {
		model: opts.model || "claude-haiku-4-5-20251001",
		prompt,
		temperature: 0.2,
	});

	const parsed = parseLlmJson(llmResult.content);
	if (!parsed) return DEFAULT_RESULT;
	// gate_mode 下补齐 passed / lowest_* / regenerate_reason；非 gate_mode 时也顺手算出来不会破坏现有契约（这些都是可选字段）
	return computeGate(parsed);
}
