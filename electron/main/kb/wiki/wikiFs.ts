/**
 * Wiki 文件系统 CRUD 操作
 * 所有 Wiki 页面以 Markdown + YAML frontmatter 形式存储在 .llm-wiki/ 目录中
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { WikiPage, WikiSchema } from "./types";
import {
	WIKI_DIR_NAME,
	WIKI_SUBDIRS,
	SCHEMA_FILE_NAME,
	INDEX_FILE_NAME,
	LOG_FILE_NAME,
	DEFAULT_WIKI_SCHEMA,
} from "./types";
import { parseFrontmatter, serializeFrontmatter, titleToSlug, getPageDir } from "./frontmatter";
import type { WikiFrontmatter } from "./types";

// ---------------------------------------------------------------------------
// 路径工具
// ---------------------------------------------------------------------------

export function getWikiRoot(scopePath: string): string {
	return path.join(path.resolve(scopePath), WIKI_DIR_NAME);
}

function getSchemaPath(wikiRoot: string): string {
	return path.join(wikiRoot, SCHEMA_FILE_NAME);
}

/**
 * 根据 slug 和 page_type 确定 Wiki 页面文件的完整路径
 * - 有 page_type 映射的放到子目录
 * - 其他放到根目录
 */
function resolvePagePath(wikiRoot: string, slug: string, pageType: string): string {
	const dir = getPageDir(pageType);
	if (dir) {
		return path.join(wikiRoot, dir, `${slug}.md`);
	}
	return path.join(wikiRoot, `${slug}.md`);
}

// ---------------------------------------------------------------------------
// Schema 读写
// ---------------------------------------------------------------------------

export async function readSchema(wikiRoot: string): Promise<WikiSchema> {
	try {
		const raw = await fs.readFile(getSchemaPath(wikiRoot), "utf-8");
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_WIKI_SCHEMA, ...parsed };
	} catch {
		return { ...DEFAULT_WIKI_SCHEMA, created_at: Date.now() };
	}
}

export async function writeSchema(
	wikiRoot: string,
	schema: WikiSchema,
): Promise<void> {
	await fs.writeFile(
		getSchemaPath(wikiRoot),
		JSON.stringify(schema, null, 2),
		"utf-8",
	);
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/**
 * 确保 .llm-wiki/ 目录结构和基础文件存在
 */
export async function ensureWikiStructure(
	scopePath: string,
): Promise<string> {
	const wikiRoot = getWikiRoot(scopePath);

	// 创建子目录
	for (const subdir of WIKI_SUBDIRS) {
		await fs.mkdir(path.join(wikiRoot, subdir), { recursive: true });
	}

	// 初始化 .schema.json
	const schemaPath = getSchemaPath(wikiRoot);
	try {
		await fs.access(schemaPath);
	} catch {
		await writeSchema(wikiRoot, {
			...DEFAULT_WIKI_SCHEMA,
			created_at: Date.now(),
		});
	}

	// 初始化 index.md
	const indexPath = path.join(wikiRoot, INDEX_FILE_NAME);
	try {
		await fs.access(indexPath);
	} catch {
		const scopeName = path.basename(path.resolve(scopePath)) || scopePath;
		await fs.writeFile(indexPath, buildInitialIndex(scopeName), "utf-8");
	}

	// 初始化 log.md
	const logPath = path.join(wikiRoot, LOG_FILE_NAME);
	try {
		await fs.access(logPath);
	} catch {
		await fs.writeFile(logPath, "# Wiki Log\n\n", "utf-8");
	}

	return wikiRoot;
}

// ---------------------------------------------------------------------------
// 读取操作
// ---------------------------------------------------------------------------

/**
 * 扫描 .llm-wiki/ 下的所有 .md 页面文件（排除 index.md 和 log.md）
 * 解析每个文件的 frontmatter，返回 WikiPage 数组
 */
export async function listAllPages(
	wikiRoot: string,
	scopePath: string,
): Promise<WikiPage[]> {
	const pages: WikiPage[] = [];
	const excludeFiles = new Set([INDEX_FILE_NAME, LOG_FILE_NAME]);

	// 扫描根目录的 .md 文件
	await scanDir(wikiRoot, pages, scopePath, excludeFiles);

	// 扫描子目录
	for (const subdir of WIKI_SUBDIRS) {
		const subdirPath = path.join(wikiRoot, subdir);
		try {
			await fs.access(subdirPath);
			await scanDir(subdirPath, pages, scopePath, new Set());
		} catch {
			// 子目录不存在则跳过
		}
	}

	// 按 updated_at 降序排序
	pages.sort((a, b) => b.updated_at - a.updated_at);

	return pages;
}

async function scanDir(
	dirPath: string,
	pages: WikiPage[],
	scopePath: string,
	excludeFiles: Set<string>,
): Promise<void> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		if (excludeFiles.has(entry.name)) continue;
		// 跳过 .schema.json 等隐藏文件
		if (entry.name.startsWith(".")) continue;

		const filePath = path.join(dirPath, entry.name);
		try {
			const raw = await fs.readFile(filePath, "utf-8");
			const page = fileToWikiPage(raw, entry.name, scopePath);
			if (page) pages.push(page);
		} catch {
			// 单个文件读取失败不影响整体
		}
	}
}

