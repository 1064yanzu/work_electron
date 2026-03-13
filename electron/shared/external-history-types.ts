/**
 * CLI 历史同步 — 跨后端统一类型定义
 * 用于 Codex CLI 和 Claude Code CLI 的历史会话导入
 */

/** 外部线程来源标识 */
export type ExternalThreadSource = 'codex-cli' | 'claude-code-cli';

/** 外部线程元信息（列表展示用） */
export interface ExternalThreadMeta {
	/** 原始线程/会话 ID */
	id: string;
	/** 标题（优先取用户设置的标题，否则从首条消息截取） */
	title: string;
	/** 来源后端 */
	source: ExternalThreadSource;
	/** 工作目录 */
	cwd: string;
	/** 项目名称（从 cwd 提取） */
	projectName: string;
	/** 使用的模型 */
	model?: string;
	/** 模型提供商 */
	modelProvider?: string;
	/** 创建时间 (Unix ms) */
	createdAt: number;
	/** 最后更新时间 (Unix ms) */
	updatedAt: number;
	/** Token 使用量 */
	tokensUsed?: number;
	/** Git 分支 */
	gitBranch?: string;
	/** Git SHA */
	gitSha?: string;
	/** 消息数量（粗略估计） */
	messageCount?: number;
	/** 首条用户消息预览 */
	firstMessage?: string;
}

/** 外部会话消息（读取完整对话用） */
export interface ExternalSessionMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	timestamp: number;
	content: string;
	/** 思考/推理内容 */
	thinking?: string;
	/** 工具调用记录 */
	toolCalls?: ExternalToolCall[];
	/** 父消息 ID（用于对话树结构） */
	parentId?: string;
	/** 元数据 */
	metadata?: Record<string, unknown>;
}

/** 外部工具调用记录 */
export interface ExternalToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
	output?: string;
	status: 'completed' | 'error';
}

/** CLI 历史列表请求参数 */
export interface CliHistoryListParams {
	/** 最大返回数量 */
	limit?: number;
	/** 按工作目录过滤 */
	cwd?: string;
	/** 搜索关键词（匹配标题或首条消息） */
	search?: string;
	/** 是否包含已归档的 */
	includeArchived?: boolean;
}

/** CLI 历史读取请求参数 */
export interface CliHistoryReadParams {
	/** 线程/会话 ID */
	threadId: string;
	/** 最大消息数量 */
	maxMessages?: number;
}

/** CLI 历史读取结果 */
export interface CliHistoryReadResult {
	metadata: ExternalThreadMeta;
	messages: ExternalSessionMessage[];
}
