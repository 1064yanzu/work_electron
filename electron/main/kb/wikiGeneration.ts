/**
 * Wiki 知识页面生成服务
 * 基于 LLM 从已有资料（sources + notes）自动提取知识点并生成 Wiki 页面
 */
import type { BrowserWindow } from "electron";
import type { DbContext } from "../db/client";
import { invokeLlm } from "../llm/invoke";
import {
	createWikiPage,
	updateWikiPage,
	listWikiPages,
	type WikiPageInput,
} from "./wikiService";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 从数据库查询出的资料 + 笔记内容 */
interface SourceWithNote {
	id: string;
	title: string;
	kind: string;
	content: string;
}

/** LLM 返回的单个知识页面结构 */
interface ExtractedPage {
	title: string;
	page_type: "entity" | "concept" | "summary" | "workflow";
	summary: string;
	content: string;
	tags: string[];
	related_titles: string[];
}

/** LLM 提取响应 */
interface ExtractionResponse {
	pages: ExtractedPage[];
}

/** 生成状态（模块级） */
export interface GenerationStatus {
	is_generating: boolean;
	scope_path: string | null;
	total_sources: number;
	processed_sources: number;
	generated_pages: number;
	current_source_title: string | null;
	error: string | null;
}

// ---------------------------------------------------------------------------
// 模块级状态
// ---------------------------------------------------------------------------

let generationStatus: GenerationStatus = {
	is_generating: false,
	scope_path: null,
	total_sources: 0,
	processed_sources: 0,
	generated_pages: 0,
	current_source_title: null,
	error: null,
};

export function getGenerationStatus(): GenerationStatus {
	return { ...generationStatus };
}

export function setGenerationStatus(partial: Partial<GenerationStatus>): void {
	generationStatus = { ...generationStatus, ...partial };
}

function resetStatus(scopePath: string, totalSources: number): void {
	generationStatus = {
		is_generating: true,
		scope_path: scopePath,
		total_sources: totalSources,
		processed_sources: 0,
		generated_pages: 0,
		current_source_title: null,
		error: null,
	};
}

// ---------------------------------------------------------------------------
// 内容截断
// ---------------------------------------------------------------------------

const MAX_CONTENT_LENGTH = 6000;

function truncateContent(content: string): string {
	if (content.length <= MAX_CONTENT_LENGTH) return content;
	return `${content.slice(0, MAX_CONTENT_LENGTH)}\n\n[... 内容已截断，共 ${content.length} 字 ...]`;
}

// ---------------------------------------------------------------------------
// LLM Prompt
// ---------------------------------------------------------------------------

function buildExtractionPrompt(title: string, content: string): string {
	const truncated = truncateContent(content);
	return `你是一个知识库管理助手。请分析以下文档内容，提取关键知识点。

文档标题：${title}
文档内容：
${truncated}

请以 JSON 格式返回，包含以下字段：
{
  "pages": [
    {
      "title": "页面标题",
      "page_type": "entity|concept|summary|workflow",
      "summary": "一句话摘要",
      "content": "详细的 Markdown 内容，至少200字",
      "tags": ["标签1", "标签2"],
      "related_titles": ["相关页面标题1", "相关页面标题2"]
    }
  ]
}

规则：
- entity: 具体的工具、产品、人物、组织、项目
- concept: 抽象的方法论、理论、原理、模式
- summary: 对原文档的结构化摘要
- workflow: 操作流程、步骤、SOP
- 每个知识点独立成页，不要合并
- content 使用 Markdown 格式，包含 [[双向链接]] 引用相关概念
- 如果文档内容太短或无法提取有意义的知识，返回空的 pages 数组
- 仅返回 JSON，不要包含额外解释文字`;
}

// ---------------------------------------------------------------------------
// JSON 解析（容错）
// ---------------------------------------------------------------------------

/**
 * 尝试从 LLM 响应中解析 JSON。
 * LLM 有时会在 JSON 前后附加 Markdown 代码围栏或解释文字，
 * 因此先尝试直接解析，失败后用正则提取。
 */
