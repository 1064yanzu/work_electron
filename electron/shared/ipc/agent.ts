// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：agent（共 38 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	AgentArtifact,
	AgentAuditLog,
	AgentCheckpoint,
	AgentMessage,
	AgentNode,
	AgentSession,
	AgentTask,
	AgentToolCall,
	SaveCheckpointPayload,
} from "./common";

export interface AgentIpcSchema {
	/**
	 * Agent 数据保留策略：扫描过期的 agent 会话数。
	 * 默认保留最近 90 天，可通过 app_config('agent.retention_days') 调整。
	 */
	agent_retention_scan: {
		input: Record<string, never>;
		output: {
			expired_sessions: number;
			total_sessions: number;
			retention_days: number;
			cutoff_date: string;
		};
	};
	/** Agent 数据保留策略：手动触发清理过期会话（级联删除关联 tasks/messages）。 */
	agent_retention_clean: {
		input: Record<string, never>;
		output: {
			deleted_sessions: number;
			retention_days: number;
		};
	};
	agent_get_sandbox_dir: {
		input: { taskId: string };
		output: { path: string };
	};

	// ==================
	// Agent Runtime（会话/消息等）
	// ==================
	agent_create_session: {
		input: {
			title?: string;
			project_id?: string | null;
			config_json?: unknown;
		};
		output: AgentSession;
	};
	agent_get_session: {
		input: { id: string };
		output: AgentSession | null;
	};
	agent_list_sessions: {
		input: { status?: string; limit?: number; project_id?: string | null };
		output: AgentSession[];
	};
	agent_update_session: {
		input: {
			id: string;
			title?: string;
			status?: string;
			config_json?: unknown;
		};
		output: AgentSession;
	};
	agent_delete_session: {
		input: { id: string };
		output: { success: boolean };
	};
	agent_create_message: {
		input: {
			session_id: string;
			task_id?: string;
			role: string;
			content_json: unknown;
			agent_session_id?: string;
		};
		output: AgentMessage;
	};
	agent_list_messages: {
		input: {
			session_id: string;
			task_id?: string;
			/** 最多返回条数（取最近 N 条后按时间正序返回）。不传默认 500；传 0 或负数表示不限制（全量） */
			limit?: number;
			/** 向前翻页偏移（跳过最近的 offset 条，与 limit 配合使用） */
			offset?: number;
		};
		output: AgentMessage[];
	};
	/**
	 * 就地更新一条消息（流式补完 / 编辑后回写）。
	 * 只更新显式传入的字段，省略的字段保持原值。
	 */
	agent_update_message: {
		input: {
			id: string;
			content_json?: unknown;
			agent_session_id?: string;
		};
		output: AgentMessage;
	};

	// ==================
	// Agent Runtime（任务 / 节点 / 工具调用 / 产物 / 审计日志）
	//
	// 这些命令一直在 register.ts 里注册、也一直被 src/lib/agent/api.ts 调用，
	// 但历史上漏进了 schema。preload 上了 channel 白名单之后它们会被直接拒绝，
	// 因此补齐既是类型收口也是功能修复。
	// ==================
	agent_create_task: {
		input: { session_id: string; goal: string; budget_json?: unknown };
		output: AgentTask;
	};
	agent_get_task: {
		input: { id: string };
		output: AgentTask | null;
	};
	agent_list_tasks: {
		input: { session_id?: string; status?: string; limit?: number };
		output: AgentTask[];
	};
	agent_update_task: {
		input: {
			id: string;
			status?: string;
			error?: string;
			result_summary?: string;
			budget_json?: unknown;
			started_at?: number;
			finished_at?: number;
		};
		output: AgentTask;
	};
	agent_create_node: {
		input: {
			task_id: string;
			kind: string;
			name: string;
			depends_on?: string[];
			input_json?: unknown;
		};
		output: AgentNode;
	};
	agent_list_nodes: {
		input: { task_id: string };
		output: AgentNode[];
	};
	agent_update_node: {
		input: {
			id: string;
			status?: string;
			output_json?: unknown;
			error?: string;
			started_at?: number;
			finished_at?: number;
		};
		output: AgentNode;
	};
	agent_create_tool_call: {
		input: {
			task_id: string;
			node_id: string;
			tool_name: string;
			tool_source?: string;
			mcp_server_id?: string;
			args_json?: unknown;
		};
		output: AgentToolCall;
	};
	agent_list_tool_calls: {
		input: {
			task_id?: string;
			node_id?: string;
			/** 最多返回条数（取最近 N 条后按时间正序返回）。不传默认 500；传 0 或负数表示不限制（全量） */
			limit?: number;
			/** 向前翻页偏移（跳过最近的 offset 条，与 limit 配合使用） */
			offset?: number;
		};
		output: AgentToolCall[];
	};
	agent_update_tool_call: {
		input: {
			id: string;
			status?: string;
			result_json?: unknown;
			error?: string;
		};
		output: { success: boolean };
	};
	agent_create_artifact: {
		input: {
			task_id: string;
			kind: string;
			title?: string;
			payload_json: unknown;
		};
		output: AgentArtifact;
	};
	agent_list_artifacts: {
		input: { task_id: string };
		output: AgentArtifact[];
	};
	agent_create_audit_log: {
		input: {
			session_id: string;
			task_id?: string;
			level: string;
			event: string;
			payload_json?: unknown;
		};
		output: AgentAuditLog;
	};
	agent_list_audit_logs: {
		input: { session_id: string; limit?: number };
		output: AgentAuditLog[];
	};

