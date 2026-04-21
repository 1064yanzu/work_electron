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
import type {
	WikiPageInput,
	ExtractedPage,
	ExtractionResponse,
} from "./wiki/types";
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
	markSourceSkipped,
} from "./wiki/sourceScanner";
import { createWikiPage, updateWikiPage, listWikiPages } from "./wikiService";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 生成进度的阶段标识 */
export type GenerationPhase =
	| "idle"
	| "preflight"
	| "scanning"
	| "filtering"
	| "extracting"
	| "llm"
	| "linking"
	| "finalizing";

/** 生成状态（模块级） */
export interface GenerationStatus {
	is_generating: boolean;
	scope_path: string | null;
	/** 当前处于生成管线的哪个阶段（让前端能区分「扫描文件」vs「调用 LLM」） */
	phase: GenerationPhase;
	total_sources: number;
	processed_sources: number;
	generated_pages: number;
	current_source_title: string | null;
	error: string | null;
	/** 详细的错误/警告列表，帮助用户诊断问题 */
	warnings: string[];
	/** 本轮被跳过的文件数（内容无法提取 / 提取失败 / LLM 返回空） */
	skipped_count?: number;
	/** schema 中累计的跳过文件数（跨轮次），用于 UI 显示重试按钮 */
	total_skipped_in_schema?: number;
}

// ---------------------------------------------------------------------------
// 模块级状态
// ---------------------------------------------------------------------------

let generationStatus: GenerationStatus = {
	is_generating: false,
	scope_path: null,
	phase: "idle",
	total_sources: 0,
	processed_sources: 0,
	generated_pages: 0,
	current_source_title: null,
	error: null,
	warnings: [],
	skipped_count: 0,
	total_skipped_in_schema: 0,
};

export function getGenerationStatus(): GenerationStatus {
	return { ...generationStatus };
}

export function setGenerationStatus(partial: Partial<GenerationStatus>): void {
	generationStatus = { ...generationStatus, ...partial };
}