function parseExtractionJson(raw: string): ExtractionResponse {
	// 1. 直接解析
	try {
		const parsed = JSON.parse(raw);
		if (isValidExtractionResponse(parsed)) return parsed;
	} catch {
		// 继续尝试提取
	}

	// 2. 提取代码围栏中的 JSON
	const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	if (fenceMatch?.[1]) {
		try {
			const parsed = JSON.parse(fenceMatch[1]);
			if (isValidExtractionResponse(parsed)) return parsed;
		} catch {
			// 继续
		}
	}

	// 3. 提取最外层花括号
	const braceMatch = raw.match(/\{[\s\S]*\}/);
	if (braceMatch?.[0]) {
		try {
			const parsed = JSON.parse(braceMatch[0]);
			if (isValidExtractionResponse(parsed)) return parsed;
		} catch {
			// 无法解析
		}
	}

	// 无法提取有效 JSON
	return { pages: [] };
}

function isValidExtractionResponse(obj: unknown): obj is ExtractionResponse {
	if (!obj || typeof obj !== "object") return false;
	const record = obj as Record<string, unknown>;
	return Array.isArray(record.pages);
}

// ---------------------------------------------------------------------------
// 数据库查询
// ---------------------------------------------------------------------------

async function fetchSourcesWithNotes(
	db: DbContext,
	scopePath: string,
): Promise<SourceWithNote[]> {
	const result = await db.client.execute({
		sql: `SELECT s.id, s.title, s.kind, n.content
			  FROM sources s
			  JOIN notes n ON n.source_id = s.id
			  WHERE s.scope = ? OR s.storage_path LIKE ?`,
		args: [scopePath, `${scopePath}%`],
	});

	return result.rows.map((row) => ({
		id: String(row.id),
		title: String(row.title || ""),
		kind: String(row.kind || ""),
		content: String(row.content || ""),
	}));
}

async function readConfigModel(db: DbContext): Promise<string> {
	const result = await db.client.execute({
		sql: "SELECT value FROM app_config WHERE key = 'wiki_generation_model'",
		args: [],
	});
	if (result.rows.length === 0) return "";
	return String(result.rows[0].value || "");
}

// ---------------------------------------------------------------------------
// 进度通知
// ---------------------------------------------------------------------------

function sendProgress(
	mainWindow: BrowserWindow | null,
	status: GenerationStatus,
): void {
	mainWindow?.webContents.send("wiki_generation_progress", status);
}

// ---------------------------------------------------------------------------
// 核心生成流程
// ---------------------------------------------------------------------------

/**
 * 从已有资料生成 Wiki 页面的主入口。
 *
 * @param db        数据库上下文
 * @param scopePath 工作目录路径（用于隔离 Wiki 页面）
 * @param mainWindow 可选，Electron 主窗口（用于发送进度事件）
 * @param model     可选，指定 LLM 模型。未提供时从 app_config 读取，再回退到默认。
 * @returns 生成的页面 ID 列表
 */
export async function generateWikiFromSources(
	db: DbContext,
	scopePath: string,
	mainWindow?: BrowserWindow | null,
	model?: string,
): Promise<string[]> {
	const win = mainWindow ?? null;

	// 1. 获取符合条件的资料
	const sources = await fetchSourcesWithNotes(db, scopePath);

	if (sources.length === 0) {
		return [];
	}

	// 2. 确定使用的模型
	let effectiveModel = model || "";
	if (!effectiveModel) {
		effectiveModel = await readConfigModel(db);
	}

	// 3. 初始化状态
	resetStatus(scopePath, sources.length);
	sendProgress(win, getGenerationStatus());

	// 记录所有新建页面的 ID，以及 title -> id 映射（用于后续关联）
	const createdPageIds: string[] = [];
	const titleToIdMap = new Map<string, string>();
	// 记录每个页面声明的 related_titles（用于第二轮关联）
	const pageRelatedTitles = new Map<string, string[]>();

	// 4. 逐资料提取并创建页面
	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];

		setGenerationStatus({
			processed_sources: i,
			current_source_title: source.title,
		});
		sendProgress(win, getGenerationStatus());

		// 跳过空内容
		if (!source.content.trim()) {
			continue;
		}

		try {
			const extracted = await extractPagesFromSource(
				db,
				source,
				effectiveModel,
			);

			for (const page of extracted) {
				try {
					const wikiInput: WikiPageInput = {
						title: page.title,
						content: page.content,
						summary: page.summary,
						tags: buildTags(page),
						page_type: page.page_type,
						confidence: 0.7,
					};

					const created = await createWikiPage(db, scopePath, wikiInput, "ai");

					createdPageIds.push(created.id);
					titleToIdMap.set(page.title, created.id);

					if (page.related_titles && page.related_titles.length > 0) {
						pageRelatedTitles.set(created.id, page.related_titles);
					}

					setGenerationStatus({
						generated_pages: createdPageIds.length,
					});
					sendProgress(win, getGenerationStatus());
				} catch (pageErr) {
					console.warn(
						`[wikiGeneration] 创建页面失败 "${page.title}":`,
						pageErr,
					);
					// 单个页面失败不中断整体流程
				}
			}
		} catch (sourceErr) {
			console.warn(
				`[wikiGeneration] 处理资料失败 "${source.title}":`,
				sourceErr,
			);
			// 单个资料失败不中断整体流程
		}
	}

	// 5. 第二轮：关联 related_page_ids
	await resolveRelatedPages(db, titleToIdMap, pageRelatedTitles, scopePath);

	// 6. 标记完成
	setGenerationStatus({
		is_generating: false,
		processed_sources: sources.length,
		current_source_title: null,
	});
	sendProgress(win, getGenerationStatus());

	return createdPageIds;
}

