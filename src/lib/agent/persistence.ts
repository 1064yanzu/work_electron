// Agent 会话持久化
// 将 Agent 状态保存到后端数据库，支持恢复会话

import * as api from "./api";
import { agentStore } from "./store";
import { sessionStore } from "./sessionManager";
import { workspaceStore } from "../workspaceStore";
import type { AgentTask, ToolArtifact, ToolCall } from "./types";

// ==================== 类型转换 ====================

// 状态映射：前端 -> 后端
function mapStatusToBackend(
	status: AgentTask["status"],
): api.AgentTaskRecord["status"] {
	const mapping: Record<AgentTask["status"], api.AgentTaskRecord["status"]> = {
		idle: "queued",
		planning: "queued",
		executing: "running",
		waiting: "paused",
		completed: "succeeded",
		error: "failed",
		cancelled: "canceled",
	};
	return mapping[status] || "queued";
}

// 状态映射：后端 -> 前端
function mapStatusToFrontend(
	status: api.AgentTaskRecord["status"],
): AgentTask["status"] {
	const mapping: Record<api.AgentTaskRecord["status"], AgentTask["status"]> = {
		queued: "planning",
		running: "executing",
		succeeded: "completed",
		failed: "error",
		canceled: "cancelled",
		paused: "waiting",
	};
	return mapping[status] || "idle";
}

// 将前端 AgentTask 转换为后端格式（预留）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function taskToRecord(
	task: AgentTask,
	sessionId: string,
): Omit<
	api.AgentTaskRecord,
	"created_at" | "updated_at" | "started_at" | "finished_at"
> {
	return {
		id: task.id,
		session_id: sessionId,
		goal: task.query,
		status: mapStatusToBackend(task.status),
		error: task.error,
		budget_json: { frontend_task_type: task.type },
		result_summary: task.result,
	};
}

// 避免 tsc noUnusedLocals：上述转换函数为预留扩展点
void taskToRecord;

// 将后端 AgentTaskRecord 转换为前端格式
function recordToTask(
	record: api.AgentTaskRecord,
	toolCalls: ToolCall[],
	artifacts: ToolArtifact[],
): AgentTask {
	const legacyFrontendTaskId =
		record.budget_json &&
		typeof (record.budget_json as Record<string, unknown>)
			.legacy_frontend_task_id === "string"
			? ((record.budget_json as Record<string, unknown>)
					.legacy_frontend_task_id as string)
			: null;

	return {
		id: legacyFrontendTaskId || record.id,
		type: "custom",
		query: record.goal,
		title: record.goal.slice(0, 30),
		status: mapStatusToFrontend(record.status),
		result: record.result_summary || undefined,
		error: record.error ?? undefined,
		toolCalls,
		artifacts,
		steps: [],
		createdAt: new Date(record.created_at).getTime(),
		updatedAt: new Date(record.updated_at).getTime(),
		completedAt: record.finished_at
			? new Date(record.finished_at).getTime()
			: undefined,
		metadata: {
			backendTaskId: record.id,
			legacyFrontendTaskId: legacyFrontendTaskId || undefined,
			sessionId: record.session_id,
			budget_json: record.budget_json,
		},
	};
}

// 将前端 ToolCall 转换为后端格式（预留）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toolCallToRecord(
	tc: ToolCall,
	taskId: string,
): Omit<
	api.ToolCallRecord,
	"created_at" | "updated_at" | "started_at" | "finished_at"
> {
	return {
		id: tc.id,
		task_id: taskId,
		node_id: "00000000-0000-0000-0000-000000000000",
		tool_name: tc.type,
		tool_source: "builtin",
		args_json: tc.input,
		status: "queued",
		result_json: tc.output,
		error: tc.error,
	};
}

void toolCallToRecord;

// 将后端 ToolCallRecord 转换为前端格式
function recordToToolCall(record: api.ToolCallRecord): ToolCall {
	const rawType = record.tool_name;
	const type = rawType as ToolCall["type"];
	const statusMapping: Record<
		api.ToolCallRecord["status"],
		ToolCall["status"]
	> = {
		queued: "pending",
		running: "running",
		succeeded: "completed",
		failed: "error",
		canceled: "cancelled",
		awaiting_permission: "pending",
	};

	const legacyId =
		record.args_json &&
		typeof (record.args_json as Record<string, unknown>)
			._legacy_frontend_tool_call_id === "string"
			? ((record.args_json as Record<string, unknown>)
					._legacy_frontend_tool_call_id as string)
			: null;

	const legacyName =
		record.args_json &&
		typeof (record.args_json as Record<string, unknown>)
			._legacy_frontend_tool_call_name === "string"
			? ((record.args_json as Record<string, unknown>)
					._legacy_frontend_tool_call_name as string)
			: null;

	return {
		id: legacyId || record.id,
		type,
		name: legacyName || rawType,
		input: (record.args_json as any) || {},
		output: record.result_json,
		status: statusMapping[record.status] || "pending",
		error: record.error || undefined,
		startedAt: record.started_at
			? new Date(record.started_at).getTime()
			: undefined,
		completedAt: record.finished_at
			? new Date(record.finished_at).getTime()
			: undefined,
		metadata: {
			backendToolCallId: record.id,
			backendNodeId: record.node_id,
			tool_source: record.tool_source,
		},
	};
}

