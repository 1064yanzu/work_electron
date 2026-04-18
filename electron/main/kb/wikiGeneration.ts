/**
 * Wiki 知识页面生成服务（文件系统驱动版）
 *
 * 替代原来从 DB 查询 sources+notes 的逻辑，改为直接扫描目录中的文件。
 * 仍需 DbContext 参数——仅用于 invokeLlm 的 provider 配置查找。
 */
import path from "node:path";
import type { BrowserWindow } from "electron";
import type { DbContext } from "../db/client";
import { invokeLlm } from "../llm/invoke";
import type { WikiPageInput, ExtractedPage, ExtractionResponse } from "./wiki/types";
import {
	getWikiRoot,
	ensureWikiStructure,
	listAllPages,
	readSchema,
	writeSchema,
} from "./wiki/wikiFs";
import { rebuildIndex, appendLog } from "./wiki/indexLog";
import {
	scanSourceFiles,
	filterNewSources,
	extractFileContent,
	computeFileHash,
	markSourceProcessed,
} from "./wiki/sourceScanner";
import {
	createWikiPage,
	updateWikiPage,
	listWikiPages,
} from "./wikiService";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 生成状态（模块级） */
export interface GenerationStatus {
	is_generating: boolean;
	scope_path: string | null;
	total_sources: number;
	processed_sources: number;
	generated_pages: number;
	current_source_title: string | null;
	error: string | null;
	/** 详细的错误/警告列表，帮助用户诊断问题 */
	warnings: string[];
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
	warnings: [],
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
		warnings: [],
	};
}

// ---------------------------------------------------------------------------
// 内容质量检查
// ---------------------------------------------------------------------------

const MIN_MEANINGFUL_CONTENT_LENGTH = 50;

/**
 * 检查内容是否有足够的文本量来进行知识提取。
 */
