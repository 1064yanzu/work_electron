/**
 * Wiki 知识页面服务（文件系统驱动版）
 *
 * 替代原来的 DB 驱动实现，所有 Wiki 页面以 Markdown + YAML frontmatter
 * 形式存储在 .llm-wiki/ 目录中。不再依赖 DbContext。
 *
 * Karpathy 三层架构：Raw Sources → Wiki (.llm-wiki/) → Schema (.schema.json)
 */
import path from "node:path";
import type { WikiPage, WikiPageInput } from "./wiki/types";
import {
	ensureWikiStructure,
	getWikiRoot,
	listAllPages,
	readPage,
	readSchema,
	writeSchema,
	writePage,
	deletePageFile,
	searchPages as fsSearchPages,
	countPages as fsCountPages,
	isWikiDirExists,
	disableWikiDir,
} from "./wiki/wikiFs";
import { rebuildIndex, appendLog } from "./wiki/indexLog";
import {
	resetSkippedSources,
	resetProcessedSources,
} from "./wiki/sourceScanner";

// Re-export types for backward compatibility
export type { WikiPage, WikiPageInput };

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function normalizeScopePath(scopePath: string): string {
	return path.resolve(String(scopePath || "").trim());
}

function getWorkspaceDisplayName(scopePath: string): string {
	const normalized = normalizeScopePath(scopePath);
	return path.basename(normalized) || normalized;
}

// ---------------------------------------------------------------------------
// CRUD 操作（文件系统驱动）
// ---------------------------------------------------------------------------

export async function createWikiPage(
	scopePath: string,
	input: WikiPageInput,
	updatedBy = "auto",
): Promise<WikiPage> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);

	const page = await writePage(wikiRoot, normalizedPath, {
		...input,
		last_updated_by: updatedBy,
	});

	// 更新 index.md 和 log.md
	const allPages = await listAllPages(wikiRoot, normalizedPath);
	const displayName = getWorkspaceDisplayName(normalizedPath);
	await rebuildIndex(wikiRoot, allPages, displayName);
	await appendLog(wikiRoot, "create", `创建页面：${input.title}`);

	return page;
}

export async function updateWikiPage(
	scopePath: string,
	pageSlug: string,
	input: Partial<WikiPageInput>,
	updatedBy = "user",
): Promise<WikiPage | null> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);

	// 读取现有页面
	const existing = await readPage(wikiRoot, pageSlug, normalizedPath);
	if (!existing) return null;

	// 合并更新
	const updated = await writePage(
		wikiRoot,
		normalizedPath,
		{
			title: input.title ?? existing.title,
			content: input.content ?? existing.content,
			summary: input.summary ?? existing.summary,
			tags: input.tags ?? existing.tags,
			related_page_ids: input.related_page_ids ?? existing.related_page_ids,
			page_type: input.page_type ?? existing.page_type,
			confidence: input.confidence ?? existing.confidence,
			last_updated_by: updatedBy,
			sources: input.sources ?? existing.sources,
			status: input.status ?? existing.status,
			aliases: input.aliases ?? existing.aliases,
		},
		pageSlug,
	);

	// 更新 index.md 和 log.md
	const allPages = await listAllPages(wikiRoot, normalizedPath);
	const displayName = getWorkspaceDisplayName(normalizedPath);
	await rebuildIndex(wikiRoot, allPages, displayName);
	await appendLog(wikiRoot, "update", `更新页面：${updated.title}`);

	return updated;
}

export async function getWikiPage(
	scopePath: string,
	pageSlug: string,
): Promise<WikiPage | null> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);
	return readPage(wikiRoot, pageSlug, normalizedPath);
}

export async function deleteWikiPage(
	scopePath: string,
	pageSlug: string,
): Promise<void> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);

	// 先读取页面获取标题（用于日志）
	const page = await readPage(wikiRoot, pageSlug, normalizedPath);
	const pageTitle = page?.title || pageSlug;

	await deletePageFile(wikiRoot, pageSlug);

	// 更新 index.md 和 log.md
	const allPages = await listAllPages(wikiRoot, normalizedPath);
	const displayName = getWorkspaceDisplayName(normalizedPath);
	await rebuildIndex(wikiRoot, allPages, displayName);
	await appendLog(wikiRoot, "delete", `删除页面：${pageTitle}`);
}

export async function listWikiPages(
	scopePath: string,
	options?: { limit?: number; offset?: number },
): Promise<WikiPage[]> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);

	const allPages = await listAllPages(wikiRoot, normalizedPath);
	const offset = options?.offset ?? 0;
	const limit = options?.limit ?? 100;

	return allPages.slice(offset, offset + limit);
}

export async function countWikiPages(scopePath: string): Promise<number> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);
	return fsCountPages(wikiRoot);
}

export async function searchWikiPages(
	scopePath: string,
	query: string,
	options?: { limit?: number },
): Promise<WikiPage[]> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);
	const limit = options?.limit ?? 20;

	return fsSearchPages(wikiRoot, normalizedPath, query, limit);
}

// ---------------------------------------------------------------------------
// 启用 / 禁用
// ---------------------------------------------------------------------------

export async function isWikiEnabled(scopePath: string): Promise<boolean> {
	const normalizedPath = normalizeScopePath(scopePath);
	return isWikiDirExists(normalizedPath);
}

