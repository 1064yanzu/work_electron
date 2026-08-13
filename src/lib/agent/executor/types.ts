import type { AgentMessage } from "@/lib/agent/claudeAgentService";
import type { PlanData } from "@/lib/agent/planModeStore";
import type { ThinkingLevel } from "@/lib/models/agentModelConfig";

// Agent 执行配置
export interface AgentExecutorConfig {
	maxToolCalls?: number;
	timeout?: number;
	autoExecute?: boolean;
}

export interface ExecutorAttachedFile {
	title: string;
	path: string;
	type?: "file" | "document";
	mimeType?: string;
	size?: number;
	isBinary?: boolean;
}

export interface ExecutorThoughtChunkMeta {
	title?: string;
	source?: string;
	phase?: string;
	durationMs?: number;
}

export interface ExecuteCustomTaskOptions {
	conversationContext?: string[];
	fallbackSearchQuery?: string | null;
	activeDocContent?: string | null;
	hasActiveDoc?: boolean;
	activeDocPath?: string | null;
	attachedContexts?: Array<{ title: string; content: string }>;
	attachedFiles?: ExecutorAttachedFile[];
	/** Chat window/session ID for log grouping. */
	conversationSessionId?: string;
	workingDirectory?: string;
	/** Reuse the same sandbox dir across turns by providing a stable key */
	sandboxKey?: string;
	/** Resume an existing SDK session to enable SDK context management/compaction */
	resumeSessionId?: string;
	/** Whether to persist SDK sessions to disk (defaults to true in SDK) */
	persistSession?: boolean;
	forkSession?: boolean;
	resumeSessionAt?: string;
	maxTurns?: number;
	thinkingLevel?: ThinkingLevel;
	maxBudgetUsd?: number;
	settingSources?: Array<"user" | "project" | "local">;
	betas?: string[];
	contextPolicy?: "balanced" | "strict" | "aggressive";
	subagentContextMode?: "capsule" | "inherit";
	documentContextInjected?: boolean;
	contextBudget?: {
		maxContextChars: number;
		maxFiles: number;
		maxFileChars: number;
	};
	enableToolSearch?: "auto" | "auto:5" | "true" | "false";
	parentSdkSessionId?: string;
	/** 是否启用规划模式 */
	planMode?: boolean;
	/** 已确认的计划（用于执行阶段） */
	confirmedPlan?: PlanData;
	onChunk?: (chunk: string) => void;
	onMessage?: (message: AgentMessage) => void;
	onThoughtChunk?: (chunk: string, meta?: ExecutorThoughtChunkMeta) => void;
}

export interface ExecuteFollowupOptions {
	attachedContexts?: Array<{ title: string; content: string }>;
	attachedFiles?: ExecutorAttachedFile[];
	workingDirectory?: string;
	onChunk?: (chunk: string) => void;
	onMessage?: (message: AgentMessage) => void;
	onThoughtChunk?: (chunk: string, meta?: ExecutorThoughtChunkMeta) => void;
}
