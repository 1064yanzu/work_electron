/**
 * Coding Session 统一类型定义
 * 供 Claude Code / Codex 两个后端共用的消息模型
 */

/** 单条对话消息 */
export interface CodingSessionMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	timestamp: number;
	content: string;
	/** 是否正在流式输出 */
	isStreaming: boolean;
	/** 思考块列表 */
	thinkingBlocks: ThinkingBlock[];
	/** 工具调用列表 */
	toolCalls: SessionToolCall[];
	/** 子代理活动（当前消息中 spawn 的子代理） */
	subagents: SubagentActivity[];
	/** 团队协作信息 */
	team?: TeamActivity;
	/** 任务通知 */
	notifications: TaskNotification[];
	/** 元数据 */
	metadata?: {
		backend: 'claude-code' | 'codex';
		model?: string;
		durationMs?: number;
	};
}

/** 思考过程块 */
export interface ThinkingBlock {
	id: string;
	content: string;
	title: string;
	isStreaming: boolean;
}

/** 工具调用记录 */
export interface SessionToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
	output?: unknown;
	status: 'pending' | 'running' | 'completed' | 'error';
	isError: boolean;
	durationMs?: number;
	/** 如果工具是 Edit/Write/Patch，关联的 diff ID */
	diffId?: string;
}

/** 会话运行状态 */
export type SessionStatus =
	| 'idle'
	| 'running'
	| 'awaiting_permission'
	| 'paused'
	| 'error'
	| 'completed';

/** 权限审批请求 */
export interface SessionPermissionRequest {
	requestId: string;
	toolName: string;
	toolInput: Record<string, unknown>;
	description?: string;
	expiresAt: number;
}

/** 子代理活动记录 */
export interface SubagentActivity {
	id: string;
	agentId: string | null;
	agentType: string | null;
	status: 'running' | 'completed' | 'stopped';
	startedAt: number;
	summary?: string;
	transcriptPath?: string;
}

/** 团队协作信息 */
export interface TeamActivity {
	teamId: string;
	teamName: string | null;
	leaderRunId?: string;
	delegationMode?: string;
	teammateMode?: string;
	teammates: TeammateInfo[];
}

/** 团队成员信息 */
export interface TeammateInfo {
	name: string;
	status: 'running' | 'idle' | 'completed';
	taskSummary?: string;
}

/** 任务通知 */
export interface TaskNotification {
	id: string;
	taskId?: string;
	status?: string;
	title?: string;
	message?: string;
	summary?: string;
	timestamp: number;
}

/** Token 用量统计 */
export interface SessionUsage {
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
}