// ---------------------------------------------------------------------------
// LLM 调用：从单个 source 提取页面
// ---------------------------------------------------------------------------

async function extractPagesFromSource(
	db: DbContext,
	source: SourceWithNote,
	model: string,
): Promise<ExtractedPage[]> {
	const prompt = buildExtractionPrompt(source.title, source.content);

	const result = await invokeLlm(db, {
		model,
		prompt,
		temperature: 0.3,
	});

	const extraction = parseExtractionJson(result.content);
	return validateExtractedPages(extraction.pages);
}

// ---------------------------------------------------------------------------
// 校验与标签构建
// ---------------------------------------------------------------------------

/** 过滤掉不合法的页面条目 */
function validateExtractedPages(pages: unknown[]): ExtractedPage[] {
	if (!Array.isArray(pages)) return [];

	const valid: ExtractedPage[] = [];
	for (const item of pages) {
		if (!item || typeof item !== "object") continue;
		const p = item as Record<string, unknown>;

		const title = typeof p.title === "string" ? p.title.trim() : "";
		const content = typeof p.content === "string" ? p.content.trim() : "";
		const summary = typeof p.summary === "string" ? p.summary.trim() : "";
		const pageType = typeof p.page_type === "string" ? p.page_type : "concept";

		// 必须有标题和内容
		if (!title || !content) continue;

		const tags = Array.isArray(p.tags)
			? (p.tags.filter((t) => typeof t === "string") as string[])
			: [];
		const relatedTitles = Array.isArray(p.related_titles)
			? (p.related_titles.filter((t) => typeof t === "string") as string[])
			: [];

		const validTypes = new Set(["entity", "concept", "summary", "workflow"]);
		const normalizedType = validTypes.has(pageType) ? pageType : "concept";

		valid.push({
			title,
			page_type: normalizedType as ExtractedPage["page_type"],
			summary,
			content,
			tags,
			related_titles: relatedTitles,
		});
	}

	return valid;
}

/** 将 page_type 合并到 tags 列表中 */
function buildTags(page: ExtractedPage): string[] {
	const tags = new Set(page.tags);
	tags.add(page.page_type);
	return Array.from(tags);
}

// ---------------------------------------------------------------------------
// 关联解析：将 related_titles 映射为 related_page_ids
// ---------------------------------------------------------------------------

async function resolveRelatedPages(
	db: DbContext,
	titleToIdMap: Map<string, string>,
	pageRelatedTitles: Map<string, string[]>,
	scopePath: string,
): Promise<void> {
	if (pageRelatedTitles.size === 0) return;

	// 加载该 scope 下所有已有页面，补充 title -> id 映射
	const existingPages = await listWikiPages(db, scopePath, {
		limit: 10000,
		offset: 0,
	});
	const fullTitleMap = new Map<string, string>(titleToIdMap);
	for (const existing of existingPages) {
		if (!fullTitleMap.has(existing.title)) {
			fullTitleMap.set(existing.title, existing.id);
		}
	}

	// 逐页面更新 related_page_ids
	for (const [pageId, relatedTitles] of Array.from(
		pageRelatedTitles.entries(),
	)) {
		const resolvedIds: string[] = [];
		for (const relTitle of relatedTitles) {
			const matchedId = fullTitleMap.get(relTitle);
			if (matchedId && matchedId !== pageId) {
				resolvedIds.push(matchedId);
			}
		}

		if (resolvedIds.length > 0) {
			try {
				await updateWikiPage(
					db,
					pageId,
					{ related_page_ids: resolvedIds },
					"ai",
				);
			} catch (err) {
				console.warn(`[wikiGeneration] 更新关联失败 pageId=${pageId}:`, err);
			}
		}
	}
}