// 将前端 ToolArtifact 转换为后端格式（预留）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function artifactToRecord(
	artifact: ToolArtifact,
	taskId: string,
): Omit<api.ArtifactRecord, "created_at"> {
	const kind: api.ArtifactRecord["kind"] =
		artifact.type === "text"
			? "text"
			: artifact.type === "url"
				? "citation"
				: artifact.type === "file" || artifact.type === "image"
					? "file"
					: artifact.type === "code"
						? "text"
						: "json";

	return {
		id: artifact.id,
		task_id: taskId,
		kind,
		title: artifact.title,
		payload_json: {
			type: artifact.type,
			title: artifact.title,
			content: artifact.content,
			url: artifact.url,
			metadata: artifact.metadata,
		},
	};
}

void artifactToRecord;

// 将后端 ArtifactRecord 转换为前端格式
function recordToArtifact(record: api.ArtifactRecord): ToolArtifact {
	const payload = (record.payload_json as any) || {};

	return {
		id: record.id,
		type:
			(payload.type as ToolArtifact["type"]) ||
			(record.kind === "citation" ? "url" : (record.kind as any) || "text"),
		title: record.title || payload.title || "未命名资料",
		content: payload.content,
		url: payload.url,
		metadata: payload.metadata,
	};
}

// ==================== 持久化管理器 ====================

class AgentPersistence {
	private currentSessionId: string | null = null;
	private autoSaveEnabled = true;
	private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private backendTaskIdByFrontendTaskId: Map<string, string> = new Map();
	private backendToolCallByFrontendToolCallId: Map<
		string,
		{ nodeId: string; toolCallId: string }
	> = new Map();
	private persistedArtifactIds: Set<string> = new Set();

	private rebuildIdMappingsFromTasks(tasks: AgentTask[]) {
		this.backendTaskIdByFrontendTaskId = new Map();
		this.backendToolCallByFrontendToolCallId = new Map();
		this.persistedArtifactIds = new Set();

		for (const task of tasks) {
			const backendTaskId = (task.metadata as any)?.backendTaskId as
				| string
				| undefined;
			if (backendTaskId) {
				this.backendTaskIdByFrontendTaskId.set(task.id, backendTaskId);
			}

			for (const tc of task.toolCalls) {
				const backendToolCallId = (tc.metadata as any)?.backendToolCallId as
					| string
					| undefined;
				const backendNodeId = (tc.metadata as any)?.backendNodeId as
					| string
					| undefined;
				if (backendToolCallId && backendNodeId) {
					this.backendToolCallByFrontendToolCallId.set(tc.id, {
						nodeId: backendNodeId,
						toolCallId: backendToolCallId,
					});
				}
			}

			for (const artifact of task.artifacts) {
				this.persistedArtifactIds.add(artifact.id);
			}
		}
	}

	// 创建新会话
	async createSession(title?: string): Promise<string> {
		try {
			// 从 workspaceStore 获取当前项目 ID
			const projectId = workspaceStore.getState().currentProjectId || null;
			const currentRuntimeSession = sessionStore.getCurrentSession();
			const configJson = currentRuntimeSession?.cwd
				? {
						source: "local-chat",
						cwd: currentRuntimeSession.cwd,
					}
				: undefined;
			const session = await api.createAgentSession(
				title,
				projectId,
				configJson,
			);
			this.currentSessionId = session.id;
			console.log(
				`[AgentPersistence] 创建会话: ${session.id}, 项目: ${projectId || "全局"}`,
			);
			return session.id;
		} catch (error) {
			console.error("[AgentPersistence] 创建会话失败:", error);
			// 如果后端不可用，生成本地 ID
			this.currentSessionId = `local-${Date.now()}`;
			return this.currentSessionId;
		}
	}