function resetStatus(
	scopePath: string,
	totalSources: number,
	phase: GenerationPhase = "preflight",
): void {
	generationStatus = {
		is_generating: true,
		scope_path: scopePath,
		phase,
		total_sources: totalSources,
		processed_sources: 0,
		generated_pages: 0,
		current_source_title: null,
		error: null,
		warnings: [],
		skipped_count: 0,
		total_skipped_in_schema: 0,
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

async function readActiveModel(db: DbContext): Promise<string> {
	try {
		const result = await db.client.execute({
			sql: "SELECT value FROM app_config WHERE key = 'active_model'",
			args: [],
		});
		if (result.rows.length === 0) return "";
		return String(result.rows[0].value || "");
	} catch {
		return "";
	}
}

/**
 * 预检：确认 Wiki 生成模型已配置、对应 Provider 已启用且有 API Key。
 * 失败时返回带用户友好文案的错误信息；成功时返回 null 与最终使用的 model。
 */
async function preflightLlmForWiki(
	db: DbContext,
	explicitModel: string | undefined,
): Promise<{ error: string | null; model: string }> {
	let model = (explicitModel || "").trim();
	if (!model) model = await readConfigModel(db);
	if (!model) model = await readActiveModel(db);

	if (!model) {
		return {
			error:
				"尚未配置 LLM 模型。请在「设置 → 通用 → Wiki 生成模型」中选择一个模型，或在全局激活模型处选择一个。",
			model: "",
		};
	}

	let providers: Array<{
		name: string;
		is_enabled: unknown;
		api_key: unknown;
		models_raw: unknown;
	}>;
	try {
		const rows = await db.client.execute({
			sql: "SELECT name, is_enabled, api_key, models FROM providers",
			args: [],
		});
		providers = rows.rows.map((r) => ({
			name: String(r.name ?? ""),
			is_enabled: r.is_enabled,
			api_key: r.api_key,
			models_raw: r.models,
		}));
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			error: `读取 Provider 列表失败：${msg}`,
			model,
		};
	}

	const matching = providers.filter((p) => {
		try {
			const models: string[] = JSON.parse(String(p.models_raw || "[]"));
			return Array.isArray(models) && models.includes(model);
		} catch {
			return false;
		}
	});

	if (matching.length === 0) {
		return {
			error: `没有 Provider 声明支持模型「${model}」。请在「设置 → 模型」里检查 Provider 的模型列表。`,
			model,
		};
	}

	const enabled = matching.filter((p) => Number(p.is_enabled) === 1);
	if (enabled.length === 0) {
		return {
			error: `模型「${model}」对应的 Provider（${matching.map((p) => p.name).join("、")}）未启用。请在「设置 → 模型」中启用。`,
			model,
		};
	}

	const withKey = enabled.filter((p) => {
		const raw = typeof p.api_key === "string" ? p.api_key : "";
		return raw.trim().length > 0;
	});
	if (withKey.length === 0) {
		return {
			error: `模型「${model}」对应的 Provider（${enabled.map((p) => p.name).join("、")}）缺少 API Key。请在「设置 → 模型」中填写。`,
			model,
		};
	}

	return { error: null, model };
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

	// 立即推送「开始生成」事件，让前端立刻显示状态（避免用户点完按钮后长时间看到空白）
	resetStatus(normalizedPath, 0, "preflight");
	sendProgress(win, getGenerationStatus());

	// 0. 预检 LLM 可用性（越早失败越好，避免用户等待后才收到"生成失败"）
	const preflight = await preflightLlmForWiki(db, model);
	if (preflight.error) {
		setGenerationStatus({
			is_generating: false,
			phase: "idle",
			error: preflight.error,
		});
		sendProgress(win, getGenerationStatus());
		return [];
	}
	const effectiveModel = preflight.model;

	// 1. 确保 Wiki 结构存在
	setGenerationStatus({ phase: "scanning" });
	sendProgress(win, getGenerationStatus());
	await ensureWikiStructure(normalizedPath);
	const wikiRoot = getWikiRoot(normalizedPath);
	const schema = await readSchema(wikiRoot);

	// 2. 扫描源文件
	console.log(`[wikiGeneration] Scanning source files in: ${normalizedPath}`);
	const allFiles = await scanSourceFiles(normalizedPath, schema);

	console.log(
		`[wikiGeneration] Found ${allFiles.length} total files in directory`,
	);

	if (allFiles.length === 0) {
		setGenerationStatus({
			is_generating: false,
			phase: "idle",
			error:
				"当前目录中没有找到可处理的文件（支持 PDF、Markdown、TXT、DOCX、HTML）。请将文件放入工作目录后重试。",
		});
		sendProgress(win, getGenerationStatus());
		return [];
	}

	// 3. 增量过滤：只处理新增/修改的文件
	setGenerationStatus({
		phase: "filtering",
		total_sources: allFiles.length,
		total_skipped_in_schema: Object.keys(schema.skipped_sources || {}).length,
	});
	sendProgress(win, getGenerationStatus());
	const newFiles = await filterNewSources(allFiles, schema);

	console.log(
		`[wikiGeneration] ${newFiles.length} new/modified files to process (${allFiles.length - newFiles.length} already processed)`,
	);

	if (newFiles.length === 0) {
		const skippedCount = Object.keys(schema.skipped_sources || {}).length;
		const processedCount = Object.keys(schema.processed_sources).length;
		// 统计磁盘上实际存在的页面（排除自动生成的知识地图）
		const existingPages = await listAllPages(wikiRoot, normalizedPath);
		const realPageCount = existingPages.filter(
			(p) => p.slug !== "知识地图" && p.title !== "知识地图",
		).length;

		let errorMsg: string;
		if (skippedCount > 0 && realPageCount === 0) {
			// 最棘手的情况：记录里全是「跳过」，磁盘上没有任何真实页面
			errorMsg =
				`扫描到 ${allFiles.length} 个文件，其中 ${skippedCount} 个曾因「无法提取文本」被跳过，` +
				`且当前未生成任何 Wiki 页面。常见原因：PDF 为扫描版（图片型）、文档加密，或文本提取失败。` +
				`可在下方点击「重试跳过的文件」让系统重新尝试，或先用 OCR 处理 PDF 后再导入。`;
		} else if (processedCount > 0 && realPageCount === 0) {
			// 兼容旧数据：历史版本把「跳过」错误记作「已处理」
			errorMsg =
				`检测到 ${processedCount} 个文件被标记为「已处理」，但当前没有对应的 Wiki 页面。` +
				`这通常是历史数据不一致导致的。请点击下方「重置已处理记录」后再试。`;
		} else if (skippedCount > 0) {
			errorMsg =
				`所有新文件都已处理过。另有 ${skippedCount} 个文件曾被跳过，` +
				`如需重新尝试可点击「重试跳过的文件」。`;
		} else {
			errorMsg =
				"所有文件都已处理过。如需重新处理，请修改文件或删除 .llm-wiki/.schema.json 中的对应记录。";
		}

		setGenerationStatus({
			is_generating: false,
			phase: "idle",
			error: errorMsg,
			total_skipped_in_schema: skippedCount,
		});
		sendProgress(win, getGenerationStatus());
		return [];
	}

	// 4. 提取文件内容并过滤（PDF/DOCX/HTML 提取耗时，逐文件推送进度）
	type SourceWithContent = {
		path: string;
		name: string;
		content: string;
		size: number;
	};
	const meaningfulSources: SourceWithContent[] = [];
	const skippedSources: string[] = [];

	setGenerationStatus({
		phase: "extracting",
		total_sources: newFiles.length,
		processed_sources: 0,
	});
	sendProgress(win, getGenerationStatus());

	for (let i = 0; i < newFiles.length; i++) {
		const file = newFiles[i];
		setGenerationStatus({
			processed_sources: i,
			current_source_title: file.name,
		});
		sendProgress(win, getGenerationStatus());
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
				// 标记为「已跳过」而不是「已处理」——下次可通过「重试跳过的文件」重新尝试
				const hash = await computeFileHash(file.path).catch(() => "unknown");
				const detail =
					content.trim().length === 0
						? "未能提取到任何文本，可能是扫描版 PDF 或受保护的文档"
						: `提取到的内容过短或乱码较多（${content.trim().length} 字符）`;
				markSourceSkipped(
					schema,
					file.path,
					hash,
					file.size,
					"content_unusable",
					detail,
				);
			}
		} catch (err) {
			console.warn(
				`[wikiGeneration] Failed to extract content from ${file.name}:`,
				err,
			);
			skippedSources.push(file.name);
			const hash = await computeFileHash(file.path).catch(() => "unknown");
			const detail =
				err instanceof Error
					? err.message.slice(0, 120)
					: String(err).slice(0, 120);
			markSourceSkipped(
				schema,
				file.path,
				hash,
				file.size,
				"extract_failed",
				detail,
			);
		}
	}

	console.log(
		`[wikiGeneration] ${meaningfulSources.length} sources with meaningful content, ` +
			`${skippedSources.length} skipped`,
	);

	if (meaningfulSources.length === 0) {
		setGenerationStatus({
			is_generating: false,
			phase: "idle",
			processed_sources: newFiles.length,
			current_source_title: null,
			skipped_count: skippedSources.length,
			total_skipped_in_schema: Object.keys(schema.skipped_sources || {}).length,
			error:
				`找到 ${newFiles.length} 个新文件，但都无法提取有效文本内容。` +
				`可能原因：PDF 为扫描版（图片型）、文档加密、或文本提取失败。` +
				`这些文件已被记录到「跳过列表」，下次可通过「重试跳过的文件」重新尝试。`,
		});
		await writeSchema(wikiRoot, schema);
		sendProgress(win, getGenerationStatus());
		return [];
	}

	// 5. 使用预检得到的模型（见步骤 0）
	console.log(`[wikiGeneration] Using model: "${effectiveModel}"`);

	// 6. 切换到 LLM 阶段（保留之前积累的 warnings）
	const previousWarnings = getGenerationStatus().warnings;
	setGenerationStatus({
		phase: "llm",
		total_sources: meaningfulSources.length,
		processed_sources: 0,
		generated_pages: 0,
		current_source_title: null,
		warnings:
			skippedSources.length > 0
				? [
						...previousWarnings,
						`跳过了 ${skippedSources.length} 个内容太短或无法识别的文件`,
					]
				: previousWarnings,
	});
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
					warnings: [...currentWarnings, `"${source.name}" 未提取到知识点`],
				});
			}

			// Karpathy pattern：溯源信息记录到每个派生页面的 frontmatter.sources
			const sourceRelPath =
				path.relative(normalizedPath, source.path) || source.name;
			const derivedSlugs: string[] = [];

			for (const page of extracted) {
				try {
					const pageInput: WikiPageInput = {
						title: page.title,
						content: page.content,
						summary: page.summary,
						tags: buildTags(page),
						page_type: page.page_type,
						confidence: 0.7,
						sources: [sourceRelPath],
						aliases: page.aliases ?? [],
					};

					const created = await createWikiPage(normalizedPath, pageInput, "ai");

					createdSlugs.push(created.slug);
					titleToSlugMap.set(page.title, created.slug);
					derivedSlugs.push(created.slug);

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

			// 为当前源创建一张 sources/ 摘要页（Karpathy pattern 要求）
			// 仅在实际派生出页面时创建——因为摘要页的价值是记录"该源贡献了什么"
			if (derivedSlugs.length > 0) {
				try {
					const sourceSummaryInput: WikiPageInput = {
						title: `来源：${source.name}`,
						content: buildSourceSummaryContent(
							source.name,
							sourceRelPath,
							extracted,
						),
						summary: `从《${source.name}》提取了 ${extracted.length} 个知识点`,
						tags: ["source"],
						page_type: "source",
						confidence: 0.9,
						sources: [sourceRelPath],
						related_page_ids: derivedSlugs,
					};
					const createdSource = await createWikiPage(
						normalizedPath,
						sourceSummaryInput,
						"ai",
					);
					createdSlugs.push(createdSource.slug);
					setGenerationStatus({
						generated_pages: createdSlugs.length,
					});
					sendProgress(win, getGenerationStatus());
				} catch (srcErr) {
					console.warn(
						`[wikiGeneration] 创建来源摘要页失败 "${source.name}":`,
						srcErr,
					);
				}
			}

			// 根据实际产出的页面数量，决定标记为「已处理」还是「已跳过」
			const hash = await computeFileHash(source.path).catch(() => "unknown");
			if (extracted.length === 0) {
				// LLM 返回空：标记为跳过（reason=llm_empty），用户换模型后可通过「重试跳过的文件」重新生成
				markSourceSkipped(
					schema,
					source.path,
					hash,
					source.size,
					"llm_empty",
					"LLM 未能从该文档中提取出任何知识点",
				);
			} else {
				markSourceProcessed(schema, source.path, hash, source.size);
			}
		} catch (sourceErr) {
			sourceErrors++;
			const errMsg =
				sourceErr instanceof Error ? sourceErr.message : String(sourceErr);
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
	setGenerationStatus({
		phase: "linking",
		current_source_title: null,
	});
	sendProgress(win, getGenerationStatus());
	await resolveRelatedPages(normalizedPath, titleToSlugMap, pageRelatedTitles);

	// 8. 保存 schema（更新已处理文件记录）
	setGenerationStatus({ phase: "finalizing" });
	sendProgress(win, getGenerationStatus());
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
		phase: "idle",
		processed_sources: meaningfulSources.length,
		current_source_title: null,
		skipped_count: skippedSources.length,
		total_skipped_in_schema: Object.keys(schema.skipped_sources || {}).length,
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

/**
 * 构建 sources/ 摘要页的 Markdown 正文
 *
 * Karpathy pattern：每个摄入的原始文件都对应一张 sources/ 页面，
 * 记录该源贡献了哪些知识点、派生了哪些 Wiki 页面，便于 lint 时溯源。
 */
function buildSourceSummaryContent(
	sourceName: string,
	sourceRelPath: string,
	extracted: ExtractedPage[],
): string {
	const lines: string[] = [];
	lines.push(`> **原始文件**：\`${sourceRelPath}\``);
	lines.push("");
	lines.push(`本页是对《${sourceName}》的结构化摘要，由 AI 自动提取。`);
	lines.push("");

	if (extracted.length > 0) {
		lines.push("## 关键要点");
		lines.push("");
		for (const p of extracted) {
			const typeLabel = typeLabelCn(p.page_type);
			lines.push(`- **${p.title}**（${typeLabel}）：${p.summary}`);
		}
		lines.push("");
		lines.push("## 派生的 Wiki 页面");
		lines.push("");
		for (const p of extracted) {
			lines.push(`- [[${p.title}]]`);
		}
	}

	return lines.join("\n");
}

function typeLabelCn(type: string): string {
	switch (type) {
		case "entity":
			return "实体";
		case "concept":
			return "概念";
		case "summary":
			return "综合";
		case "workflow":
			return "流程";
		default:
			return type;
	}
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
