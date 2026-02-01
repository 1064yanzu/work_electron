/**
 * 核心业务类型定义
 */

// ==================
// 枚举类型
// ==================

/** 资料载体类型 */
export type SourceKind = "web" | "document" | "audio" | "text" | "image";

/** 资料来源 */
export type SourceOrigin = "manual" | "browser_clip" | "web_search" | "import";

/** 资料分类 */
export type SourceCategory =
	| "article"
	| "video"
	| "audio"
	| "image"
	| "document"
	| "social"
	| "reference"
	| "other";

/** 产出类型 */
export type OutputType =
	| "article"
	| "report"
	| "thread"
	| "note_collection"
	| "diagram";

/** Provider 类型 */
export type ProviderType =
	| "openai"
	| "anthropic"
	| "deepseek"
	| "ollama"
	| "dify"
	| "custom";

export type Card = {
	id: string;
	title: string;
	text: string;
	image_path: string;
	source_url?: string;
	theme_id?: string;
	font_id?: string;
	aspect_ratio?: string;
	created_at: number;
	updated_at: number;
};

export type DailyActivity = {
	date: string;
	count: number;
};

/** 工作流节点类型 */
export type WorkflowNodeType = "llm" | "skill" | "mcp" | "manual";

/** 节点状态 */
export type NodeStatus = "pending" | "running" | "completed" | "failed";

/** Agent 任务状态 */
export type AgentTaskStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "canceled"
	| "paused";

/** Agent 工具调用状态 */
export type AgentToolCallStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "canceled"
	| "awaiting_permission";

// ==================
// 实体类型
// ==================

export interface Project {
	id: string;
	name: string;
	description?: string;
	color: string;
	icon: string;
	is_archived: boolean;
	created_at: number;
	updated_at: number;
}

export interface Folder {
	id: string;
	project_id?: string;
	parent_id?: string;
	name: string;
	color?: string;
	icon?: string;
	created_at: number;
	updated_at: number;
}

export interface Source {
	id: string;
	title: string;
	kind: SourceKind;
	tags: string[];
	url?: string;
	project_id?: string;
	folder_id?: string;
	source_type: SourceOrigin;
	category: SourceCategory;
	description?: string;
	thumbnail?: string;
	author?: string;
	published_at?: number;
	created_at: number;
	updated_at: number;
}

export interface Note {
	id: string;
	source_id?: string;
	content: string;
	content_html?: string;
	created_at: number;
	updated_at: number;
}

export interface NoteChunk {
	id: string;
	note_id: string;
	source_id?: string;
	chunk_index: number;
	content: string;
	created_at: number;
	updated_at: number;
}

export interface Provider {
	id: string;
	name: string;
	provider_type: ProviderType;
	is_enabled: boolean;
	api_key?: string;
	api_base?: string;
	models: string[];
	metadata: Record<string, unknown>;
	template_id?: string;
	created_at: number;
	updated_at: number;
}

export interface OutputAsset {
	id: string;
	title: string;
	content: string;
	output_type: OutputType;
	related_notes: string[];
	project_id?: string;
	version: number;
	created_at: number;
	updated_at: number;
}

export interface AppConfig {
	key: string;
	value: string;
	updated_at: number;
}

// ==================
// Payload 类型
// ==================

export interface CreateProjectPayload {
	name: string;
	description?: string;
	color?: string;
	icon?: string;
}

export interface UpdateProjectPayload {
	id: string;
	name?: string;
	description?: string;
	color?: string;
	icon?: string;
	is_archived?: boolean;
}

export interface CreateFolderPayload {
	name: string;
	project_id?: string;
	parent_id?: string;
	color?: string;
	icon?: string;
}

export interface UpdateFolderPayload {
	id: string;
	name?: string;
	color?: string;
	icon?: string;
}

export interface CreateSourcePayload {
	title: string;
	kind: SourceKind;
	tags?: string[];
	url?: string;
	project_id?: string;
	folder_id?: string;
	source_type?: SourceOrigin;
	category?: SourceCategory;
	description?: string;
	author?: string;
}

export interface UpdateSourcePayload {
	id: string;
	title?: string;
	tags?: string[];
	folder_id?: string | null;
	category?: SourceCategory;
	description?: string;
}

export interface CreateNotePayload {
	source_id?: string;
	content: string;
	content_html?: string;
}

export interface UpdateNotePayload {
	id: string;
	content?: string;
	content_html?: string;
}

export interface UpsertProviderPayload {
	id?: string;
	name: string;
	provider_type: ProviderType;
	is_enabled?: boolean;
	api_key?: string;
	api_base?: string;
	models?: string[];
	metadata?: Record<string, unknown>;
	template_id?: string;
}

export interface CreateOutputPayload {
	title: string;
	content: string;
	output_type: OutputType;
	related_notes?: string[];
	project_id?: string;
}

export interface UpdateOutputPayload {
	id: string;
	title?: string;
	content?: string;
	output_type?: OutputType;
	related_notes?: string[];
}

// ==================
// LLM 相关类型
// ==================

export interface InvokeLlmPayload {
	model: string;
	prompt: string;
	context?: string[];
	temperature?: number;
}

export interface InvokeLlmResult {
	content: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface StreamChunk {
	content: string;
	done: boolean;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

// ==================
// Agent Runtime（前端回放/持久化）
// ==================

export interface AgentSession {
	id: string;
	title?: string;
	status: "active" | "archived";
	config_json?: unknown;
	created_at: number;
	updated_at: number;
}

export interface AgentMessage {
	id: string;
	session_id: string;
	task_id?: string;
	role: string;
	content_json: unknown;
	agent_session_id?: string;
	created_at: number;
	updated_at: number;
}

// ==================
// 统计类型
// ==================

export interface DashboardStats {
	sources_count: number;
	notes_count: number;
	projects_count: number;
	outputs_count: number;
}

// ==================
// Agent 产物类型
// ==================

/** 产物文件类型 */
export type ArtifactFileType =
	| "image"
	| "pdf"
	| "text"
	| "code"
	| "html"
	| "video"
	| "audio"
	| "archive"
	| "document"
	| "spreadsheet"
	| "presentation"
	| "other";

/** 产物元数据 */
export interface ArtifactMetadata {
	id: string;
	session_id: string;
	file_name: string;
	file_path: string;
	file_type: ArtifactFileType;
	file_size: number;
	mime_type: string;
	tool_call_id?: string;
	description?: string;
	created_at: number;
	expires_at?: number;
}

/** 产物设置 */
export interface ArtifactSettings {
	storage_path: string;
	auto_cleanup: boolean;
	retention_days: number;
	max_per_session: number;
	max_total_size: number;
}

/** 清理结果 */
export interface ArtifactCleanupResult {
	deleted_count: number;
	freed_bytes: number;
	errors: string[];
}

// ==================
// Agent 任务检查点类型（断点续传）
// ==================

/** 任务检查点 - 用于断点续传 */
export interface AgentCheckpoint {
	id: string;
	task_id: string;
	session_id: string;
	sdk_session_id?: string;
	sandbox_dir?: string;
	last_tool_call_id?: string;
	tool_calls_completed: string[];
	accumulated_result: string;
	metadata: Record<string, unknown>;
	created_at: number;
	updated_at: number;
}

/** 创建/更新检查点的 payload */
export interface SaveCheckpointPayload {
	task_id: string;
	session_id: string;
	sdk_session_id?: string;
	sandbox_dir?: string;
	last_tool_call_id?: string;
	tool_calls_completed?: string[];
	accumulated_result?: string;
	metadata?: Record<string, unknown>;
}
