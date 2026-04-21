/**
 * Wiki 系统共享类型定义
 * 基于 Karpathy 的 LLM Wiki 三层架构：Raw Sources → Wiki → Schema
 */

// ---------------------------------------------------------------------------
// Wiki 页面
// ---------------------------------------------------------------------------

/** Wiki 页面（对应一个 .md 文件 + YAML frontmatter） */
export interface WikiPage {
	/** slug 即为 ID（等于文件名去掉 .md） */
	id: string;
	scope_path: string;
	title: string;
	slug: string;
	content: string;
	summary: string;
	tags: string[];
	related_page_ids: string[];
	/** entity | concept | summary | workflow | source | comparison | map */
	page_type: string;
	confidence: number;
	reference_count: number;
	last_updated_by: string;
	created_at: number;
	updated_at: number;
	/** 溯源：该页面的知识来自哪些原始文件（Karpathy pattern 的 sources 字段） */
	sources: string[];
	/** 可信度状态：active | stub | needs-update | deprecated */
	status: WikiPageStatus;
	/** 别名（用于跨文档检索同一实体 / 概念） */
	aliases: string[];
}

/** 页面可信度状态（对齐 Karpathy pattern 的 status 字段） */
export type WikiPageStatus = "active" | "stub" | "needs-update" | "deprecated";

/** 创建/更新 Wiki 页面的输入 */
export interface WikiPageInput {
	title: string;
	content: string;
	summary?: string;
	tags?: string[];
	related_page_ids?: string[];
	page_type?: string;
	confidence?: number;
	sources?: string[];
	status?: WikiPageStatus;
	aliases?: string[];
}

// ---------------------------------------------------------------------------
// Frontmatter 元数据
// ---------------------------------------------------------------------------

/** 存储在 Markdown 文件 YAML frontmatter 中的元数据 */
export interface WikiFrontmatter {
	title: string;
	slug: string;
	page_type: string;
	summary: string;
	tags: string[];
	related_pages: string[];
	confidence: number;
	last_updated_by: string;
	created_at: number;
	updated_at: number;
	/** 溯源文件的相对路径（相对 scopePath）或绝对路径 */
	sources: string[];
	/** 页面状态 */
	status: WikiPageStatus;
	/** 别名列表 */
	aliases: string[];
}

// ---------------------------------------------------------------------------
// Schema 配置（.schema.json）
// ---------------------------------------------------------------------------

/** 已处理（成功生成过至少 1 个 Wiki 页面）的源文件记录 */
export interface ProcessedSourceEntry {
	hash: string;
	processed_at: number;
	size: number;
}

/** 跳过原因 */
export type SkippedReason =
	/** 提取到的文本太短或非打印字符占比过高（疑似扫描版 PDF / 加密文档） */
	| "content_unusable"
	/** 提取过程本身抛错（PDF 解析失败、编码错误等） */
	| "extract_failed"
	/** LLM 没返回任何页面 */
	| "llm_empty";

/**
 * 被跳过的源文件记录
 * 区别于 processed_sources：这类文件「扫描到了但没能产生页面」，
 * 下次若文件 hash / size 未变化仍会被跳过（避免浪费时间），
 * 用户可以在 UI 中主动点击「重试跳过的文件」来清空本表并重试。
 */
export interface SkippedSourceEntry {
	hash: string;
	skipped_at: number;
	size: number;
	reason: SkippedReason;
	/** 人类可读的说明（用于 UI 展示），如「PDF 可能是扫描版，无法提取文本」 */
	reason_detail?: string;
}

/** .schema.json 配置 */
export interface WikiSchema {
	version: number;
	created_at: number;
	processed_sources: Record<string, ProcessedSourceEntry>;
	/** 被跳过的源文件（扫描到但未能生成页面），独立于 processed_sources */
	skipped_sources: Record<string, SkippedSourceEntry>;
	scan_extensions: string[];
	scan_ignore_patterns: string[];
}

/** 默认 schema 配置 */
export const DEFAULT_WIKI_SCHEMA: WikiSchema = {
	version: 1,
	created_at: Date.now(),
	processed_sources: {},
	skipped_sources: {},
	scan_extensions: [".pdf", ".md", ".txt", ".docx", ".doc", ".html", ".htm"],
	scan_ignore_patterns: [
		"node_modules",
		".git",
		".llm-wiki",
		"dist",
		"build",
		".next",
		".cache",
		"__pycache__",
		".venv",
		"venv",
	],
};

// ---------------------------------------------------------------------------
// 扫描结果
// ---------------------------------------------------------------------------

/** 扫描到的源文件信息 */
export interface ScannedSource {
	/** 绝对路径 */
	path: string;
	/** 文件名（含扩展名） */
	name: string;
	/** 扩展名（小写，含点号） */
	ext: string;
	/** 文件大小（字节） */
	size: number;
}

/** LLM 返回的单个知识页面结构 */
export interface ExtractedPage {
	title: string;
	page_type: "entity" | "concept" | "summary" | "workflow";
	summary: string;
	content: string;
	tags: string[];
	related_titles: string[];
	/** 可选：LLM 推断的别名（例如缩写、同义词） */
	aliases?: string[];
}

/** LLM 提取响应 */
export interface ExtractionResponse {
	pages: ExtractedPage[];
}

// ---------------------------------------------------------------------------
// 日志操作类型
// ---------------------------------------------------------------------------

export type LogOperation =
	| "init"
	| "ingest"
	| "create"
	| "update"
	| "delete"
	| "rebuild";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

export const WIKI_DIR_NAME = ".llm-wiki";
export const SCHEMA_FILE_NAME = ".schema.json";
export const INDEX_FILE_NAME = "index.md";
export const LOG_FILE_NAME = "log.md";
/** Karpathy pattern 的操作手册（给 Agent 读） */
export const SCHEMA_DOC_FILE_NAME = "SCHEMA.md";

/** page_type 到子目录的映射 */
export const PAGE_TYPE_DIRS: Record<string, string> = {
	entity: "entities",
	concept: "concepts",
	workflow: "workflows",
	source: "sources",
	comparison: "comparisons",
	map: "maps",
};

/** 支持的子目录列表（Karpathy pattern：entities/concepts/sources/comparisons/maps + workflows） */
export const WIKI_SUBDIRS = [
	"entities",
	"concepts",
	"workflows",
	"sources",
	"comparisons",
	"maps",
];
