// Agent API 层
// 封装 Tauri 命令调用，提供给 Agent 系统使用

import { safeInvoke } from "../tauriBridge";

// ==================== 类型定义 ====================

// Agent 会话
export interface AgentSession {
	id: string;
	title?: string | null;
	status: "active" | "archived";
	config_json?: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
}

// Agent 任务
export interface AgentTaskRecord {
	id: string;
	session_id: string;
	goal: string;
	status: "queued" | "running" | "succeeded" | "failed" | "canceled" | "paused";
	error?: string | null;
	budget_json?: Record<string, unknown> | null;
	result_summary?: string | null;
	created_at: string;
	updated_at: string;
	started_at?: string | null;
	finished_at?: string | null;
}

// 工具调用记录
export interface ToolCallRecord {
	id: string;
	task_id: string;
	node_id: string;
	tool_name: string;
	tool_source: "builtin" | "mcp";
	mcp_server_id?: string | null;
	args_json?: Record<string, unknown> | null;
	status:
		| "queued"
		| "running"
		| "succeeded"
		| "failed"
		| "canceled"
		| "awaiting_permission";
	result_json?: unknown;
	error?: string | null;
	created_at: string;
	updated_at: string;
	started_at?: string | null;
	finished_at?: string | null;
}

export interface AgentNodeRecord {
	id: string;
	task_id: string;
	kind: "llm_plan" | "tool_call" | "synthesis" | "custom";
	name: string;
	status:
		| "queued"
		| "running"
		| "succeeded"
		| "failed"
		| "canceled"
		| "blocked";
	depends_on: string[];
	input_json?: unknown;
	output_json?: unknown;
	error?: string | null;
	created_at: string;
	updated_at: string;
	started_at?: string | null;
	finished_at?: string | null;
}

export interface AgentMessageRecord {
	id: string;
	session_id: string;
	task_id?: string | null;
	role: "user" | "assistant" | "system" | "tool";
	content_json: unknown;
	agent_session_id?: string | null;
	created_at: string;
	updated_at: string;
}

// 权限记录
export interface PermissionRecord {
	id: string;
	toolCallId: string;
	toolType: string;
	toolName: string;
	decision: "approved" | "denied" | "pending";
	decidedBy: "user" | "policy" | "timeout";
	reason?: string;
	createdAt: string;
	decidedAt?: string;
}

// Artifact 记录
export interface ArtifactRecord {
	id: string;
	task_id: string;
	kind: "text" | "citation" | "file" | "note" | "json";
	title?: string | null;
	payload_json: unknown;
	created_at: string;
}

// 审计日志
export interface AuditLogRecord {
	id: string;
	session_id: string;
	task_id?: string | null;
	level: "info" | "warn" | "error";
	event: string;
	payload_json?: unknown;
	created_at: string;
}

// Chunk 统计
export interface ChunkStats {
	total_notes: number;
	chunked_notes: number;
	pending_notes: number;
	total_chunks: number;
	fts_available: boolean;
}

// 搜索结果
export interface NoteChunkSearchHit {
	chunk_id: string;
	note_id: string;
	source_id?: string;
	source_title?: string;
	chunk_index: number;
	score: number;
	snippet: string;
}

// ==================== 会话 API ====================

export async function createAgentSession(
	title?: string,
): Promise<AgentSession> {
	return await safeInvoke("agent_create_session", { payload: { title } });
}

export async function getAgentSession(id: string): Promise<AgentSession> {
	const result = await safeInvoke<AgentSession | null>("agent_get_session", {
		id,
	});
	if (!result) {
		throw new Error("Agent session not found");
	}
	return result;
}

export async function listAgentSessions(
	status?: AgentSession["status"],
): Promise<AgentSession[]> {
	return await safeInvoke("agent_list_sessions", { status });
}

export async function updateAgentSession(
	id: string,
	updates: Partial<Pick<AgentSession, "title" | "status">>,
): Promise<void> {
	return await safeInvoke("agent_update_session", {
		payload: { id, ...updates },
	});
}

export async function deleteAgentSession(id: string): Promise<void> {
	return await safeInvoke("agent_delete_session", { id });
}

// ==================== 任务 API ====================

export async function createAgentTask(
	sessionId: string,
	goal: string,
	budgetJson?: Record<string, unknown>,
): Promise<AgentTaskRecord> {
	return await safeInvoke("agent_create_task", {
		payload: {
			session_id: sessionId,
			goal,
			budget_json: budgetJson,
		},
	});
}

