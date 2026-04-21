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
	SCHEMA_DOC_FILE_NAME,
	DEFAULT_WIKI_SCHEMA,
} from "./types";
import {
	parseFrontmatter,
	serializeFrontmatter,
	titleToSlug,
	getPageDir,
} from "./frontmatter";
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
function resolvePagePath(
	wikiRoot: string,
	slug: string,
	pageType: string,
): string {
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
 * 如果存在 .llm-wiki.disabled/ 旧目录，自动恢复（与 disableWikiDir 对称）
 */
export async function ensureWikiStructure(scopePath: string): Promise<string> {
	const wikiRoot = getWikiRoot(scopePath);
	const disabledPath = `${wikiRoot}.disabled`;

	// 若主目录不存在但存在 .disabled 备份，则恢复（保留历史页面）
	try {
		await fs.access(wikiRoot);
	} catch {
		try {
			const stat = await fs.stat(disabledPath);
			if (stat.isDirectory()) {
				await fs.rename(disabledPath, wikiRoot);
			}
		} catch {
			// 没有 .disabled 目录，继续正常初始化
		}
	}

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

	// 初始化 / 补齐 SCHEMA.md（Karpathy pattern 的"操作手册"）
	// 每次 ensure 都会重写该文件——因为它是系统规范，不是用户编辑的内容
	const schemaDocPath = path.join(wikiRoot, SCHEMA_DOC_FILE_NAME);
	await fs.writeFile(schemaDocPath, buildSchemaDoc(), "utf-8");

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
		sources?: string[];
		status?: "active" | "stub" | "needs-update" | "deprecated";
		aliases?: string[];
	},
	existingSlug?: string,
): Promise<WikiPage> {
	const now = Date.now();
	const pageType = input.page_type || "entity";

	let slug: string;
	let createdAt = now;
	let existingSources: string[] = [];

	if (existingSlug) {
		slug = existingSlug;
		const existing = await readPage(wikiRoot, existingSlug, scopePath);
		if (existing) {
			createdAt = existing.created_at || now;
			existingSources = existing.sources || [];
			if (existing.page_type !== pageType) {
				await deletePageFile(wikiRoot, existingSlug);
			}
		}
	} else {
		slug = await allocateUniqueSlug(wikiRoot, titleToSlug(input.title));
	}

	// 合并 sources：新来的 + 已有的，去重
	const mergedSources = Array.from(
		new Set([...(input.sources || []), ...existingSources]),
	);

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
		sources: mergedSources,
		status: input.status || "active",
		aliases: input.aliases || [],
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
 * 查找页面文件的实际物理路径（用于文档编辑器打开真实文件）
 * 如果文件不存在返回 null
 */
export async function resolvePageFilePath(
	scopePath: string,
	slug: string,
): Promise<string | null> {
	const wikiRoot = getWikiRoot(scopePath);
	const candidates = [
		path.join(wikiRoot, `${slug}.md`),
		...WIKI_SUBDIRS.map((d) => path.join(wikiRoot, d, `${slug}.md`)),
	];
	for (const filePath of candidates) {
		try {
			const stat = await fs.stat(filePath);
			if (stat.isFile()) return filePath;
		} catch {
			// continue
		}
	}
	return null;
}

/**
 * 给新建页面分配不冲突的 slug，冲突时追加 -2 / -3 后缀
 */
async function allocateUniqueSlug(
	wikiRoot: string,
	baseSlug: string,
): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	while (await pageSlugExists(wikiRoot, candidate)) {
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
		if (suffix > 1000) {
			candidate = `${baseSlug}-${Date.now()}`;
			break;
		}
	}
	return candidate;
}

async function pageSlugExists(
	wikiRoot: string,
	slug: string,
): Promise<boolean> {
	const candidates = [
		path.join(wikiRoot, `${slug}.md`),
		...WIKI_SUBDIRS.map((d) => path.join(wikiRoot, d, `${slug}.md`)),
	];
	for (const filePath of candidates) {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			// continue
		}
	}
	return false;
}

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
		sources: fm.sources || [],
		status: fm.status || "active",
		aliases: fm.aliases || [],
	};
}

function buildInitialIndex(scopeName: string): string {
	return `# ${scopeName} Wiki

> 原始资料目录：当前线程工作目录本身

## 入口
- [知识地图](./知识地图.md)
- [变更日志](./log.md)
- [操作规范 SCHEMA](./SCHEMA.md)

## 目录约定
- \`entities/\`：实体、项目对象、关键人物、组织、组件
- \`concepts/\`：概念、术语、方法、原理
- \`workflows/\`：流程、规范、SOP、操作路径
- \`sources/\`：单个原始文件的摘要页（每摄入一个源生成一页，Karpathy pattern）
- \`comparisons/\`：对比分析（跨多源的对照表）
- \`maps/\`：主题导航页（概念集群入口）
`;
}

/**
 * 构建 SCHEMA.md —— Karpathy pattern 的操作手册
 *
 * 这份文件给 Agent 读，定义 wiki 的结构约定、工作流（ingest/query/lint/回填）
 * 与 frontmatter 规范。每次 ensureWikiStructure 都会重写它，用户不应手动编辑。
 */
