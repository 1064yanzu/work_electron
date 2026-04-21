/**
 * Wiki Lint 服务
 *
 * 对齐 Karpathy pattern 的 "工作流三：lint（健康检查）"：
 *   - orphan：没有任何入链的页面（排除 index / log / SCHEMA / 知识地图 / map 类型）
 *   - stub：status=active 但正文少于 100 字（中文字符数）
 *   - broken-link：related_pages 指向不存在的 slug
 *   - frontmatter-missing：title / summary 为空
 *   - source-no-sources：page_type=source 但 frontmatter.sources 为空
 *   - un-ingested：scope 下有新原始文件但未被 schema.processed_sources 覆盖
 *
 * 矛盾（contradictions）检测需要跨页面语义比对，交给 Agent 在 wiki_lint 之后自行完成。
 * 本服务只做机械检查 + 统计。
 */
import path from "node:path";
import { getWikiRoot, listAllPages, readSchema } from "./wikiFs";
import { scanSourceFiles } from "./sourceScanner";
import type { WikiPage } from "./types";

export type WikiLintIssueKind =
	| "orphan"
	| "stub"
	| "broken-link"
	| "frontmatter-missing"
	| "source-no-sources";

export interface WikiLintIssue {
	kind: WikiLintIssueKind;
	page_slug: string;
	page_title: string;
	detail: string;
}

export interface UnIngestedSource {
	path: string;
	name: string;
	size: number;
}

export interface WikiLintReport {
	scope_path: string;
	total_pages: number;
	issues: WikiLintIssue[];
	counts: Record<WikiLintIssueKind, number>;
	un_ingested_sources: UnIngestedSource[];
	suggestions: string[];
	ran_at: number;
}

const STUB_MIN_CHARS = 100;

/** 被豁免孤儿检查的 slug/title 白名单 */
const ORPHAN_WHITELIST = new Set<string>([
	"知识地图",
	"index",
	"log",
	"SCHEMA",
]);

/**
 * 执行 Wiki lint 检查
 */
export async function runWikiLint(scopePath: string): Promise<WikiLintReport> {
	const normalized = path.resolve(scopePath);
	const wikiRoot = getWikiRoot(normalized);

	const pages = await listAllPages(wikiRoot, normalized);
	const schema = await readSchema(wikiRoot);

	const issues: WikiLintIssue[] = [];

	// 构建入链索引（谁指向谁）
	const incomingLinks = new Map<string, Set<string>>();
	for (const p of pages) {
		for (const target of p.related_page_ids) {
			if (!incomingLinks.has(target)) incomingLinks.set(target, new Set());
			incomingLinks.get(target)!.add(p.slug);
		}
	}

	const pageBySlug = new Map(pages.map((p) => [p.slug, p]));

	for (const page of pages) {
		// frontmatter 缺失
		if (!page.title || !page.title.trim()) {
			issues.push({
				kind: "frontmatter-missing",
				page_slug: page.slug,
				page_title: page.title || page.slug,
				detail: "title 字段为空",
			});
		}
		if (!page.summary || !page.summary.trim()) {
			issues.push({
				kind: "frontmatter-missing",
				page_slug: page.slug,
				page_title: page.title || page.slug,
				detail: "summary 字段为空",
			});
		}

		// stub: status=active 但正文字数不足
		if ((page.status ?? "active") === "active") {
			const charCount = countMeaningfulChars(page.content);
			if (charCount < STUB_MIN_CHARS) {
				issues.push({
					kind: "stub",
					page_slug: page.slug,
					page_title: page.title,
					detail: `正文仅 ${charCount} 字符（< ${STUB_MIN_CHARS}）。考虑扩写或把 status 改为 stub。`,
				});
			}
		}

		// broken-link: related_pages 指向不存在的 slug
		for (const targetSlug of page.related_page_ids) {
			if (!pageBySlug.has(targetSlug)) {
				issues.push({
					kind: "broken-link",
					page_slug: page.slug,
					page_title: page.title,
					detail: `related_pages 指向不存在的页面「${targetSlug}」`,
				});
			}
		}

		// orphan: 没有入链 + 非白名单 + 非 map 类型
		const isWhitelisted =
			ORPHAN_WHITELIST.has(page.slug) ||
			ORPHAN_WHITELIST.has(page.title) ||
			page.page_type === "map";
		const incoming = incomingLinks.get(page.slug);
		if (!isWhitelisted && (!incoming || incoming.size === 0)) {
			issues.push({
				kind: "orphan",
				page_slug: page.slug,
				page_title: page.title,
				detail: "没有任何其他页面指向它（通过 related_pages）",
			});
		}

		// source-no-sources
		if (page.page_type === "source" && page.sources.length === 0) {
			issues.push({
				kind: "source-no-sources",
				page_slug: page.slug,
				page_title: page.title,
				detail:
					"page_type=source 但 frontmatter.sources 为空，无法追溯原始文件",
			});
		}
	}

	// 未摄入的 raw 文件
	const unIngested = await findUnIngestedSources(normalized, schema);

	const counts = countIssues(issues);
	const suggestions = buildSuggestions(pages, issues, unIngested, counts);

	return {
		scope_path: normalized,
		total_pages: pages.length,
		issues,
		counts,
		un_ingested_sources: unIngested,
		suggestions,
		ran_at: Date.now(),
	};
}