export async function getAgentTask(id: string): Promise<AgentTaskRecord> {
	const result = await safeInvoke<AgentTaskRecord | null>("agent_get_task", {
		id,
	});
	if (!result) {
		throw new Error("Agent task not found");
	}
	return result;
}

export async function listAgentTasks(
	sessionId: string,
): Promise<AgentTaskRecord[]> {
	return await safeInvoke("agent_list_tasks", { sessionId });
}

export async function updateAgentTask(
	id: string,
	updates: Partial<
		Pick<AgentTaskRecord, "status" | "error" | "result_summary">
	>,
): Promise<void> {
	return await safeInvoke("agent_update_task", {
		payload: {
			id,
			status: updates.status ?? "queued",
			error: updates.error,
			result_summary: updates.result_summary,
		},
	});
}

// ==================== 节点 API ====================

export async function createAgentNode(payload: {
	task_id: string;
	kind: AgentNodeRecord["kind"];
	name: string;
	depends_on?: string[];
	input_json?: unknown;
}): Promise<AgentNodeRecord> {
	return await safeInvoke("agent_create_node", { payload });
}

export async function listAgentNodes(
	taskId: string,
): Promise<AgentNodeRecord[]> {
	return await safeInvoke("agent_list_nodes", { taskId });
}

export async function updateAgentNode(payload: {
	id: string;
	status: AgentNodeRecord["status"];
	error?: string;
	output_json?: unknown;
}): Promise<void> {
	return await safeInvoke("agent_update_node", { payload });
}

// ==================== 工具调用 API ====================

export async function createToolCall(payload: {
	task_id: string;
	node_id: string;
	tool_name: string;
	tool_source?: ToolCallRecord["tool_source"];
	mcp_server_id?: string;
	args_json?: Record<string, unknown>;
}): Promise<ToolCallRecord> {
	return await safeInvoke("agent_create_tool_call", { payload });
}

export async function updateToolCall(
	id: string,
	updates: Partial<Pick<ToolCallRecord, "status" | "result_json" | "error">>,
): Promise<void> {
	return await safeInvoke("agent_update_tool_call", {
		payload: {
			id,
			status: updates.status ?? "queued",
			result_json: updates.result_json,
			error: updates.error ?? null,
		},
	});
}

export async function listToolCalls(taskId: string): Promise<ToolCallRecord[]> {
	return await safeInvoke("agent_list_tool_calls", { taskId });
}

// ==================== 权限 API ====================

export async function createPermission(
	toolCallId: string,
	toolType: string,
	toolName: string,
): Promise<PermissionRecord> {
	return await safeInvoke("agent_create_permission", {
		toolCallId,
		toolType,
		toolName,
	});
}

export async function updatePermission(
	id: string,
	decision: "approved" | "denied",
	decidedBy: "user" | "policy" | "timeout",
	reason?: string,
): Promise<PermissionRecord> {
	return await safeInvoke("agent_update_permission", {
		id,
		decision,
		decidedBy,
		reason,
	});
}

export async function listPermissions(
	toolCallId?: string,
): Promise<PermissionRecord[]> {
	return await safeInvoke("agent_list_permissions", { toolCallId });
}

// ==================== Artifact API ====================

export async function createArtifact(
	taskId: string,
	kind: ArtifactRecord["kind"],
	payload_json: unknown,
	title?: string,
): Promise<ArtifactRecord> {
	return await safeInvoke("agent_create_artifact", {
		payload: {
			task_id: taskId,
			kind,
			title,
			payload_json,
		},
	});
}

export async function listArtifacts(taskId: string): Promise<ArtifactRecord[]> {
	return await safeInvoke("agent_list_artifacts", { taskId });
}

// ==================== 消息 API ====================

export async function createAgentMessage(payload: {
	session_id: string;
	task_id?: string;
	role: AgentMessageRecord["role"];
	content_json: unknown;
	agent_session_id?: string;
}): Promise<AgentMessageRecord> {
	return await safeInvoke("agent_create_message", { payload });
}

export async function listAgentMessages(
	sessionId: string,
): Promise<AgentMessageRecord[]> {
	return await safeInvoke("agent_list_messages", { sessionId });
}

