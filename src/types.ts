export type Uuid = string;
export type DateTime = string; // ISO 8601 string

// 项目
export interface Project {
	id: Uuid;
	name: string;
	description?: string;
	color: string;
	icon: string;
	is_archived: boolean;
	created_at: DateTime;
	updated_at: DateTime;
}

// 文件夹（支持多级树）
export interface Folder {
	id: Uuid;
	project_id?: Uuid;
	parent_id?: Uuid;
	name: string;
	color: string;
	icon: string;
	created_at: DateTime;
	updated_at: DateTime;
}

export enum SourceType {
	Web = "web",
	Document = "document",
	Audio = "audio",
	Text = "text",
	Image = "image",
}

// 资料来源（区分手动添加、浏览器剪存等）
export enum SourceOrigin {
	Manual = "manual",
	BrowserClip = "browser_clip",
	WebSearch = "web_search",
	Import = "import",
}

// 资料分类
export enum SourceCategory {
	Article = "article",
	Video = "video",
	Audio = "audio",
	Image = "image",
	Document = "document",
	Social = "social",
	Reference = "reference",
	Other = "other",
}

export interface Source {
	id: Uuid;
	title: string;
	kind: SourceType;
	tags: string[];
	url?: string;
	project_id?: Uuid;
	folder_id?: Uuid;
	source_type?: SourceOrigin; // 资料来源
	category?: SourceCategory; // 资料分类
	description?: string; // 摘要/描述
	thumbnail?: string; // 缩略图
	author?: string; // 作者
	published_at?: DateTime; // 原文发布时间
	created_at: DateTime;
	updated_at: DateTime;
}

export interface SourceDetail {
	source: Source;
	note?: Note;
}

export interface Note {
	id: Uuid;
	source_id?: Uuid;
	content: string;
	content_html?: string; // 清洗后的 HTML 内容（保留图片/视频等多媒体）
	created_at: DateTime;
	updated_at: DateTime;
}

export interface NoteChunkSearchHit {
	chunk_id: Uuid;
	note_id: Uuid;
	source_id?: Uuid;
	source_title?: string;
	chunk_index: number;
	score: number;
	snippet: string;
}

export enum WorkflowNodeType {
	Llm = "llm",
	Skill = "skill",
	Mcp = "mcp",
	Manual = "manual",
}

export enum NodeStatus {
	Pending = "pending",
	Running = "running",
	Completed = "completed",
	Failed = "failed",
}

export interface WorkflowNode {
	id: Uuid;
	name: string;
	node_type: WorkflowNodeType;
	input_sources: Uuid[];
	output_notes: Uuid[];
	status: NodeStatus;
	created_at: DateTime;
	updated_at: DateTime;
}

export interface WorkflowRunLog {
	id: Uuid;
	node_id: Uuid;
	status: NodeStatus;
	summary?: string;
	created_at: DateTime;
}

export enum OutputType {
	Article = "article",
	Report = "report",
	Thread = "thread",
	NoteCollection = "note_collection",
	Diagram = "diagram",
}

export interface OutputAsset {
	id: Uuid;
	title: string;
	content: string;
	output_type: OutputType;
	related_notes: Uuid[];
	project_id?: Uuid;
	version: number;
	created_at: DateTime;
	updated_at: DateTime;
}

export interface DashboardStats {
	sources_count: number;
	notes_count: number;
	projects_count: number;
	outputs_count: number;
}

// Command Payloads
export interface CreateSourcePayload {
	title: string;
	kind: SourceType;
	tags?: string[];
	url?: string;
	project_id?: Uuid;
	folder_id?: Uuid;
}

export interface UpdateSourcePayload {
	id: Uuid;
	title?: string;
	kind?: SourceType;
	tags?: string[];
	url?: string | null;
	project_id?: Uuid | null;
	folder_id?: Uuid | null;
}