function isContentMeaningful(content: string): boolean {
	const trimmed = content.trim();
	if (trimmed.length < MIN_MEANINGFUL_CONTENT_LENGTH) return false;
	const printableCount = [...trimmed].filter(
		(ch) => ch.charCodeAt(0) >= 32 || ch === "\n" || ch === "\t",
	).length;
	return printableCount / trimmed.length > 0.7;
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

function parseExtractionJson(raw: string): ExtractionResponse {
	// 1. 直接解析
	try {
		const parsed = JSON.parse(raw);
		if (isValidExtractionResponse(parsed)) return parsed;
	} catch {
		// 继续尝试
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

	return { pages: [] };
}

function isValidExtractionResponse(obj: unknown): obj is ExtractionResponse {
	if (!obj || typeof obj !== "object") return false;
	const record = obj as Record<string, unknown>;
	return Array.isArray(record.pages);
}

// ---------------------------------------------------------------------------
// 读取配置模型
// ---------------------------------------------------------------------------

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
// 核心生成流程（文件系统驱动）
// ---------------------------------------------------------------------------

/**
 * 从目录中的文件生成 Wiki 页面的主入口。
 *
 * @param db        数据库上下文（仅用于 invokeLlm provider 配置）
 * @param scopePath 工作目录路径
 * @param mainWindow 可选，Electron 主窗口（用于发送进度事件）
 * @param model     可选，指定 LLM 模型
 * @returns 生成的页面 slug 列表
 */
export async function generateWikiFromSources(
	db: DbContext,
	scopePath: string,
	mainWindow?: BrowserWindow | null,
	model?: string,
): Promise<string[]> {
	const win = mainWindow ?? null;
	const normalizedPath = path.resolve(scopePath);

	// 0. 确保 Wiki 结构存在
	await ensureWikiStructure(normalizedPath);
	const wikiRoot = getWikiRoot(normalizedPath);
	const schema = await readSchema(wikiRoot);

	// 1. 扫描源文件
	console.log(
		`[wikiGeneration] Scanning source files in: ${normalizedPath}`,
	);
	const allFiles = await scanSourceFiles(normalizedPath, schema);

	console.log(
		`[wikiGeneration] Found ${allFiles.length} total files in directory`,
	);

	if (allFiles.length === 0) {
		resetStatus(normalizedPath, 0);
		setGenerationStatus({
			is_generating: false,
			error:
				"当前目录中没有找到可处理的文件（支持 PDF、Markdown、TXT、DOCX、HTML）。请将文件放入工作目录后重试。",
		});
		sendProgress(win, getGenerationStatus());
		return [];
	}

	// 2. 增量过滤：只处理新增/修改的文件
	const newFiles = await filterNewSources(allFiles, schema);

	console.log(
		`[wikiGeneration] ${newFiles.length} new/modified files to process (${allFiles.length - newFiles.length} already processed)`,
	);

	if (newFiles.length === 0) {
		resetStatus(normalizedPath, 0);
		setGenerationStatus({
			is_generating: false,
			error:
				"所有文件都已处理过。如需重新处理，请修改文件或删除 .llm-wiki/.schema.json 中的对应记录。",
		});
		sendProgress(win, getGenerationStatus());
		return [];
	}

	// 3. 提取文件内容并过滤
	type SourceWithContent = { path: string; name: string; content: string; size: number };
	const meaningfulSources: SourceWithContent[] = [];
	const skippedSources: string[] = [];

	for (const file of newFiles) {
		try {
			const content = await extractFileContent(file.path);
			if (isContentMeaningful(content)) {
				meaningfulSources.push({
					path: file.path,
					name: file.name,
					content,
					size: file.size,
				});
			} else {
				skippedSources.push(file.name);
				// 即使内容不可用，也标记为已处理，避免重复尝试
				const hash = await computeFileHash(file.path).catch(() => "unknown");
				markSourceProcessed(schema, file.path, hash, file.size);
			}
		} catch (err) {
			console.warn(`[wikiGeneration] Failed to extract content from ${file.name}:`, err);
			skippedSources.push(file.name);
		}
	}

	console.log(
		`[wikiGeneration] ${meaningfulSources.length} sources with meaningful content, ` +
			`${skippedSources.length} skipped`,
	);

	if (meaningfulSources.length === 0) {
		resetStatus(normalizedPath, 0);
		setGenerationStatus({
			is_generating: false,
			error:
				`找到 ${newFiles.length} 个新文件，但都无法提取有效文本内容。` +
				`可能原因：PDF 为扫描版（图片型）、文档加密、或文本提取失败。`,
		});
		await writeSchema(wikiRoot, schema);
		sendProgress(win, getGenerationStatus());
		return [];
	}

	// 4. 确定使用的模型
	let effectiveModel = model || "";
	if (!effectiveModel) {
		effectiveModel = await readConfigModel(db);
	}
	if (!effectiveModel) {
		try {
			const activeModelResult = await db.client.execute({
				sql: "SELECT value FROM app_config WHERE key = 'active_model'",
				args: [],
			});
			if (activeModelResult.rows.length > 0) {
				effectiveModel = String(activeModelResult.rows[0].value || "");
			}
		} catch {
			// ignore
		}
	}

	console.log(
		`[wikiGeneration] Using model: "${effectiveModel}" (empty = invokeLlm will use active model fallback)`,
	);

	// 5. 初始化状态
	resetStatus(normalizedPath, meaningfulSources.length);
	if (skippedSources.length > 0) {
		setGenerationStatus({
			warnings: [
				`跳过了 ${skippedSources.length} 个内容太短或无法识别的文件`,
			],
		});
	}
	sendProgress(win, getGenerationStatus());

	// 6. 逐文件提取并创建页面
	const createdSlugs: string[] = [];
	const titleToSlugMap = new Map<string, string>();
	const pageRelatedTitles = new Map<string, string[]>();
	let sourceErrors = 0;

	for (let i = 0; i < meaningfulSources.length; i++) {
		const source = meaningfulSources[i];

		setGenerationStatus({
			processed_sources: i,
			current_source_title: source.name,
		});
		sendProgress(win, getGenerationStatus());

		try {
			const extracted = await extractPagesFromSource(
				db,
				{ title: source.name, content: source.content },
				effectiveModel,
			);

			if (extracted.length === 0) {
				console.log(
					`[wikiGeneration] No pages extracted from "${source.name}" (LLM returned empty)`,
				);
				const currentWarnings = getGenerationStatus().warnings || [];
				setGenerationStatus({
					warnings: [
						...currentWarnings,
						`"${source.name}" 未提取到知识点`,
					],
				});
			}

			for (const page of extracted) {
				try {
					const pageInput: WikiPageInput = {
						title: page.title,
						content: page.content,
						summary: page.summary,
						tags: buildTags(page),
						page_type: page.page_type,
						confidence: 0.7,
					};

					const created = await createWikiPage(
						normalizedPath,
						pageInput,
						"ai",
					);

					createdSlugs.push(created.slug);
					titleToSlugMap.set(page.title, created.slug);

					if (page.related_titles && page.related_titles.length > 0) {
						pageRelatedTitles.set(created.slug, page.related_titles);
					}

					setGenerationStatus({
						generated_pages: createdSlugs.length,
					});
					sendProgress(win, getGenerationStatus());
				} catch (pageErr) {
					console.warn(
						`[wikiGeneration] 创建页面失败 "${page.title}":`,
						pageErr,
					);
				}
			}

			// 标记源文件为已处理
			const hash = await computeFileHash(source.path).catch(() => "unknown");
			markSourceProcessed(schema, source.path, hash, source.size);
		} catch (sourceErr) {
			sourceErrors++;
			const errMsg =
				sourceErr instanceof Error
					? sourceErr.message
					: String(sourceErr);
			console.warn(
				`[wikiGeneration] 处理文件失败 "${source.name}":`,
				sourceErr,
			);
			const currentWarnings = getGenerationStatus().warnings || [];
			setGenerationStatus({
				warnings: [
					...currentWarnings,
					`"${source.name}" 处理失败: ${errMsg.slice(0, 100)}`,
				],
			});
			sendProgress(win, getGenerationStatus());
		}
	}

	// 7. 关联 related_page_ids
	await resolveRelatedPages(normalizedPath, titleToSlugMap, pageRelatedTitles);

	// 8. 保存 schema（更新已处理文件记录）
	await writeSchema(wikiRoot, schema);

	// 9. 重建 index.md 和追加日志
	const allPages = await listAllPages(wikiRoot, normalizedPath);
	const displayName = path.basename(normalizedPath) || normalizedPath;
	await rebuildIndex(wikiRoot, allPages, displayName);
	await appendLog(
		wikiRoot,
		"ingest",
		`处理 ${meaningfulSources.length} 个文件，生成 ${createdSlugs.length} 个页面`,
	);

	// 10. 标记完成
	const finalError =
		createdSlugs.length === 0
			? sourceErrors > 0
				? `所有 ${sourceErrors} 个文件处理都失败了，请检查 LLM 配置是否正确（Provider 是否启用、API Key 是否有效）`
				: "LLM 未能从文件中提取出知识点，可能需要更丰富的文档内容"
			: null;

	setGenerationStatus({
		is_generating: false,
		processed_sources: meaningfulSources.length,
		current_source_title: null,
		error: finalError,
	});
	sendProgress(win, getGenerationStatus());

	return createdSlugs;
}

// ---------------------------------------------------------------------------
// LLM 调用：从单个 source 提取页面
// ---------------------------------------------------------------------------

async function extractPagesFromSource(
	db: DbContext,
	source: { title: string; content: string },
	model: string,
): Promise<ExtractedPage[]> {
	const prompt = buildExtractionPrompt(source.title, source.content);

	console.log(
		`[wikiGeneration] Calling LLM for source "${source.title}" (content length: ${source.content.length})`,
	);

	let result: { content: string };
	try {
		result = await invokeLlm(db, {
			model,
			prompt,
			temperature: 0.3,
		});
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		console.error(
			`[wikiGeneration] LLM call failed for "${source.title}": ${errMsg}`,
		);
		throw new Error(`LLM 调用失败: ${errMsg}`);
	}

	if (!result.content || !result.content.trim()) {
		console.warn(
			`[wikiGeneration] LLM returned empty content for "${source.title}"`,
		);
		return [];
	}

	console.log(
		`[wikiGeneration] LLM response for "${source.title}": ${result.content.slice(0, 200)}...`,
	);

	const extraction = parseExtractionJson(result.content);
	return validateExtractedPages(extraction.pages);
}

// ---------------------------------------------------------------------------
// 校验与标签构建
// ---------------------------------------------------------------------------

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

function buildTags(page: ExtractedPage): string[] {
	const tags = new Set(page.tags);
	tags.add(page.page_type);
	return Array.from(tags);
}

// ---------------------------------------------------------------------------
// 关联解析：将 related_titles 映射为 related_page_ids（slugs）
// ---------------------------------------------------------------------------

async function resolveRelatedPages(
	scopePath: string,
	titleToSlugMap: Map<string, string>,
	pageRelatedTitles: Map<string, string[]>,
): Promise<void> {
	if (pageRelatedTitles.size === 0) return;

	// 加载所有已有页面，补充 title -> slug 映射
	const existingPages = await listWikiPages(scopePath, {
		limit: 10000,
		offset: 0,
	});
	const fullTitleMap = new Map<string, string>(titleToSlugMap);
	for (const existing of existingPages) {
		if (!fullTitleMap.has(existing.title)) {
			fullTitleMap.set(existing.title, existing.slug);
		}
	}

	// 逐页面更新 related_page_ids
	for (const [pageSlug, relatedTitles] of Array.from(
		pageRelatedTitles.entries(),
	)) {
		const resolvedSlugs: string[] = [];
		for (const relTitle of relatedTitles) {
			const matchedSlug = fullTitleMap.get(relTitle);
			if (matchedSlug && matchedSlug !== pageSlug) {
				resolvedSlugs.push(matchedSlug);
			}
		}

		if (resolvedSlugs.length > 0) {
			try {
				await updateWikiPage(
					scopePath,
					pageSlug,
					{ related_page_ids: resolvedSlugs },
					"ai",
				);
			} catch (err) {
				console.warn(`[wikiGeneration] 更新关联失败 slug=${pageSlug}:`, err);
			}
		}
	}
}
