// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：agentSdk（共 6 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface AgentSdkIpcSchema {
	// ==================
	// Claude Agent SDK Runner
	// ==================
	agent_sdk_start: {
		input: {
			prompt: string;
			model: string;
			cwd?: string;
			/** Claude Agent SDK session id to resume (enables SDK context management/compaction across turns) */
			resume_session_id?: string;
			/** Whether to persist SDK sessions to disk (defaults to true in SDK) */
			persist_session?: boolean;
			/** MCP server configs passed through to SDK `mcpServers` */
			mcp_servers?: Record<
				string,
				{ command: string; args?: string[]; env?: Record<string, string> }
			>;
			permission_mode?: string;
			allowed_tools?: string[];
			system_prompt?: string;
			skills?: string[]; // 可用技能名称列表
			/** Additional absolute directories exposed to SDK file tools */
			additional_directories?: string[];
			/** Local Claude plugins to load for this run */
			plugins?: Array<{ type: "local"; path: string }>;
			/** Optional sandbox settings passed through to SDK */
			sandbox?: Record<string, unknown>;
			/** Enable interactive approval broker in canUseTool (default: true) */
			interactive_approval?: boolean;
			/** Fork resumed session into a new branch */
			fork_session?: boolean;
			/** Resume only up to a specific assistant message uuid */
			resume_session_at?: string;
			/** Max conversation turns */
			max_turns?: number;
			/**
			 * 思考档位（直接透传给 SDK 的 effort / thinking 字段）。
			 * - "off" → thinking: { type: "disabled" }
			 * - "low" / "medium" / "high" / "xhigh" → effort
			 * - 未提供 → 不传，SDK 自行决定（Opus 4.6+ 默认 adaptive + high）
			 */
			thinking_level?: "off" | "low" | "medium" | "high" | "xhigh";
			/** Max budget in USD */
			max_budget_usd?: number;
			/** SDK settingSources passthrough */
			setting_sources?: Array<"user" | "project" | "local">;
			/** SDK beta features */
			betas?: string[];
			/** Runtime context strategy */
			context_policy?: "balanced" | "strict" | "aggressive";
			/** Subagent context inheritance policy */
			subagent_context_mode?: "capsule" | "inherit";
			/** Context budget controls */
			context_budget?: {
				max_context_chars: number;
				max_files: number;
				max_file_chars: number;
			};
			/** MCP tool search mode */
			enable_tool_search?: "auto" | "auto:5" | "true" | "false";
		};
		output: string;
	};
	agent_sdk_abort: {
		input: { runId: string };
		output: { success: boolean };
	};
	agent_sdk_resolve_interaction: {
		input: {
			runId: string;
			requestId: string;
			decision: {
				behavior: "allow" | "deny";
				message?: string;
				updatedInput?: Record<string, unknown>;
				updatedPermissions?: unknown[];
				interrupt?: boolean;
			};
		};
		output: { success: boolean };
	};
	agent_sdk_control: {
		input: {
			runId: string;
			action:
				| "set_permission_mode"
				| "set_model"
				| "interrupt"
				| "mcp_status"
				| "mcp_reconnect"
				| "mcp_toggle"
				| "mcp_set_servers"
				| "stop_task";
			mode?: string;
			model?: string;
			serverName?: string;
			enabled?: boolean;
			servers?: Record<string, unknown>;
			/** SDK 侧 task_id（来自 task_started/task_progress 事件），用于 stop_task。 */
			taskId?: string;
		};
		output: { success: boolean; data?: unknown; error?: string };
	};

	agent_sdk_send_followup: {
		input: {
			runId: string;
			message: string;
			attachments?: Array<{ path: string; title?: string }>;
		};
		output: { success: boolean; error?: string };
	};

	agent_sdk_check_alive: {
		input: { runId: string };
		output: { alive: boolean };
	};
}