export async function enableWiki(scopePath: string): Promise<void> {
	const normalizedPath = normalizeScopePath(scopePath);
	await ensureWikiStructure(normalizedPath);
	const wikiRoot = getWikiRoot(normalizedPath);
	await appendLog(wikiRoot, "init", "初始化 Wiki 结构");
}

export async function disableWiki(scopePath: string): Promise<void> {
	const normalizedPath = normalizeScopePath(scopePath);
	await disableWikiDir(normalizedPath);
}

export async function rebuildWikiWorkspace(
	scopePath: string,
): Promise<{ created_map: boolean }> {
	const normalizedPath = normalizeScopePath(scopePath);
	await ensureWikiStructure(normalizedPath);

	const wikiRoot = getWikiRoot(normalizedPath);

	// 检查知识地图是否存在
	const existingMap = await readPage(wikiRoot, "知识地图", normalizedPath);
	let createdMap = false;

	if (!existingMap) {
		const displayName = getWorkspaceDisplayName(normalizedPath);
		await writePage(wikiRoot, normalizedPath, {
			title: "知识地图",
			summary: "当前线程工作目录的 Wiki 入口与结构地图",
			content: buildKnowledgeMapContent(displayName),
			tags: ["map", "index"],
			page_type: "map",
			last_updated_by: "system",
		});
		createdMap = true;
	}

	// 重建 index.md
	const allPages = await listAllPages(wikiRoot, normalizedPath);
	const displayName = getWorkspaceDisplayName(normalizedPath);
	await rebuildIndex(wikiRoot, allPages, displayName);
	await appendLog(wikiRoot, "rebuild", "重建 Wiki 结构");

	return { created_map: createdMap };
}

// ---------------------------------------------------------------------------
// Schema 诊断与重置
// ---------------------------------------------------------------------------

export interface WikiSchemaStats {
	/** 成功生成过页面的源文件数量 */
	processed_count: number;
	/** 被跳过（无法提取 / LLM 未返回）的源文件数量 */
	skipped_count: number;
	/** 磁盘上实际存在的 Wiki 页面数量（不含知识地图） */
	real_page_count: number;
	/** 磁盘上的知识地图页面是否存在 */
	has_knowledge_map: boolean;
	/** 跳过的文件列表（用于 UI 展示前若干个） */
	skipped_files: Array<{
		path: string;
		name: string;
		reason: string;
		reason_detail?: string;
		skipped_at: number;
	}>;
}

/**
 * 读取 schema 的统计数据，供 UI 展示诊断面板使用
 */
export async function getWikiSchemaStats(
	scopePath: string,
): Promise<WikiSchemaStats> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);
	const schema = await readSchema(wikiRoot);
	const allPages = await listAllPages(wikiRoot, normalizedPath);

	const realPages = allPages.filter(
		(p) => p.slug !== "知识地图" && p.title !== "知识地图",
	);
	const hasMap = allPages.some(
		(p) => p.slug === "知识地图" || p.title === "知识地图",
	);

	const skippedEntries = Object.entries(schema.skipped_sources || {});
	const skippedFiles = skippedEntries
		.sort(([, a], [, b]) => b.skipped_at - a.skipped_at)
		.slice(0, 50)
		.map(([filePath, entry]) => ({
			path: filePath,
			name: path.basename(filePath),
			reason: entry.reason,
			reason_detail: entry.reason_detail,
			skipped_at: entry.skipped_at,
		}));

	return {
		processed_count: Object.keys(schema.processed_sources).length,
		skipped_count: skippedEntries.length,
		real_page_count: realPages.length,
		has_knowledge_map: hasMap,
		skipped_files: skippedFiles,
	};
}

/**
 * 清空 skipped_sources。下次点击「生成 Wiki」时，这些文件会作为新文件重新尝试。
 * 返回被清空的数量。
 */
export async function resetWikiSkippedSources(
	scopePath: string,
): Promise<number> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);
	const schema = await readSchema(wikiRoot);
	const count = resetSkippedSources(schema);
	if (count > 0) {
		await writeSchema(wikiRoot, schema);
		await appendLog(
			wikiRoot,
			"rebuild",
			`清空 ${count} 条跳过记录（将重试这些文件）`,
		);
	}
	return count;
}

/**
 * 清空 processed_sources。下次点击「生成 Wiki」时，所有文件都会被重新处理。
 * 不会影响磁盘上已经生成的 Wiki 页面。
 */
export async function resetWikiProcessedSources(
	scopePath: string,
): Promise<number> {
	const normalizedPath = normalizeScopePath(scopePath);
	const wikiRoot = getWikiRoot(normalizedPath);
	const schema = await readSchema(wikiRoot);
	const count = resetProcessedSources(schema);
	if (count > 0) {
		await writeSchema(wikiRoot, schema);
		await appendLog(
			wikiRoot,
			"rebuild",
			`清空 ${count} 条已处理记录（将重新处理所有文件）`,
		);
	}
	return count;
}

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

function buildKnowledgeMapContent(scopeName: string): string {
	return `# 知识地图

当前线程工作目录：\`${scopeName}\`

## 待整理主题
- 在这里补充当前目录下最核心的知识主题

## 核心概念
- 记录需要长期保留的概念解释、术语和定义

## 方法与流程
- 记录稳定的方法论、流程、规范和最佳实践

## 资料索引
- 为重要文件、文献、笔记补充指向关系和摘要
`;
}