export async function updateAgentMessage(payload: {
	id: string;
	content_json: unknown;
	agent_session_id?: string;
}): Promise<void> {
	return await safeInvoke("agent_update_message", { payload });
}

// ==================== 审计日志 API ====================

export async function createAuditLog(payload: {
	session_id: string;
	task_id?: string;
	level: AuditLogRecord["level"];
	event: string;
	payload_json?: unknown;
}): Promise<void> {
	return await safeInvoke("agent_create_audit_log", { payload });
}

export async function listAuditLogs(
	sessionId: string,
	limit?: number,
): Promise<AuditLogRecord[]> {
	return await safeInvoke("agent_list_audit_logs", { sessionId, limit });
}

// ==================== 检索 API ====================

export async function searchChunks(
	query: string,
	limit?: number,
	sourceId?: string,
): Promise<NoteChunkSearchHit[]> {
	const payload: Record<string, unknown> = { query };
	if (limit !== undefined) payload.limit = limit;
	if (sourceId) payload.source_id = sourceId;
	return await safeInvoke("kb_search_chunks", { payload });
}

export async function searchChunksMulti(
	keywords: string[],
	limit?: number,
	sourceId?: string,
): Promise<NoteChunkSearchHit[]> {
	const payload: Record<string, unknown> = { keywords };
	if (limit !== undefined) payload.limit = limit;
	if (sourceId) payload.source_id = sourceId;
	return await safeInvoke("kb_search_chunks_multi", { payload });
}

export async function getChunksStats(): Promise<ChunkStats> {
	return await safeInvoke("kb_get_chunks_stats");
}

export async function rebuildChunks(noteId?: string): Promise<number> {
	return await safeInvoke("kb_chunk_rebuild", { noteId });
}

// ==================== 便捷函数 ====================

// 获取完整的任务历史（包含工具调用和 artifacts）
export async function getFullTaskHistory(taskId: string): Promise<{
	task: AgentTaskRecord;
	toolCalls: ToolCallRecord[];
	artifacts: ArtifactRecord[];
	auditLogs: AuditLogRecord[];
}> {
	const [task, toolCalls, artifacts, auditLogs] = await Promise.all([
		getAgentTask(taskId),
		listToolCalls(taskId),
		listArtifacts(taskId),
		Promise.resolve([] as AuditLogRecord[]),
	]);

	return { task, toolCalls, artifacts, auditLogs };
}

// 获取完整的会话历史
export async function getFullSessionHistory(sessionId: string): Promise<{
	session: AgentSession;
	tasks: AgentTaskRecord[];
	auditLogs: AuditLogRecord[];
}> {
	const [session, tasks, auditLogs] = await Promise.all([
		getAgentSession(sessionId),
		listAgentTasks(sessionId),
		listAuditLogs(sessionId, 100),
	]);

	return { session, tasks, auditLogs };
}

// ==================== Agent 记忆 API ====================

// 记忆记录
export interface MemoryRecord {
	id: string;
	key: string;
	content: string;
	category: "preference" | "fact" | "task_result" | "user_habit";
	relevance_score: number;
	created_at: number;
	updated_at: number;
	last_accessed_at?: number;
	access_count: number;
}

// 搜索记忆
export async function searchAgentMemories(
	query: string,
	limit: number = 5,
): Promise<MemoryRecord[]> {
	return safeInvoke<MemoryRecord[]>("search_agent_memories", { query, limit });
}

// 创建记忆
export async function createAgentMemory(
	key: string,
	content: string,
	category: "preference" | "fact" | "task_result" | "user_habit",
): Promise<MemoryRecord> {
	return safeInvoke<MemoryRecord>("create_agent_memory", {
		key,
		content,
		category,
	});
}

// 更新记忆
export async function updateAgentMemory(
	id: string,
	content: string,
): Promise<void> {
	return safeInvoke("update_agent_memory", { id, content });
}

// 删除记忆
export async function deleteAgentMemory(id: string): Promise<void> {
	return safeInvoke("delete_agent_memory", { id });
}

// 获取记忆（按 key）
export async function getAgentMemoryByKey(
	key: string,
): Promise<MemoryRecord | null> {
	return safeInvoke<MemoryRecord | null>("get_agent_memory_by_key", { key });
}

// 更新记忆访问时间
export async function updateAgentMemoryAccessTime(id: string): Promise<void> {
	return safeInvoke("update_agent_memory_access_time", { id });
}
