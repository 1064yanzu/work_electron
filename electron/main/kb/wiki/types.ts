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
	/** entity | concept | summary | workflow */
	page_type: string;
	confidence: number;
	reference_count: number;
	last_updated_by: string;
	created_at: number;
	updated_at: number;
}

/** 创建/更新 Wiki 页面的输入 */
export interface WikiPageInput {
	title: string;
	content: string;
	summary?: string;
	tags?: string[];
	related_page_ids?: string[];
	page_type?: string;
	confidence?: number;
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
}

// ---------------------------------------------------------------------------
// Schema 配置（.schema.json）
// ---------------------------------------------------------------------------

/** 已处理的源文件记录 */
export interface ProcessedSourceEntry {
	hash: string;
	processed_at: number;
	size: number;
}

/** .schema.json 配置 */
export interface WikiSchema {
	version: number;
	created_at: number;
	processed_sources: Record<string, ProcessedSourceEntry>;
	scan_extensions: string[];
	scan_ignore_patterns: string[];
}

/** 默认 schema 配置 */
export const DEFAULT_WIKI_SCHEMA: WikiSchema = {
	version: 1,
	created_at: Date.now(),
	processed_sources: {},
	scan_extensions: [
		".pdf",
		".md",
		".txt",
		".docx",
		".doc",
		".html",
		".htm",
	],
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

/** page_type 到子目录的映射 */
export const PAGE_TYPE_DIRS: Record<string, string> = {
	entity: "entities",
	concept: "concepts",
	workflow: "workflows",
};

/** 支持的子目录列表 */
export const WIKI_SUBDIRS = ["entities", "concepts", "workflows"];