/**
 * 读取单个 Wiki 页面
 * 会遍历所有可能的位置查找
 */
export async function readPage(
	wikiRoot: string,
	slug: string,
	scopePath: string,
): Promise<WikiPage | null> {
	// 在所有可能的位置查找
	const candidates = [
		path.join(wikiRoot, `${slug}.md`),
		...WIKI_SUBDIRS.map((d) => path.join(wikiRoot, d, `${slug}.md`)),
	];

	for (const filePath of candidates) {
		try {
			const raw = await fs.readFile(filePath, "utf-8");
			const fileName = path.basename(filePath);
			return fileToWikiPage(raw, fileName, scopePath);
		} catch {
			// 文件不存在，尝试下一个
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// 写入操作
// ---------------------------------------------------------------------------

/**
 * 写入一个 Wiki 页面到文件系统
 * 自动根据 page_type 放到对应子目录
 */
export async function writePage(
	wikiRoot: string,
	scopePath: string,
	input: {
		title: string;
		content: string;
		summary?: string;
		tags?: string[];
		related_page_ids?: string[];
		page_type?: string;
		confidence?: number;
		last_updated_by?: string;
	},
	existingSlug?: string,
): Promise<WikiPage> {
	const now = Date.now();
	const slug = existingSlug || titleToSlug(input.title);
	const pageType = input.page_type || "entity";

	// 如果是更新，先尝试读取旧页面获取 created_at
	let createdAt = now;
	if (existingSlug) {
		const existing = await readPage(wikiRoot, existingSlug, scopePath);
		if (existing) {
			createdAt = existing.created_at || now;
			// 如果 page_type 改变了，需要删除旧文件
			if (existing.page_type !== pageType) {
				await deletePageFile(wikiRoot, existingSlug);
			}
		}
	}

	const fm: WikiFrontmatter = {
		title: input.title,
		slug,
		page_type: pageType,
		summary: input.summary || "",
		tags: input.tags || [],
		related_pages: input.related_page_ids || [],
		confidence: input.confidence ?? 0.7,
		last_updated_by: input.last_updated_by || "auto",
		created_at: createdAt,
		updated_at: now,
	};

	const fileContent = serializeFrontmatter(fm, input.content);
	const filePath = resolvePagePath(wikiRoot, slug, pageType);

	// 确保目录存在
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, fileContent, "utf-8");

	return frontmatterToWikiPage(fm, input.content, scopePath);
}

/**
 * 删除 Wiki 页面文件
 */
export async function deletePageFile(
	wikiRoot: string,
	slug: string,
): Promise<boolean> {
	// 在所有可能的位置查找并删除
	const candidates = [
		path.join(wikiRoot, `${slug}.md`),
		...WIKI_SUBDIRS.map((d) => path.join(wikiRoot, d, `${slug}.md`)),
	];

	for (const filePath of candidates) {
		try {
			await fs.unlink(filePath);
			return true;
		} catch {
			// 文件不存在，尝试下一个
		}
	}

	return false;
}

// ---------------------------------------------------------------------------
// 搜索
// ---------------------------------------------------------------------------

/**
 * 基于文本的多维度搜索，替代 FTS5
 */
export async function searchPages(
	wikiRoot: string,
	scopePath: string,
	query: string,
	limit = 20,
): Promise<WikiPage[]> {
	const allPages = await listAllPages(wikiRoot, scopePath);

	if (!query.trim()) {
		return allPages.slice(0, limit);
	}

	const queryLower = query.toLowerCase();

	const scored = allPages.map((page) => {
		let score = 0;
		const titleLower = page.title.toLowerCase();
		const summaryLower = page.summary.toLowerCase();
		const contentLower = page.content.toLowerCase();

		// 标题精确匹配（最高权重）
		if (titleLower === queryLower) score += 100;
		else if (titleLower.includes(queryLower)) score += 50;

		// 摘要匹配
		if (summaryLower.includes(queryLower)) score += 30;

		// 标签匹配
		if (page.tags.some((t) => t.toLowerCase().includes(queryLower)))
			score += 20;

		// 内容匹配
		if (contentLower.includes(queryLower)) score += 10;

		return { page, score };
	});

	return scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((s) => s.page);
}

/**
 * 统计页面数量
 */
export async function countPages(wikiRoot: string): Promise<number> {
	const pages = await listAllPages(wikiRoot, "");
	return pages.length;
}

// ---------------------------------------------------------------------------
// 启用 / 禁用检测
// ---------------------------------------------------------------------------

/**
 * 检查 Wiki 是否已启用（.llm-wiki/ 目录存在）
 */
export async function isWikiDirExists(scopePath: string): Promise<boolean> {
	try {
		const wikiRoot = getWikiRoot(scopePath);
		const stat = await fs.stat(wikiRoot);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * 禁用 Wiki：将 .llm-wiki 重命名为 .llm-wiki.disabled
 */
export async function disableWikiDir(scopePath: string): Promise<void> {
	const wikiRoot = getWikiRoot(scopePath);
	const disabledPath = `${wikiRoot}.disabled`;

	try {
		// 如果已经有 .disabled 目录，先删除
		try {
			await fs.rm(disabledPath, { recursive: true, force: true });
		} catch {
			// ignore
		}
		await fs.rename(wikiRoot, disabledPath);
	} catch {
		// 如果重命名失败，尝试直接删除
		await fs.rm(wikiRoot, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// 内部工具函数
// ---------------------------------------------------------------------------

/**
 * 将文件内容解析为 WikiPage
 */
function fileToWikiPage(
	raw: string,
	fileName: string,
	scopePath: string,
): WikiPage | null {
	const { frontmatter, content } = parseFrontmatter(raw);

	// 如果没有 title，用文件名
	if (!frontmatter.title) {
		frontmatter.title = fileName.replace(/\.md$/, "");
	}
	// 如果没有 slug，从文件名推导
	if (!frontmatter.slug) {
		frontmatter.slug = fileName.replace(/\.md$/, "");
	}

	return frontmatterToWikiPage(frontmatter, content, scopePath);
}

function frontmatterToWikiPage(
	fm: WikiFrontmatter,
	content: string,
	scopePath: string,
): WikiPage {
	return {
		id: fm.slug, // slug 即 ID
		scope_path: scopePath,
		title: fm.title,
		slug: fm.slug,
		content,
		summary: fm.summary,
		tags: fm.tags,
		related_page_ids: fm.related_pages,
		page_type: fm.page_type || "entity",
		confidence: fm.confidence ?? 0.7,
		reference_count: 0,
		last_updated_by: fm.last_updated_by || "auto",
		created_at: fm.created_at || Date.now(),
		updated_at: fm.updated_at || Date.now(),
	};
}

function buildInitialIndex(scopeName: string): string {
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