	// 获取当前会话 ID
	getCurrentSessionId(): string | null {
		return this.currentSessionId;
	}

	// 设置当前会话 ID
	setCurrentSessionId(sessionId: string | null): void {
		this.currentSessionId = sessionId;
	}

	// 保存当前任务
	async saveCurrentTask(): Promise<void> {
		const state = agentStore.getState();
		if (!state.currentTask || !this.currentSessionId) return;

		try {
			await this.saveTask(state.currentTask, this.currentSessionId);
		} catch (error) {
			console.error("[AgentPersistence] 保存任务失败:", error);
		}
	}

	// 保存任务
	async saveTask(task: AgentTask, sessionId: string): Promise<void> {
		try {
			// 保存/获取后端 task id
			let backendTaskId = this.backendTaskIdByFrontendTaskId.get(task.id);
			if (!backendTaskId) {
				const created = await api.createAgentTask(sessionId, task.query, {
					frontend_task_type: task.type,
					legacy_frontend_task_id: task.id,
				});
				backendTaskId = created.id;
				this.backendTaskIdByFrontendTaskId.set(task.id, backendTaskId);

				task.metadata = { ...(task.metadata || {}), backendTaskId };
			}

			// 更新任务状态/结果
			await api.updateAgentTask(backendTaskId, {
				status: mapStatusToBackend(task.status),
				error: task.error,
				result_summary: task.result,
			});

			// 保存工具调用：每个 tool call 对应一个 node + tool_call
			for (const tc of task.toolCalls) {
				let ref = this.backendToolCallByFrontendToolCallId.get(tc.id);

				if (!ref) {
					const node = await api.createAgentNode({
						task_id: backendTaskId,
						kind: "tool_call",
						name: tc.name,
						input_json: tc.input,
					});

					const toolCall = await api.createToolCall({
						task_id: backendTaskId,
						node_id: node.id,
						tool_name: tc.type,
						tool_source: "builtin",
						args_json: {
							...(tc.input || {}),
							_legacy_frontend_tool_call_id: tc.id,
							_legacy_frontend_tool_call_name: tc.name,
						},
					});

					ref = { nodeId: node.id, toolCallId: toolCall.id };
					this.backendToolCallByFrontendToolCallId.set(tc.id, ref);
				}

				tc.metadata = {
					...(tc.metadata || {}),
					backendToolCallId: ref.toolCallId,
					backendNodeId: ref.nodeId,
				};

				const toolStatusMap: Record<
					ToolCall["status"],
					api.ToolCallRecord["status"]
				> = {
					pending: "queued",
					running: "running",
					completed: "succeeded",
					error: "failed",
					cancelled: "canceled",
				};

				const nextStatus = toolStatusMap[tc.status] || "queued";

				await api.updateToolCall(ref.toolCallId, {
					status: nextStatus,
					result_json: tc.output,
					error: tc.error,
				});

				const nodeStatusMap: Record<
					api.ToolCallRecord["status"],
					api.AgentNodeRecord["status"]
				> = {
					queued: "queued",
					running: "running",
					awaiting_permission: "blocked",
					succeeded: "succeeded",
					failed: "failed",
					canceled: "canceled",
				};

				await api.updateAgentNode({
					id: ref.nodeId,
					status: nodeStatusMap[nextStatus] || "queued",
					error: tc.status === "error" ? tc.error : undefined,
					output_json: tc.output,
				});
			}

			// 保存 artifacts（仅保存新出现的）
			for (const artifact of task.artifacts) {
				if (this.persistedArtifactIds.has(artifact.id)) continue;

				const record = artifactToRecord(artifact, backendTaskId);
				await api.createArtifact(
					backendTaskId,
					record.kind,
					record.payload_json,
					record.title || undefined,
				);
				this.persistedArtifactIds.add(artifact.id);
			}

			console.log(`[AgentPersistence] 任务已保存: ${backendTaskId}`);
		} catch (error) {
			console.error("[AgentPersistence] 保存任务失败:", error);
		}
	}

	// 加载会话
	async loadSession(sessionId: string): Promise<AgentTask[]> {
		try {
			const { tasks } = await api.getFullSessionHistory(sessionId);

			const loadedTasks: AgentTask[] = [];

			for (const taskRecord of tasks) {
				const { toolCalls, artifacts } = await api.getFullTaskHistory(
					taskRecord.id,
				);

				const task = recordToTask(
					taskRecord,
					toolCalls.map(recordToToolCall),
					artifacts.map(recordToArtifact),
				);

				loadedTasks.push(task);
			}

			this.currentSessionId = sessionId;
			console.log(
				`[AgentPersistence] 加载会话: ${sessionId}, ${loadedTasks.length} 个任务`,
			);

			return loadedTasks;
		} catch (error) {
			console.error("[AgentPersistence] 加载会话失败:", error);
			return [];
		}
	}