export interface SearchSourcePayload {
	keyword?: string;
	tag?: string;
	kind?: SourceType;
}

export interface CreateNotePayload {
	content: string;
	source_id?: Uuid;
}

export interface UpdateNotePayload {
	id: Uuid;
	content?: string;
	content_html?: string;
	source_id?: Uuid | null;
}

export interface CreateWorkflowPayload {
	name: string;
	node_type: WorkflowNodeType;
	input_sources?: Uuid[];
	output_notes?: Uuid[];
	status?: NodeStatus;
}

export interface UpdateWorkflowPayload {
	id: Uuid;
	name?: string;
	node_type?: WorkflowNodeType;
	status?: NodeStatus;
	input_sources?: Uuid[];
	output_notes?: Uuid[];
}

export interface AppendWorkflowLogPayload {
	node_id: Uuid;
	status: NodeStatus;
	summary?: string;
}

export interface ListWorkflowLogsPayload {
	node_id?: Uuid;
	limit?: number;
}

export interface CreateOutputPayload {
	title: string;
	content: string;
	output_type: OutputType;
	related_notes?: Uuid[];
	project_id?: Uuid;
}

export interface UpdateOutputPayload {
	id: Uuid;
	title?: string;
	content?: string;
	output_type?: OutputType;
	related_notes?: Uuid[];
}

// Provider Types
export enum ProviderType {
	OpenAi = "openai",
	Anthropic = "anthropic",
	Deepseek = "deepseek",
	Ollama = "ollama",
	Dify = "dify",
	Custom = "custom",
}

export interface Provider {
	id: Uuid;
	name: string;
	provider_type: ProviderType;
	is_enabled: boolean;
	api_key?: string;
	api_base?: string;
	models: string[];
	metadata: any;
	created_at: DateTime;
	updated_at: DateTime;
}

export interface UpsertProviderPayload {
	id?: Uuid;
	name: string;
	provider_type: ProviderType;
	is_enabled: boolean;
	api_key?: string;
	api_base?: string;
	models?: string[];
	metadata?: any;
}

export interface InvokeLlmPayload {
	model: string;
	prompt: string;
	context?: string[];
	temperature?: number;
}

export interface LlmResponse {
	content: string;
	model: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface FetchUrlPayload {
	url: string;
	title?: string;
	tags?: string[];
	project_id?: Uuid;
	folder_id?: Uuid;
}

export interface UploadFilePayload {
	title: string;
	content: string;
	file_type: string;
	tags?: string[];
	project_id?: Uuid;
	folder_id?: Uuid;
}

export interface ImportLocalFilesPayload {
	paths: string[];
	tags?: string[];
	project_id?: Uuid;
	folder_id?: Uuid;
}

// Folders
export interface CreateFolderPayload {
	name: string;
	project_id?: Uuid;
	parent_id?: Uuid;
	color?: string;
	icon?: string;
}

export interface UpdateFolderPayload {
	id: Uuid;
	name?: string;
	parent_id?: Uuid | null;
	color?: string;
	icon?: string;
}

export interface MoveSourcesToFolderPayload {
	source_ids: Uuid[];
	folder_id?: Uuid;
}

export interface ApiKeyCheckResult {
	valid: boolean;
	message: string;
}

// Web 搜索
export interface WebSearchPayload {
	query: string;
	engine?: "google" | "bing" | "duckduckgo";
}

export interface WebSearchResult {
	title: string;
	url: string;
	snippet: string;
}

// ==================== 分享卡片 ====================

export interface Card {
	id: Uuid;
	title: string; // 卡片标题（来源文章标题）
	text: string; // 卡片正文内容（用户选中的文本）
	image_path: string; // PNG 文件路径（相对于 cards 目录）
	source_url?: string; // 来源 URL
	theme_id?: string; // 主题 ID
	font_id?: string; // 字体 ID
	aspect_ratio?: string; // 比例
	created_at: DateTime;
	updated_at: DateTime;
}
