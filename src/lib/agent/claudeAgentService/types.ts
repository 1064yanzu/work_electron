import type { PlanData } from "@/lib/agent/planModeStore";

/**
 * Message types that our UI understands
 */
export interface AgentMessage {
	type:
		| "assistant"
		| "tool_call"
		| "tool_result"
		| "thought_delta"
		| "tool_progress"
		| "tool_input_update"
		| "system"
		| "result";
	content: string;
	taskId?: string;
	toolCallId?: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	toolOutput?: unknown;
	progress?: number;
	message?: string;
	thoughtMeta?: {
		title?: string;
		source?: string;
		phase?: string;
		durationMs?: number;
	};
	status?: "running" | "completed" | "error";
	metadata?: Record<string, unknown>;
}

export interface AgentUsageStats {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	costUsd?: number;
	modelUsage?: Record<
		string,
		{
			inputTokens: number;
			outputTokens: number;
			cacheReadInputTokens: number;
			cacheCreationInputTokens: number;
			webSearchRequests: number;
			costUSD: number;
			contextWindow: number;
			maxOutputTokens: number;
		}
	>;
}

/**
 * Execution options for the Claude Agent
 */
export interface ClaudeAgentExecutionOptions {
	/** The prompt/query to execute */
	prompt: string;

	/** Optional system prompt override */
	systemPrompt?: string;

	/** Working directory for file operations */
	workingDirectory?: string;

	/** Resume an existing Claude Agent SDK session (enables SDK context management across turns) */
	resumeSessionId?: string;

	/** Whether the SDK should persist sessions to disk (defaults to true in SDK) */
	persistSession?: boolean;

	/** Fork resumed session into a new branch */
	forkSession?: boolean;

	/** Resume only up to this assistant message uuid */
	resumeSessionAt?: string;

	/** Model to use for this execution (e.g., 'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5') */
	model?: string;

	/** Runtime hard limits */
	maxTurns?: number;
	thinkingLevel?: import("../../models/agentModelConfig").ThinkingLevel;
	maxBudgetUsd?: number;

	/** SDK settings sources */
	settingSources?: Array<"user" | "project" | "local">;

	/** SDK beta feature flags */
	betas?: string[];

	/** Runtime context strategy */
	contextPolicy?: "balanced" | "strict" | "aggressive";
	subagentContextMode?: "capsule" | "inherit";
	contextBudget?: {
		max_context_chars: number;
		max_files: number;
		max_file_chars: number;
	};
	enableToolSearch?: "auto" | "auto:5" | "true" | "false";

	/** Enabled skills list (used for skill routing and subagents) */
	skills?: string[];

	/** Additional absolute directories for SDK file access */
	additionalDirectories?: string[];

	/** Local plugins loaded into SDK runtime */
	plugins?: Array<{ type: "local"; path: string }>;

	/** Optional sandbox settings pass-through */
	sandbox?: Record<string, unknown>;

	/** Whether to enable canUseTool interactive approval broker */
	interactiveApproval?: boolean;

	/** SDK permission mode */
	permissionMode?: string;

	/** Callback for streaming text chunks */
	onChunk?: (text: string) => void;

	/** Callback for each message from the SDK */
	onMessage?: (message: AgentMessage) => void;

	/** Callback when execution completes */
	onComplete?: (result: {
		success: boolean;
		summary?: string;
		sessionId?: string;
		usage?: AgentUsageStats;
	}) => void;

	/** Callback for todo list updates */
	onTodoUpdate?: (
		todos: Array<{
			content: string;
			status: "pending" | "in_progress" | "completed";
			activeForm?: string;
		}>,
	) => void;

	/** Abort controller for cancellation */
	abortController?: AbortController;

	/** 是否以规划模式运行（仅输出计划，不执行修改操作） */
	planMode?: boolean;

	/** 已确认的计划，作为执行上下文注入 */
	confirmedPlan?: PlanData;
}
