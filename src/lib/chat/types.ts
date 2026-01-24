// AI 聊天相关类型定义

export interface FileUpdate {
	fileName: string;
	type: "create" | "update";
	additions: number;
	deletions: number;
}

export type ChatMessageBlock =
	| { type: "text"; text: string }
	| { type: "image"; title?: string; path: string }
	| {
		type: "thought";
		title: string;
		content: string;
		phase?: string;
		durationMs?: number;
	}
	| { type: "task_list"; taskId: string }
	| { type: "agent_task"; taskId: string }
	| {
		type: "tool_call";
		taskId: string;
		toolCallId: string;
		toolType?: string;
		name?: string;
		status?: "pending" | "running" | "completed" | "error" | "cancelled";
		input?: any;
		output?: any;
		error?: string;
	}
	| { type: "file_update"; update: FileUpdate }
	| {
		type: "skill_execution";
		skillName: string;
		skillPath: string;
		status: string;
		steps: any[];
		loadedFiles: any[];
		detectedScene?: string;
	};

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system" | "trace";
	content: string;
	timestamp: number;
	isStreaming?: boolean;
	model?: string;
	// 用于 diff 视图
	suggestedContent?: string;
	originalContent?: string;
	// 额外元数据
	metadata?: {
		agentMessageId?: string;
		fileUpdates?: FileUpdate[];
		blocks?: ChatMessageBlock[];
		// 用户附加的文件
		attachedFiles?: Array<{
			title: string;
			path: string;
			type?: "file" | "document"; // 文件类型
			size?: number; // 文件大小
		}>;
		trace?:
		| {
			type: "agent_task";
			taskId: string;
		}
		| {
			type: "tool_call";
			taskId: string;
			toolCallId: string;
		};
		// Token 消耗统计
		tokenUsage?: {
			promptTokens: number;
			completionTokens: number;
			totalTokens: number;
		};
		// Agent 任务关联信息（用于历史记录恢复）
		taskId?: string;
		sandboxDir?: string;
	};
}

export interface ChatSession {
	id: string;
	title: string;
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
	model?: string;
	agentSessionId?: string;
	/** Claude Agent SDK session id for SDK-native context management/compaction */
	sdkSessionId?: string;
}

export interface ChatContext {
	id: string;
	type: "source" | "file" | "selection";
	title: string;
	content?: string;
}

export interface StreamChunk {
	content: string;
	done: boolean;
}

export type ChatStatus = "idle" | "streaming" | "error";

export interface ChatState {
	sessions: ChatSession[];
	activeSessionId: string | null;
	status: ChatStatus;
	error: string | null;
}

// 生成唯一 ID
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// 创建新消息
export function createMessage(
	role: ChatMessage["role"],
	content: string,
	options?: Partial<ChatMessage>,
): ChatMessage {
	return {
		id: generateId(),
		role,
		content,
		timestamp: Date.now(),
		...options,
	};
}

// 创建新会话
export function createSession(title?: string): ChatSession {
	const now = Date.now();
	return {
		id: generateId(),
		title:
			title ||
			`对话 ${new Date(now).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
		messages: [],
		createdAt: now,
		updatedAt: now,
		agentSessionId: undefined,
		sdkSessionId: undefined,
	};
}
