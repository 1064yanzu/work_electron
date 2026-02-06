/**
 * Agent Checkpoint IPC Handlers
 *
 * 处理任务检查点的保存、读取、删除和清理操作
 * 用于支持任务断点续传功能
 */

import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { AgentCheckpoint } from "../../../shared/types";

type AgentCheckpointSaveInput = IPCSchema["agent_checkpoint_save"]["input"];
type AgentCheckpointSaveOutput = IPCSchema["agent_checkpoint_save"]["output"];
type AgentCheckpointGetInput = IPCSchema["agent_checkpoint_get"]["input"];
type AgentCheckpointGetOutput = IPCSchema["agent_checkpoint_get"]["output"];
type AgentCheckpointDeleteInput = IPCSchema["agent_checkpoint_delete"]["input"];
type AgentCheckpointDeleteOutput =
	IPCSchema["agent_checkpoint_delete"]["output"];
type AgentCheckpointCleanupInput =
	IPCSchema["agent_checkpoint_cleanup"]["input"];
type AgentCheckpointCleanupOutput =
	IPCSchema["agent_checkpoint_cleanup"]["output"];

/**
 * 解析 JSON 字符串，失败时返回默认值
 */
function parseJson<T>(str: string | null | undefined, fallback: T): T {
	if (!str) return fallback;
	try {
		return JSON.parse(str) as T;
	} catch {
		return fallback;
	}
}

export function createAgentCheckpointHandlers(options: {
	db: () => DbContext;
	logger: Logger;
}) {
	const { db, logger } = options;

	/**
	 * 将数据库行转换为 AgentCheckpoint 对象
	 */
	function rowToCheckpoint(row: any): AgentCheckpoint {
		return {
			id: row.id as string,
			task_id: row.task_id as string,
			session_id: row.session_id as string,
			sdk_session_id: (row.sdk_session_id as string) || undefined,
			sandbox_dir: (row.sandbox_dir as string) || undefined,
			last_tool_call_id: (row.last_tool_call_id as string) || undefined,
			tool_calls_completed: parseJson(row.tool_calls_completed as string, []),
			accumulated_result: (row.accumulated_result as string) || "",
			metadata: parseJson(row.metadata as string, {}),
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		};
	}

	/**
	 * 保存或更新检查点
	 */
	const agent_checkpoint_save = async (
		_event: IpcMainInvokeEvent,
		input: AgentCheckpointSaveInput,
	): Promise<AgentCheckpointSaveOutput> => {
		const { client } = db();
		const now = Date.now();

		// 检查是否已有此任务的检查点
		const existing = await client.execute({
			sql: "SELECT id FROM agent_checkpoints WHERE task_id = ?",
			args: [input.task_id],
		});

		if (existing.rows.length > 0) {
			// 更新现有检查点
			const updates: string[] = [];
			const args: (string | number | null)[] = [];

			if (input.sdk_session_id !== undefined) {
				updates.push("sdk_session_id = ?");
				args.push(input.sdk_session_id ?? null);
			}
			if (input.sandbox_dir !== undefined) {
				updates.push("sandbox_dir = ?");
				args.push(input.sandbox_dir ?? null);
			}
			if (input.last_tool_call_id !== undefined) {
				updates.push("last_tool_call_id = ?");
				args.push(input.last_tool_call_id ?? null);
			}
			if (input.tool_calls_completed !== undefined) {
				updates.push("tool_calls_completed = ?");
				args.push(JSON.stringify(input.tool_calls_completed));
			}
			if (input.accumulated_result !== undefined) {
				updates.push("accumulated_result = ?");
				args.push(input.accumulated_result);
			}
			if (input.metadata !== undefined) {
				updates.push("metadata = ?");
				args.push(JSON.stringify(input.metadata));
			}

			updates.push("updated_at = ?");
			args.push(now);
			args.push(input.task_id);

			await client.execute({
				sql: `UPDATE agent_checkpoints SET ${updates.join(", ")} WHERE task_id = ?`,
				args,
			});

			logger.info({
				msg: "checkpoint updated",
				scope: "agent",
				task_id: input.task_id,
			});
		} else {
			// 创建新检查点
			const id = randomUUID();
			await client.execute({
				sql: `INSERT INTO agent_checkpoints (
					id, task_id, session_id, sdk_session_id, sandbox_dir,
					last_tool_call_id, tool_calls_completed, accumulated_result,
					metadata, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					id,
					input.task_id,
					input.session_id,
					input.sdk_session_id ?? null,
					input.sandbox_dir ?? null,
					input.last_tool_call_id ?? null,
					JSON.stringify(input.tool_calls_completed ?? []),
					input.accumulated_result ?? "",
					JSON.stringify(input.metadata ?? {}),
					now,
					now,
				],
			});

			logger.info({
				msg: "checkpoint created",
				scope: "agent",
				task_id: input.task_id,
				checkpoint_id: id,
			});
		}

		// 返回保存后的检查点
		const saved = await client.execute({
			sql: "SELECT * FROM agent_checkpoints WHERE task_id = ?",
			args: [input.task_id],
		});

		return rowToCheckpoint(saved.rows[0]);
	};

	/**
	 * 获取任务的检查点
	 */
	const agent_checkpoint_get = async (
		_event: IpcMainInvokeEvent,
		input: AgentCheckpointGetInput,
	): Promise<AgentCheckpointGetOutput> => {
		const { client } = db();

		const result = await client.execute({
			sql: "SELECT * FROM agent_checkpoints WHERE task_id = ?",
			args: [input.task_id],
		});

		if (result.rows.length === 0) {
			return null;
		}

		return rowToCheckpoint(result.rows[0]);
	};

	/**
	 * 删除任务的检查点
	 */
	const agent_checkpoint_delete = async (
		_event: IpcMainInvokeEvent,
		input: AgentCheckpointDeleteInput,
	): Promise<AgentCheckpointDeleteOutput> => {
		const { client } = db();

		const result = await client.execute({
			sql: "DELETE FROM agent_checkpoints WHERE task_id = ?",
			args: [input.task_id],
		});

		if (result.rowsAffected > 0) {
			logger.info({
				msg: "checkpoint deleted",
				scope: "agent",
				task_id: input.task_id,
			});
		}

		return { success: result.rowsAffected > 0 };
	};

	/**
	 * 清理过期的检查点
	 */
	const agent_checkpoint_cleanup = async (
		_event: IpcMainInvokeEvent,
		input: AgentCheckpointCleanupInput,
	): Promise<AgentCheckpointCleanupOutput> => {
		const { client } = db();
		const days = input.days ?? 7;
		const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

		const result = await client.execute({
			sql: "DELETE FROM agent_checkpoints WHERE updated_at < ?",
			args: [cutoffTime],
		});

		if (result.rowsAffected > 0) {
			logger.info({
				msg: "checkpoints cleanup",
				scope: "agent",
				deleted_count: result.rowsAffected,
				days,
			});
		}

		return { deleted_count: result.rowsAffected };
	};

	return {
		agent_checkpoint_save,
		agent_checkpoint_get,
		agent_checkpoint_delete,
		agent_checkpoint_cleanup,
	};
}