	// 恢复会话到 store
	async restoreSession(sessionId: string): Promise<boolean> {
		try {
			const tasks = await this.loadSession(sessionId);

			if (tasks.length === 0) return false;

			agentStore.hydrateTasks(tasks);

			// 重建映射，避免恢复后重复落库
			this.rebuildIdMappingsFromTasks(tasks);

			return true;
		} catch (error) {
			console.error("[AgentPersistence] 恢复会话失败:", error);
			return false;
		}
	}

	// 列出所有会话（根据当前项目过滤）
	async listSessions(limit?: number): Promise<api.AgentSession[]> {
		try {
			void limit;
			// 从 workspaceStore 获取当前项目 ID
			const projectId = workspaceStore.getState().currentProjectId || null;
			return await api.listAgentSessions(undefined, projectId);
		} catch (error) {
			console.error("[AgentPersistence] 列出会话失败:", error);
			return [];
		}
	}

	// 删除会话
	async deleteSession(sessionId: string): Promise<boolean> {
		try {
			await api.deleteAgentSession(sessionId);
			if (this.currentSessionId === sessionId) {
				this.currentSessionId = null;
			}
			return true;
		} catch (error) {
			console.error("[AgentPersistence] 删除会话失败:", error);
			return false;
		}
	}

	// 启用/禁用自动保存
	setAutoSave(enabled: boolean): void {
		this.autoSaveEnabled = enabled;
	}

	// 防抖保存
	debouncedSave(): void {
		if (!this.autoSaveEnabled) return;

		if (this.saveDebounceTimer) {
			clearTimeout(this.saveDebounceTimer);
		}

		this.saveDebounceTimer = setTimeout(() => {
			this.saveCurrentTask();
		}, 1000);
	}

	// 添加审计日志
	async log(
		level: "debug" | "info" | "warn" | "error",
		message: string,
		details?: Record<string, unknown>,
	): Promise<void> {
		try {
			const state = agentStore.getState();
			if (!this.currentSessionId) return;

			await api.createAuditLog({
				session_id: this.currentSessionId,
				task_id: state.currentTask?.id,
				level: level === "warn" ? "warn" : level === "error" ? "error" : "info",
				event: message,
				payload_json: details,
			});
		} catch (error) {
			console.error("[AgentPersistence] 记录日志失败:", error);
		}
	}
}

// 单例导出
export const agentPersistence = new AgentPersistence();

// ==================== Store 集成 ====================

// 监听 store 变化并自动保存
let unsubscribe: (() => void) | null = null;

export function enableAutoSave(): void {
	if (unsubscribe) return;

	unsubscribe = agentStore.subscribe(() => {
		agentPersistence.debouncedSave();
	});

	console.log("[AgentPersistence] 自动保存已启用");
}

export function disableAutoSave(): void {
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
	agentPersistence.setAutoSave(false);
	console.log("[AgentPersistence] 自动保存已禁用");
}

// ==================== 便捷函数 ====================

// 开始新的持久化会话
export async function startPersistentSession(title?: string): Promise<string> {
	const sessionId = await agentPersistence.createSession(title);
	enableAutoSave();
	return sessionId;
}

export async function ensurePersistentSession(options: {
	sessionId?: string;
	title?: string;
}): Promise<{ sessionId: string; recreated: boolean }> {
	const existingId = options.sessionId?.trim();
	if (existingId && !existingId.startsWith("local-")) {
		try {
			await api.getAgentSession(existingId);
			agentPersistence.setCurrentSessionId(existingId);
			await resumePersistentSession(existingId);
			return { sessionId: existingId, recreated: false };
		} catch (error) {
			console.warn(
				"[AgentPersistence] 已绑定的后端会话不存在，将创建新会话:",
				existingId,
				error,
			);
		}
	}

	const sessionId = await startPersistentSession(options.title);
	return { sessionId, recreated: true };
}

// 恢复持久化会话
export async function resumePersistentSession(
	sessionId: string,
): Promise<boolean> {
	const success = await agentPersistence.restoreSession(sessionId);
	if (success) {
		enableAutoSave();
	}
	return success;
}

// 获取会话历史
export async function getSessionHistory(
	limit?: number,
): Promise<api.AgentSession[]> {
	return agentPersistence.listSessions(limit);
}