function buildSchemaDoc(): string {
	return `# Wiki 操作规范（Agent 读我）

本文件是本 Wiki 的 **Schema / 操作手册**，参考 Andrej Karpathy 的 LLM Wiki pattern。
凡是以 Agent 身份与本目录交互，都必须先读这份文件。

## 三层架构

\`\`\`
工作目录（= scope / cwd）
├── <原始资料>              # 第一层：Raw Sources —— 只读、不可变（真相锚点）
└── .llm-wiki/              # 第二层：Wiki —— 由 LLM 维护的编译产物
    ├── SCHEMA.md           # 第三层：操作手册（就是本文件）
    ├── index.md            # 动态维护的总索引
    ├── log.md              # 追加式操作日志
    ├── entities/           # 实体（人物、组织、项目、工具）
    ├── concepts/           # 概念、术语、理论
    ├── workflows/          # 流程、SOP、操作路径
    ├── sources/            # 单个原始文件的摘要（每摄入 1 源 = 1 页）
    ├── comparisons/        # 跨多源的对比分析
    └── maps/               # 主题导航页（概念集群的入口）
\`\`\`

**不可变规则**：原始资料（raw sources）只读。你可以 Read 它，不能 Edit 它。
Wiki（\`.llm-wiki/\` 下的所有文件）由你负责写，可以 Read / Write / Edit。

## 页面 frontmatter 规范

每个 \`.md\` 文件都必须以 YAML frontmatter 开头：

\`\`\`yaml
---
title: "页面标题"               # 必填
slug: "page-slug"              # 必填，等于文件名去掉 .md
page_type: "concept"           # 必填，见下方枚举
summary: "1-2 句话摘要"         # 必填
tags: [tag1, tag2]             # 必填（可为空数组）
aliases: [别名1, 别名2]         # 可选，同义词/缩写
related_pages: [other-slug]    # 可选，指向其他页面 slug
sources:                       # 可选，该页面知识来自哪些原始文件（相对/绝对路径都行）
  - raw/articles/foo.md
confidence: 0.7                # 0-1，交叉验证越多越高
status: "active"               # active | stub | needs-update | deprecated
last_updated_by: "auto"        # "auto" = LLM 生成 | "user" = 用户手动
created_at: 1713500000000
updated_at: 1713500000000
---
\`\`\`

### page_type 枚举

| type | 目录 | 含义 |
|---|---|---|
| entity | entities/ | 实体：人物、组织、具体项目、工具 |
| concept | concepts/ | 概念：理论、术语、方法、原理 |
| workflow | workflows/ | 流程：SOP、操作路径、协议 |
| source | sources/ | 来源摘要：单个原始文件的要点提炼（必填 sources 字段，记录原路径） |
| comparison | comparisons/ | 对比分析：2+ 实体或概念的并排对照 |
| map | maps/ | 主题导航：概念集群的入口，充当子索引 |
| summary | （根）| 综合性总结 |

## 三大工作流

### 工作流一：ingest（摄入新原始文件）

用户说"摄入 X 文件"或"把 X 加入 wiki"时：

1. 用 Read 读完整原始文件
2. 向用户报告 2-3 个关键要点，问是否重点关注某方面
3. 在 \`.llm-wiki/sources/\` 下创建 \`<slug>.md\`，page_type=source，sources 记录原路径
4. 更新或创建相关 \`entities/\`、\`concepts/\` 页面；每个页面都把这次的源追加到 sources 字段
5. 扫描其他页面与新信息的矛盾，在矛盾处用 \`> ⚠️ 矛盾：...\` 标注
6. 更新所有被改动页面的 related_pages（双向）
7. 用 Edit 更新 \`index.md\`（把新页面加入对应类型小节）
8. 用 Edit 追加 \`log.md\`（格式见下）
9. 向用户报告：创建了什么、更新了什么、有无矛盾

### 工作流二：query（回答查询）

用户问 wiki 相关问题时：

1. 先读 \`index.md\` 找到相关页面
2. 读相关页面（可能 2-5 个）
3. 综合回答，**必须**注明引用来自哪些 wiki 页面（用 \`[[slug]]\` 格式）
4. 如果回答产生了有价值的新综合，询问用户是否回填为新页面（见工作流四）

### 工作流三：lint（健康检查）

用户说"lint wiki"或"wiki 健康检查"时：

1. 列出所有页面，构建入链/出链图
2. 报告：
   - **矛盾**：不同页面的陈述冲突
   - **孤儿**：没有被任何页面 related_pages 指向的页面（index/log/SCHEMA 不算）
   - **stub**：正文少于 100 字的 status=active 页面
   - **needs-update**：被新 source 影响但尚未更新的页面
   - **frontmatter 缺失**：缺必填字段
   - **断链**：related_pages 指向不存在的 slug
3. 建议下一步：该摄入什么新来源、该扩展哪些 stub

### 工作流四：回填（backfill）

每次你向用户产出新的综合、对比、假设推演时，先自问"这值得在 wiki 里留一页吗？"
如果是：

1. 选择合适的 page_type（通常是 concept、comparison 或 map）
2. 写到对应子目录，frontmatter 里 last_updated_by=auto，sources 记录你综合的 wiki 页面
3. 追加到 log.md

不要把"查询"当成"聊完就忘"。有价值的探索要变成持久页面。

## 日志格式（log.md）

每条记录一段，\`## [YYYY-MM-DD] <op> | <title>\` 开头，便于 grep：

\`\`\`md
## [2026-04-19] ingest | 摄入 foo.pdf
- Source: raw/foo.pdf
- Pages created: sources/foo.md, concepts/bar.md
- Pages updated: entities/baz.md
- Contradictions: none

## [2026-04-19] query | 问：RAG 和 LLM Wiki 的区别？
- Pages consulted: concepts/rag.md, concepts/llm-wiki.md
- Filed back: yes → comparisons/rag-vs-llm-wiki.md
\`\`\`

## 写作风格

- 使用中文；专有名词保留原文
- 每段第一句是结论，后续句支撑
- 交叉引用用 \`[[target-slug]]\`
- 引用原始资料用 \`[foo.pdf](路径)\` 或 frontmatter 的 sources 字段
- confidence：单源 → 0.5~0.6；2-3 源 → 0.7~0.8；5+ 源或权威来源 → 0.9+
`;
}