/** 统计中文 + 英文 + 数字字符（忽略标点、空白） */
function countMeaningfulChars(content: string): number {
	const stripped = content.replace(/[\s\p{P}\p{S}]/gu, "");
	return stripped.length;
}

async function findUnIngestedSources(
	scopePath: string,
	schema: Awaited<ReturnType<typeof readSchema>>,
): Promise<UnIngestedSource[]> {
	try {
		const allFiles = await scanSourceFiles(scopePath, schema);
		// scanSourceFiles 已经排除 .llm-wiki 和忽略模式；但它会包括"已处理"的
		// 这里再过滤一次：未处理 + 未跳过 的才算"un-ingested"
		const processed = schema.processed_sources || {};
		const skipped = schema.skipped_sources || {};
		const result: UnIngestedSource[] = [];
		for (const f of allFiles) {
			if (processed[f.path] || skipped[f.path]) continue;
			result.push({ path: f.path, name: f.name, size: f.size });
		}
		// 最多返回 50 条
		return result.slice(0, 50);
	} catch {
		return [];
	}
}

function countIssues(
	issues: WikiLintIssue[],
): Record<WikiLintIssueKind, number> {
	const counts: Record<WikiLintIssueKind, number> = {
		orphan: 0,
		stub: 0,
		"broken-link": 0,
		"frontmatter-missing": 0,
		"source-no-sources": 0,
	};
	for (const i of issues) {
		counts[i.kind] = (counts[i.kind] ?? 0) + 1;
	}
	return counts;
}

function buildSuggestions(
	pages: WikiPage[],
	_issues: WikiLintIssue[],
	unIngested: UnIngestedSource[],
	counts: Record<WikiLintIssueKind, number>,
): string[] {
	const lines: string[] = [];

	if (unIngested.length > 0) {
		lines.push(
			`有 ${unIngested.length} 个原始文件尚未摄入 Wiki，可在 Wiki 面板点击「AI 生成 Wiki」处理。`,
		);
	}

	if (counts.stub > 0) {
		lines.push(
			`有 ${counts.stub} 个页面是 stub（正文 < ${STUB_MIN_CHARS} 字符），考虑扩写或把 status 改为 stub。`,
		);
	}

	if (counts.orphan > 0) {
		lines.push(
			`有 ${counts.orphan} 个孤儿页面。让 Agent 读这些页面，在相关主题页面里添加反向链接。`,
		);
	}

	if (counts["broken-link"] > 0) {
		lines.push(
			`有 ${counts["broken-link"]} 个断链。清理 related_pages 或创建缺失的目标页面。`,
		);
	}

	if (counts["source-no-sources"] > 0) {
		lines.push(
			`有 ${counts["source-no-sources"]} 个 source 页面缺少 sources 字段。重新摄入对应原始文件可修复。`,
		);
	}

	// 主题覆盖提示
	const hasMaps = pages.some((p) => p.page_type === "map");
	if (!hasMaps && pages.length > 15) {
		lines.push(
			"Wiki 已有 15+ 页面但尚无主题导航页（page_type=map）。建议让 Agent 创建 1-2 张主题导航页梳理结构。",
		);
	}

	if (lines.length === 0) {
		lines.push("Wiki 当前状态健康，未发现机械问题。");
	}

	return lines;
}