	// ==================
	// Agent 检查点命令（断点续传）
	// ==================
	agent_checkpoint_save: {
		input: SaveCheckpointPayload;
		output: AgentCheckpoint;
	};
	agent_checkpoint_get: {
		input: { task_id: string };
		output: AgentCheckpoint | null;
	};
	agent_checkpoint_delete: {
		input: { task_id: string };
		output: { success: boolean };
	};
	agent_checkpoint_cleanup: {
		input: { days?: number }; // 默认清理 7 天前的检查点
		output: { deleted_count: number };
	};

	// ==================
	// Agent 记忆管理（Markdown 文件式：SOUL/USER/MEMORY + SDK 自动加载的 CLAUDE.md/AGENTS.md）
	// ==================
	agent_get_memory_stats: {
		input: Record<string, never>;
		output: {
			soul: { chars: number; limit: number };
			user: { chars: number; limit: number; entries: number };
			memory: { chars: number; limit: number; entries: number };
		};
	};
	agent_get_memory_context: {
		input: Record<string, never>;
		output: { context: string; memory_count: number };
	};
	agent_clear_all_memories: {
		input: Record<string, never>;
		// deleted = 被清空的总字符数（仅 USER + MEMORY；SOUL 不动）
		output: { deleted: number };
	};
	agent_memory_read_file: {
		input: {
			file:
				| "soul"
				| "user"
				| "memory"
				| "global_claude_md"
				| "project_claude_md"
				| "project_agents_md";
			cwd?: string | null;
		};
		output: {
			token: string;
			displayName: string;
			path: string;
			content: string;
			charCount: number;
			limit?: number;
			lastModified: number;
			exists: boolean;
			managedBy: "ipo" | "sdk";
			requiresConfirm: boolean;
			cwdRelative: boolean;
		};
	};
	agent_memory_write_file: {
		input: {
			file:
				| "soul"
				| "user"
				| "memory"
				| "global_claude_md"
				| "project_claude_md"
				| "project_agents_md";
			content: string;
			cwd?: string | null;
			// global_claude_md 写入必须 confirmed=true
			confirmed?: boolean;
		};
		output: { ok: boolean; error?: string; path?: string };
	};
	agent_memory_list_context_files: {
		input: { cwd?: string | null };
		output: Array<{
			token: string;
			displayName: string;
			path: string;
			content: string;
			charCount: number;
			limit?: number;
			lastModified: number;
			exists: boolean;
			managedBy: "ipo" | "sdk";
			requiresConfirm: boolean;
			cwdRelative: boolean;
			injectedInActiveSnapshot: boolean;
		}>;
	};
	agent_memory_get_snapshot: {
		input: { runId: string };
		output: {
			runId: string;
			frozenAt: number;
			soul: string;
			user: string;
			memory: string;
		} | null;
	};
	agent_memory_open_folder: {
		input: { path: string };
		output: { ok: boolean };
	};
	agent_memory_set_active_cwd: {
		input: { cwd: string | null };
		output: { ok: boolean };
	};
}
