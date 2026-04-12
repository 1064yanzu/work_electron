/**
 * Wiki 知识页面服务
 * 负责按线程工作目录（cwd）隔离 Wiki 页面
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DbContext } from "../db/client";

export interface WikiPage {
	id: string;
	scope_path: string;
	title: string;
	slug: string;
	content: string;
	summary: string;
	tags: string[];
	related_page_ids: string[];
	page_type: string;
	confidence: number;
	reference_count: number;
	last_updated_by: string;
	created_at: number;
	updated_at: number;
}

export interface WikiPageInput {
	title: string;
	content: string;
	summary?: string;
	tags?: string[];
	related_page_ids?: string[];
	page_type?: string;
	confidence?: number;
}

function titleToSlug(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 100) || `page-${Date.now()}`
	);
}

function normalizeScopePath(scopePath: string): string {
	return path.resolve(String(scopePath || "").trim());
}

function getWorkspaceDisplayName(scopePath: string): string {
	const normalized = normalizeScopePath(scopePath);
	return path.basename(normalized) || normalized;
}

function safeJsonArray(val: unknown): string[] {
	if (typeof val === "string") {
		try {
			const parsed = JSON.parse(val);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
	if (Array.isArray(val)) return val;
	return [];
}

function rowToWikiPage(row: any): WikiPage {
	return {
		id: row.id,
		scope_path: row.scope_path,
		title: row.title,
		slug: row.slug,
		content: row.content,
		summary: row.summary || "",
		tags: safeJsonArray(row.tags),
		related_page_ids: safeJsonArray(row.related_page_ids),
		page_type: row.page_type || "entity",
		confidence: row.confidence ?? 0.7,
		reference_count: row.reference_count ?? 0,
		last_updated_by: row.last_updated_by || "auto",
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

async function ensureWikiWorkspace(
	db: DbContext,
	scopePath: string,
): Promise<string> {
	const normalizedPath = normalizeScopePath(scopePath);
	const now = Date.now();
	const displayName = getWorkspaceDisplayName(normalizedPath);

	await db.client.execute({
		sql: `INSERT OR IGNORE INTO wiki_workspaces (scope_path, display_name, enabled, created_at, updated_at)
			  VALUES (?, ?, 0, ?, ?)`,
		args: [normalizedPath, displayName, now, now],
	});

	await db.client.execute({
		sql: `UPDATE wiki_workspaces
			  SET display_name = ?, updated_at = ?
			  WHERE scope_path = ? AND display_name != ?`,
		args: [displayName, now, normalizedPath, displayName],
	});

	return normalizedPath;
}

function getWikiRoot(scopePath: string): string {
	return path.join(normalizeScopePath(scopePath), ".llm-wiki");
}

function buildWikiIndexContent(scopePath: string): string {
	const scopeName = getWorkspaceDisplayName(scopePath);
	return `# ${scopeName} Wiki

> 原始资料目录：当前线程工作目录本身

## 入口
- [知识地图](./知识地图.md)
- [变更日志](./log.md)

## 目录约定
- \`entities/\`：实体、项目对象、关键人物、组织、组件
- \`concepts/\`：概念、术语、方法、原理
- \`workflows/\`：流程、规范、SOP、操作路径
`;
}

function buildWikiLogContent(): string {
	return `# Wiki Log

- 初始化 Wiki 结构
`;
}

async function ensureWikiFilesystem(scopePath: string): Promise<void> {
	const wikiRoot = getWikiRoot(scopePath);
	const entitiesDir = path.join(wikiRoot, "entities");
	const conceptsDir = path.join(wikiRoot, "concepts");
	const workflowsDir = path.join(wikiRoot, "workflows");

	await fs.mkdir(entitiesDir, { recursive: true });
	await fs.mkdir(conceptsDir, { recursive: true });
	await fs.mkdir(workflowsDir, { recursive: true });

	const bootstrapFiles = [
		{
			path: path.join(wikiRoot, "index.md"),
			content: buildWikiIndexContent(scopePath),
		},
		{
			path: path.join(wikiRoot, "log.md"),
			content: buildWikiLogContent(),
		},
		{
			path: path.join(wikiRoot, "知识地图.md"),
			content: `# 知识地图

当前线程工作目录直接作为原始资料区使用，不额外创建 \`raw/\`。

## 待整理主题
- 在这里补充当前目录下最核心的知识主题

## 核心概念
- 记录需要长期保留的概念解释、术语和定义

## 方法与流程
- 记录稳定的方法论、流程、规范和最佳实践

## 资料索引
- 为重要文件、文献、笔记补充指向关系和摘要
`,
		},
	];

	for (const file of bootstrapFiles) {
		try {
			await fs.access(file.path);
		} catch {
			await fs.writeFile(file.path, file.content, "utf-8");
		}
	}
}

async function ensureMapPageExists(
	db: DbContext,
	scopePath: string,
): Promise<boolean> {
	const normalizedScopePath = normalizeScopePath(scopePath);
	const existing = await db.client.execute({
		sql: `SELECT id FROM wiki_workspace_pages
			  WHERE scope_path = ? AND title = ?
			  ORDER BY created_at ASC`,
		args: [normalizedScopePath, "知识地图"],
	});
	if (existing.rows.length > 0) return false;

	await createWikiPage(
		db,
		normalizedScopePath,
		{
			title: "知识地图",
			summary: "当前线程工作目录的 Wiki 入口与结构地图",
			content: `# 知识地图

当前线程工作目录直接作为原始资料区使用，不额外创建 \`raw/\`。

## 待整理主题
- 在这里补充当前目录下最核心的知识主题

## 核心概念
- 记录需要长期保留的概念解释、术语和定义

## 方法与流程
- 记录稳定的方法论、流程、规范和最佳实践

## 资料索引
- 为重要文件、文献、笔记补充指向关系和摘要
`,
			tags: ["map", "index"],
		},
		"system",
	);

	return true;
}

export async function createWikiPage(
	db: DbContext,
	scopePath: string,
	input: WikiPageInput,
	updatedBy = "auto",
): Promise<WikiPage> {
	const normalizedScopePath = await ensureWikiWorkspace(db, scopePath);
	const id = randomUUID();
	const now = Date.now();
	const slug = titleToSlug(input.title);

	let finalSlug = slug;
	const existing = await db.client.execute({
		sql: "SELECT id FROM wiki_workspace_pages WHERE scope_path = ? AND slug = ?",
		args: [normalizedScopePath, slug],
	});
	if (existing.rows.length > 0) {
		finalSlug = `${slug}-${Date.now().toString(36)}`;
	}

	await db.client.execute({
		sql: `INSERT INTO wiki_workspace_pages (id, scope_path, title, slug, content, summary, tags, related_page_ids, page_type, confidence, last_updated_by, created_at, updated_at)
			  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			id,
			normalizedScopePath,
			input.title,
			finalSlug,
			input.content,
			input.summary || "",
			JSON.stringify(input.tags || []),
			JSON.stringify(input.related_page_ids || []),
			input.page_type || "entity",
			input.confidence ?? 0.7,
			updatedBy,
			now,
			now,
		],
	});

	return {
		id,
		scope_path: normalizedScopePath,
		title: input.title,
		slug: finalSlug,
		content: input.content,
		summary: input.summary || "",
		tags: input.tags || [],
		related_page_ids: input.related_page_ids || [],
		page_type: input.page_type || "entity",
		confidence: input.confidence ?? 0.7,
		reference_count: 0,
		last_updated_by: updatedBy,
		created_at: now,
		updated_at: now,
	};
}

export async function updateWikiPage(
	db: DbContext,
	pageId: string,
	input: Partial<WikiPageInput>,
	updatedBy = "user",
): Promise<WikiPage | null> {
	const now = Date.now();
	const sets: string[] = ["updated_at = ?", "last_updated_by = ?"];
	const args: unknown[] = [now, updatedBy];

	if (input.title !== undefined) {
		sets.push("title = ?");
		args.push(input.title);
	}
	if (input.content !== undefined) {
		sets.push("content = ?");
		args.push(input.content);
	}
	if (input.summary !== undefined) {
		sets.push("summary = ?");
		args.push(input.summary);
	}
	if (input.tags !== undefined) {
		sets.push("tags = ?");
		args.push(JSON.stringify(input.tags));
	}
	if (input.related_page_ids !== undefined) {
		sets.push("related_page_ids = ?");
		args.push(JSON.stringify(input.related_page_ids));
	}
	if (input.page_type !== undefined) {
		sets.push("page_type = ?");
		args.push(input.page_type);
	}
	if (input.confidence !== undefined) {
		sets.push("confidence = ?");
		args.push(input.confidence);
	}

	args.push(pageId);
	await db.client.execute({
		sql: `UPDATE wiki_workspace_pages SET ${sets.join(", ")} WHERE id = ?`,
		args: args as any,
	});

	return getWikiPage(db, pageId);
}

export async function getWikiPage(
	db: DbContext,
	pageId: string,
): Promise<WikiPage | null> {
	const result = await db.client.execute({
		sql: "SELECT * FROM wiki_workspace_pages WHERE id = ?",
		args: [pageId],
	});
	if (result.rows.length === 0) return null;
	return rowToWikiPage(result.rows[0]);
}

export async function deleteWikiPage(
	db: DbContext,
	pageId: string,
): Promise<void> {
	await db.client.execute({
		sql: "DELETE FROM wiki_workspace_pages WHERE id = ?",
		args: [pageId],
	});
}

export async function listWikiPages(
	db: DbContext,
	scopePath: string,
	options?: { limit?: number; offset?: number },
): Promise<WikiPage[]> {
	const normalizedScopePath = normalizeScopePath(scopePath);
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;

	const result = await db.client.execute({
		sql: `SELECT * FROM wiki_workspace_pages
			  WHERE scope_path = ?
			  ORDER BY updated_at DESC
			  LIMIT ? OFFSET ?`,
		args: [normalizedScopePath, limit, offset],
	});
	return result.rows.map(rowToWikiPage);
}

export async function countWikiPages(
	db: DbContext,
	scopePath: string,
): Promise<number> {
	const normalizedScopePath = normalizeScopePath(scopePath);
	const result = await db.client.execute({
		sql: "SELECT COUNT(*) as cnt FROM wiki_workspace_pages WHERE scope_path = ?",
		args: [normalizedScopePath],
	});
	return Number(result.rows[0]?.cnt ?? 0);
}

export async function searchWikiPages(
	db: DbContext,
	scopePath: string,
	query: string,
	options?: { limit?: number },
): Promise<WikiPage[]> {
	const normalizedScopePath = normalizeScopePath(scopePath);
	const limit = options?.limit ?? 20;

	if (!query.trim()) {
		return listWikiPages(db, normalizedScopePath, { limit });
	}

	const result = await db.client.execute({
		sql: `SELECT wp.* FROM wiki_workspace_pages wp
			  JOIN wiki_workspace_pages_fts fts ON fts.wiki_page_id = wp.id
			  WHERE wp.scope_path = ? AND wiki_workspace_pages_fts MATCH ?
			  ORDER BY rank
			  LIMIT ?`,
		args: [normalizedScopePath, query, limit],
	});
	return result.rows.map(rowToWikiPage);
}

export async function isWikiEnabled(
	db: DbContext,
	scopePath: string,
): Promise<boolean> {
	const normalizedScopePath = normalizeScopePath(scopePath);
	const result = await db.client.execute({
		sql: "SELECT enabled FROM wiki_workspaces WHERE scope_path = ?",
		args: [normalizedScopePath],
	});
	return Number(result.rows[0]?.enabled ?? 0) === 1;
}

export async function enableWiki(
	db: DbContext,
	scopePath: string,
): Promise<void> {
	const normalizedScopePath = await ensureWikiWorkspace(db, scopePath);
	await ensureWikiFilesystem(normalizedScopePath);
	await db.client.execute({
		sql: "UPDATE wiki_workspaces SET enabled = 1, updated_at = ? WHERE scope_path = ?",
		args: [Date.now(), normalizedScopePath],
	});
}

export async function rebuildWikiWorkspace(
	db: DbContext,
	scopePath: string,
): Promise<{ created_map: boolean }> {
	const normalizedScopePath = await ensureWikiWorkspace(db, scopePath);
	await ensureWikiFilesystem(normalizedScopePath);
	const createdMap = await ensureMapPageExists(db, normalizedScopePath);
	return { created_map: createdMap };
}

export async function disableWiki(
	db: DbContext,
	scopePath: string,
): Promise<void> {
	const normalizedScopePath = await ensureWikiWorkspace(db, scopePath);
	await db.client.execute({
		sql: "UPDATE wiki_workspaces SET enabled = 0, updated_at = ? WHERE scope_path = ?",
		args: [Date.now(), normalizedScopePath],
	});
}
