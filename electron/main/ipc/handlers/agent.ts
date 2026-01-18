/**
 * Agent Runtime IPC Handlers
 * 管理 Agent 会话、任务、节点、工具调用等
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";

const now = () => Date.now();

// ==================
// 类型定义
// ==================

interface AgentSession {
	id: string;
	title?: string;
	status: "active" | "archived";
	config_json?: unknown;
	created_at: number;
	updated_at: number;
}

interface AgentTask {
	id: string;
	session_id: string;
	goal: string;
	status: "queued" | "running" | "succeeded" | "failed" | "canceled" | "paused";
	error?: string;
	budget_json?: unknown;
	result_summary?: string;
	created_at: number;
	updated_at: number;
	started_at?: number;
	finished_at?: number;
}

interface AgentNode {
	id: string;
	task_id: string;
	kind: string;
	name: string;
	status: string;
	depends_on_json?: string[];
	input_json?: unknown;
	output_json?: unknown;
	error?: string;
	created_at: number;
	updated_at: number;
}

interface AgentToolCall {
	id: string;
	task_id: string;
	node_id: string;
	tool_name: string;
	tool_source: string;
	mcp_server_id?: string;
	args_json?: unknown;
	status: string;
	result_json?: unknown;
	error?: string;
	created_at: number;
	updated_at: number;
}

interface AgentMessage {
	id: string;
	session_id: string;
	task_id?: string;
	role: string;
	content_json: unknown;
	agent_session_id?: string;
	created_at: number;
	updated_at: number;
}

interface AgentArtifact {
	id: string;
	task_id: string;
	kind: string;
	title?: string;
	payload_json: unknown;
	created_at: number;
}

interface AgentAuditLog {
	id: string;
	session_id: string;
	task_id?: string;
	level: string;
	event: string;
	payload_json?: unknown;
	created_at: number;
}

interface AgentMemory {
	id: string;
	key: string;
	content: string;
	category?: string;
	relevance_score: number;
	created_at: number;
	updated_at: number;
	last_accessed_at?: number;
	access_count: number;
}

// ==================
// Helper 函数
// ==================

function parseJson<T>(str: string | null | undefined, fallback: T): T {
	if (!str) return fallback;
	try {
		return JSON.parse(str) as T;
	} catch {
		return fallback;
	}
}

// ==================
// Session Handlers
// ==================

export function createAgentSessionHandlers(db: DbContext) {
	const createSession = async (
		_event: IpcMainInvokeEvent,
		input: { title?: string; config_json?: unknown },
	): Promise<AgentSession> => {
		const id = randomUUID();
		const timestamp = now();
		const configStr = input.config_json
			? JSON.stringify(input.config_json)
			: null;

		await db.client.execute({
			sql: `INSERT INTO agent_sessions (id, title, status, config_json, created_at, updated_at)
            VALUES (?, ?, 'active', ?, ?, ?)`,
			args: [id, input.title ?? null, configStr, timestamp, timestamp],
		});

		return {
			id,
			title: input.title,
			status: "active",
			config_json: input.config_json,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const getSession = async (
		_event: IpcMainInvokeEvent,
		input: { id: string },
	): Promise<AgentSession | null> => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM agent_sessions WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) return null;
		const row = rows.rows[0];
		return {
			id: row.id as string,
			title: row.title as string | undefined,
			status: (row.status as "active" | "archived") || "active",
			config_json: parseJson(row.config_json as string, undefined),
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		};
	};

	const listSessions = async (
		_event: IpcMainInvokeEvent,
		input: { status?: string; limit?: number },
	): Promise<AgentSession[]> => {
		let sql = `SELECT * FROM agent_sessions`;
		const args: (string | number)[] = [];

		if (input.status) {
			sql += ` WHERE status = ?`;
			args.push(input.status);
		}
		sql += ` ORDER BY updated_at DESC`;
		if (input.limit) {
			sql += ` LIMIT ?`;
			args.push(input.limit);
		}

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => ({
			id: row.id as string,
			title: row.title as string | undefined,
			status: (row.status as "active" | "archived") || "active",
			config_json: parseJson(row.config_json as string, undefined),
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const updateSession = async (
		_event: IpcMainInvokeEvent,
		input: {
			id: string;
			title?: string;
			status?: string;
			config_json?: unknown;
		},
	): Promise<AgentSession> => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.title !== undefined) {
			updates.push("title = ?");
			args.push(input.title);
		}
		if (input.status !== undefined) {
			updates.push("status = ?");
			args.push(input.status);
		}
		if (input.config_json !== undefined) {
			updates.push("config_json = ?");
			args.push(JSON.stringify(input.config_json));
		}

		updates.push("updated_at = ?");
		args.push(now());
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE agent_sessions SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		const result = await getSession({} as IpcMainInvokeEvent, { id: input.id });
		if (!result) throw new Error(`Session not found: ${input.id}`);
		return result;
	};

	const deleteSession = async (
		_event: IpcMainInvokeEvent,
		input: { id: string },
	): Promise<{ success: boolean }> => {
		await db.client.execute({
			sql: `DELETE FROM agent_sessions WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	return {
		agent_create_session: createSession,
		agent_get_session: getSession,
		agent_list_sessions: listSessions,
		agent_update_session: updateSession,
		agent_delete_session: deleteSession,
	};
}

// ==================
// Task Handlers
// ==================

export function createAgentTaskHandlers(db: DbContext) {
	const createTask = async (
		_event: IpcMainInvokeEvent,
		input: { session_id: string; goal: string; budget_json?: unknown },
	): Promise<AgentTask> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO agent_tasks (id, session_id, goal, status, budget_json, created_at, updated_at)
            VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
			args: [
				id,
				input.session_id,
				input.goal,
				input.budget_json ? JSON.stringify(input.budget_json) : null,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			session_id: input.session_id,
			goal: input.goal,
			status: "queued",
			budget_json: input.budget_json,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const getTask = async (
		_event: IpcMainInvokeEvent,
		input: { id: string },
	): Promise<AgentTask | null> => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM agent_tasks WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) return null;
		const row = rows.rows[0];
		return {
			id: row.id as string,
			session_id: row.session_id as string,
			goal: row.goal as string,
			status: row.status as AgentTask["status"],
			error: row.error as string | undefined,
			budget_json: parseJson(row.budget_json as string, undefined),
			result_summary: row.result_summary as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
			started_at: row.started_at as number | undefined,
			finished_at: row.finished_at as number | undefined,
		};
	};

	const listTasks = async (
		_event: IpcMainInvokeEvent,
		input: { session_id?: string; status?: string; limit?: number },
	): Promise<AgentTask[]> => {
		let sql = `SELECT * FROM agent_tasks WHERE 1=1`;
		const args: (string | number)[] = [];

		if (input.session_id) {
			sql += ` AND session_id = ?`;
			args.push(input.session_id);
		}
		if (input.status) {
			sql += ` AND status = ?`;
			args.push(input.status);
		}
		sql += ` ORDER BY created_at DESC`;
		if (input.limit) {
			sql += ` LIMIT ?`;
			args.push(input.limit);
		}

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => ({
			id: row.id as string,
			session_id: row.session_id as string,
			goal: row.goal as string,
			status: row.status as AgentTask["status"],
			error: row.error as string | undefined,
			budget_json: parseJson(row.budget_json as string, undefined),
			result_summary: row.result_summary as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
			started_at: row.started_at as number | undefined,
			finished_at: row.finished_at as number | undefined,
		}));
	};

	const updateTask = async (
		_event: IpcMainInvokeEvent,
		input: {
			id: string;
			status?: string;
			error?: string;
			result_summary?: string;
			started_at?: number;
			finished_at?: number;
		},
	): Promise<AgentTask> => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.status !== undefined) {
			updates.push("status = ?");
			args.push(input.status);
		}
		if (input.error !== undefined) {
			updates.push("error = ?");
			args.push(input.error);
		}
		if (input.result_summary !== undefined) {
			updates.push("result_summary = ?");
			args.push(input.result_summary);
		}
		if (input.started_at !== undefined) {
			updates.push("started_at = ?");
			args.push(input.started_at);
		}
		if (input.finished_at !== undefined) {
			updates.push("finished_at = ?");
			args.push(input.finished_at);
		}

		updates.push("updated_at = ?");
		args.push(now());
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE agent_tasks SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		const result = await getTask({} as IpcMainInvokeEvent, { id: input.id });
		if (!result) throw new Error(`Task not found: ${input.id}`);
		return result;
	};

	return {
		agent_create_task: createTask,
		agent_get_task: getTask,
		agent_list_tasks: listTasks,
		agent_update_task: updateTask,
	};
}

// ==================
// Node Handlers
// ==================

export function createAgentNodeHandlers(db: DbContext) {
	const createNode = async (
		_event: IpcMainInvokeEvent,
		input: {
			task_id: string;
			kind: string;
			name: string;
			depends_on?: string[];
			input_json?: unknown;
		},
	): Promise<AgentNode> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO agent_nodes (id, task_id, kind, name, status, depends_on_json, input_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
			args: [
				id,
				input.task_id,
				input.kind,
				input.name,
				input.depends_on ? JSON.stringify(input.depends_on) : null,
				input.input_json ? JSON.stringify(input.input_json) : null,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			task_id: input.task_id,
			kind: input.kind,
			name: input.name,
			status: "queued",
			depends_on_json: input.depends_on,
			input_json: input.input_json,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const listNodes = async (
		_event: IpcMainInvokeEvent,
		input: { task_id: string },
	): Promise<AgentNode[]> => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM agent_nodes WHERE task_id = ? ORDER BY created_at ASC`,
			args: [input.task_id],
		});
		return rows.rows.map((row) => ({
			id: row.id as string,
			task_id: row.task_id as string,
			kind: row.kind as string,
			name: row.name as string,
			status: row.status as string,
			depends_on_json: parseJson(row.depends_on_json as string, undefined),
			input_json: parseJson(row.input_json as string, undefined),
			output_json: parseJson(row.output_json as string, undefined),
			error: row.error as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const updateNode = async (
		_event: IpcMainInvokeEvent,
		input: {
			id: string;
			status?: string;
			output_json?: unknown;
			error?: string;
			started_at?: number;
			finished_at?: number;
		},
	): Promise<AgentNode> => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.status !== undefined) {
			updates.push("status = ?");
			args.push(input.status);
		}
		if (input.output_json !== undefined) {
			updates.push("output_json = ?");
			args.push(JSON.stringify(input.output_json));
		}
		if (input.error !== undefined) {
			updates.push("error = ?");
			args.push(input.error);
		}
		if (input.started_at !== undefined) {
			updates.push("started_at = ?");
			args.push(input.started_at);
		}
		if (input.finished_at !== undefined) {
			updates.push("finished_at = ?");
			args.push(input.finished_at);
		}

		updates.push("updated_at = ?");
		args.push(now());
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE agent_nodes SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		const rows = await db.client.execute({
			sql: `SELECT * FROM agent_nodes WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) throw new Error(`Node not found: ${input.id}`);
		const row = rows.rows[0];
		return {
			id: row.id as string,
			task_id: row.task_id as string,
			kind: row.kind as string,
			name: row.name as string,
			status: row.status as string,
			depends_on_json: parseJson(row.depends_on_json as string, undefined),
			input_json: parseJson(row.input_json as string, undefined),
			output_json: parseJson(row.output_json as string, undefined),
			error: row.error as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		};
	};

	return {
		agent_create_node: createNode,
		agent_list_nodes: listNodes,
		agent_update_node: updateNode,
	};
}

// ==================
// Tool Call Handlers
// ==================

export function createAgentToolCallHandlers(db: DbContext) {
	const createToolCall = async (
		_event: IpcMainInvokeEvent,
		input: {
			task_id: string;
			node_id: string;
			tool_name: string;
			tool_source?: string;
			mcp_server_id?: string;
			args_json?: unknown;
		},
	): Promise<AgentToolCall> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO agent_tool_calls (id, task_id, node_id, tool_name, tool_source, mcp_server_id, args_json, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
			args: [
				id,
				input.task_id,
				input.node_id,
				input.tool_name,
				input.tool_source ?? "builtin",
				input.mcp_server_id ?? null,
				input.args_json ? JSON.stringify(input.args_json) : null,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			task_id: input.task_id,
			node_id: input.node_id,
			tool_name: input.tool_name,
			tool_source: input.tool_source ?? "builtin",
			mcp_server_id: input.mcp_server_id,
			args_json: input.args_json,
			status: "queued",
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const listToolCalls = async (
		_event: IpcMainInvokeEvent,
		input: { task_id?: string; node_id?: string },
	): Promise<AgentToolCall[]> => {
		let sql = `SELECT * FROM agent_tool_calls WHERE 1=1`;
		const args: string[] = [];

		if (input.task_id) {
			sql += ` AND task_id = ?`;
			args.push(input.task_id);
		}
		if (input.node_id) {
			sql += ` AND node_id = ?`;
			args.push(input.node_id);
		}
		sql += ` ORDER BY created_at ASC`;

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => ({
			id: row.id as string,
			task_id: row.task_id as string,
			node_id: row.node_id as string,
			tool_name: row.tool_name as string,
			tool_source: row.tool_source as string,
			mcp_server_id: row.mcp_server_id as string | undefined,
			args_json: parseJson(row.args_json as string, undefined),
			status: row.status as string,
			result_json: parseJson(row.result_json as string, undefined),
			error: row.error as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const updateToolCall = async (
		_event: IpcMainInvokeEvent,
		input: {
			id: string;
			status?: string;
			result_json?: unknown;
			error?: string;
		},
	): Promise<{ success: boolean }> => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.status !== undefined) {
			updates.push("status = ?");
			args.push(input.status);
		}
		if (input.result_json !== undefined) {
			updates.push("result_json = ?");
			args.push(JSON.stringify(input.result_json));
		}
		if (input.error !== undefined) {
			updates.push("error = ?");
			args.push(input.error);
		}

		updates.push("updated_at = ?");
		args.push(now());
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE agent_tool_calls SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});
		return { success: true };
	};

	return {
		agent_create_tool_call: createToolCall,
		agent_list_tool_calls: listToolCalls,
		agent_update_tool_call: updateToolCall,
	};
}

// ==================
// Message & Artifact & Audit Handlers
// ==================

export function createAgentMessageHandlers(db: DbContext) {
	const createMessage = async (
		_event: IpcMainInvokeEvent,
		input: {
			session_id: string;
			task_id?: string;
			role: string;
			content_json: unknown;
			agent_session_id?: string;
		},
	): Promise<AgentMessage> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO agent_messages (id, session_id, task_id, role, content_json, agent_session_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.session_id,
				input.task_id ?? null,
				input.role,
				JSON.stringify(input.content_json),
				input.agent_session_id ?? null,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			session_id: input.session_id,
			task_id: input.task_id,
			role: input.role,
			content_json: input.content_json,
			agent_session_id: input.agent_session_id,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const listMessages = async (
		_event: IpcMainInvokeEvent,
		input: { session_id: string; limit?: number },
	): Promise<AgentMessage[]> => {
		let sql = `SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC`;
		const args: (string | number)[] = [input.session_id];

		if (input.limit) {
			sql += ` LIMIT ?`;
			args.push(input.limit);
		}

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => ({
			id: row.id as string,
			session_id: row.session_id as string,
			task_id: row.task_id as string | undefined,
			role: row.role as string,
			content_json: parseJson(row.content_json as string, {}),
			agent_session_id: row.agent_session_id as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const createArtifact = async (
		_event: IpcMainInvokeEvent,
		input: {
			task_id: string;
			kind: string;
			title?: string;
			payload_json: unknown;
		},
	): Promise<AgentArtifact> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO agent_artifacts (id, task_id, kind, title, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.task_id,
				input.kind,
				input.title ?? null,
				JSON.stringify(input.payload_json),
				timestamp,
			],
		});

		return {
			id,
			task_id: input.task_id,
			kind: input.kind,
			title: input.title,
			payload_json: input.payload_json,
			created_at: timestamp,
		};
	};

	const listArtifacts = async (
		_event: IpcMainInvokeEvent,
		input: { task_id: string },
	): Promise<AgentArtifact[]> => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM agent_artifacts WHERE task_id = ? ORDER BY created_at ASC`,
			args: [input.task_id],
		});
		return rows.rows.map((row) => ({
			id: row.id as string,
			task_id: row.task_id as string,
			kind: row.kind as string,
			title: row.title as string | undefined,
			payload_json: parseJson(row.payload_json as string, {}),
			created_at: row.created_at as number,
		}));
	};

	const createAuditLog = async (
		_event: IpcMainInvokeEvent,
		input: {
			session_id: string;
			task_id?: string;
			level: string;
			event: string;
			payload_json?: unknown;
		},
	): Promise<AgentAuditLog> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO agent_audit_logs (id, session_id, task_id, level, event, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.session_id,
				input.task_id ?? null,
				input.level,
				input.event,
				input.payload_json ? JSON.stringify(input.payload_json) : null,
				timestamp,
			],
		});

		return {
			id,
			session_id: input.session_id,
			task_id: input.task_id,
			level: input.level,
			event: input.event,
			payload_json: input.payload_json,
			created_at: timestamp,
		};
	};

	const listAuditLogs = async (
		_event: IpcMainInvokeEvent,
		input: { session_id: string; limit?: number },
	): Promise<AgentAuditLog[]> => {
		let sql = `SELECT * FROM agent_audit_logs WHERE session_id = ? ORDER BY created_at DESC`;
		const args: (string | number)[] = [input.session_id];

		if (input.limit) {
			sql += ` LIMIT ?`;
			args.push(input.limit);
		}

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => ({
			id: row.id as string,
			session_id: row.session_id as string,
			task_id: row.task_id as string | undefined,
			level: row.level as string,
			event: row.event as string,
			payload_json: parseJson(row.payload_json as string, undefined),
			created_at: row.created_at as number,
		}));
	};

	return {
		agent_create_message: createMessage,
		agent_list_messages: listMessages,
		agent_create_artifact: createArtifact,
		agent_list_artifacts: listArtifacts,
		agent_create_audit_log: createAuditLog,
		agent_list_audit_logs: listAuditLogs,
	};
}

// ==================
// Memory Handlers
// ==================

export function createAgentMemoryHandlers(db: DbContext) {
	const searchMemories = async (
		_event: IpcMainInvokeEvent,
		input: { query: string; limit?: number },
	): Promise<AgentMemory[]> => {
		const limit = Math.min(input.limit ?? 10, 50);
		const rows = await db.client.execute({
			sql: `SELECT * FROM agent_memories WHERE content LIKE ? OR key LIKE ?
            ORDER BY relevance_score DESC, access_count DESC
            LIMIT ?`,
			args: [`%${input.query}%`, `%${input.query}%`, limit],
		});
		return rows.rows.map((row) => ({
			id: row.id as string,
			key: row.key as string,
			content: row.content as string,
			category: row.category as string | undefined,
			relevance_score: (row.relevance_score as number) || 0.5,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
			last_accessed_at: row.last_accessed_at as number | undefined,
			access_count: (row.access_count as number) || 0,
		}));
	};

	const createMemory = async (
		_event: IpcMainInvokeEvent,
		input: { key: string; content: string; category?: string },
	): Promise<AgentMemory> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO agent_memories (id, key, content, category, relevance_score, created_at, updated_at, access_count)
            VALUES (?, ?, ?, ?, 0.5, ?, ?, 0)`,
			args: [
				id,
				input.key,
				input.content,
				input.category ?? null,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			key: input.key,
			content: input.content,
			category: input.category,
			relevance_score: 0.5,
			created_at: timestamp,
			updated_at: timestamp,
			access_count: 0,
		};
	};

	const updateMemory = async (
		_event: IpcMainInvokeEvent,
		input: { id: string; content: string },
	): Promise<{ success: boolean }> => {
		await db.client.execute({
			sql: `UPDATE agent_memories SET content = ?, updated_at = ? WHERE id = ?`,
			args: [input.content, now(), input.id],
		});
		return { success: true };
	};

	const deleteMemory = async (
		_event: IpcMainInvokeEvent,
		input: { id: string },
	): Promise<{ success: boolean }> => {
		await db.client.execute({
			sql: `DELETE FROM agent_memories WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const getMemoryByKey = async (
		_event: IpcMainInvokeEvent,
		input: { key: string },
	): Promise<AgentMemory | null> => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM agent_memories WHERE key = ?`,
			args: [input.key],
		});
		if (rows.rows.length === 0) return null;
		const row = rows.rows[0];
		return {
			id: row.id as string,
			key: row.key as string,
			content: row.content as string,
			category: row.category as string | undefined,
			relevance_score: (row.relevance_score as number) || 0.5,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
			last_accessed_at: row.last_accessed_at as number | undefined,
			access_count: (row.access_count as number) || 0,
		};
	};

	const updateMemoryAccessTime = async (
		_event: IpcMainInvokeEvent,
		input: { id: string },
	): Promise<{ success: boolean }> => {
		await db.client.execute({
			sql: `UPDATE agent_memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?`,
			args: [now(), input.id],
		});
		return { success: true };
	};

	return {
		search_agent_memories: searchMemories,
		create_agent_memory: createMemory,
		update_agent_memory: updateMemory,
		delete_agent_memory: deleteMemory,
		get_agent_memory_by_key: getMemoryByKey,
		update_agent_memory_access_time: updateMemoryAccessTime,
	};
}
