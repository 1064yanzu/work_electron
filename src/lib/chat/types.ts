// AI 聊天相关类型定义

export interface FileUpdate {
	fileName: string;
	filePath?: string;
	type: "create" | "update";
	additions: number;
	deletions: number;
	status?: "running" | "completed" | "error";
	toolCallId?: string;
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
			source?: string;
			model?: string;
			truncated?: boolean;
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
			cacheReadInputTokens?: number;
			cacheCreationInputTokens?: number;
			costUsd?: number;
		};
		// Agent 任务关联信息（用于历史记录恢复）
		taskId?: string;
		sandboxDir?: string;
		parentSdkSessionId?: string;
		contextCharsBefore?: number;
		contextCharsAfter?: number;
		attachedFilesBefore?: number;
		attachedFilesAfter?: number;
		dedupeHitCount?: number;
		compactionCount?: number;
		degradeLevel?: number;
		agentRole?: string;
		leaderRunId?: string;
		parentSessionId?: string;
		teamId?: string;
		delegationMode?: string;
		teammateMode?: string;
		experimentalMultiAgent?: boolean;
		maxTeammates?: number;
		// LLM 调用错误详情
		errorDetail?: {
			code: string;
			title: string;
			httpStatus?: number;
		};
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
	/** 关联的工作目录（用于线程按项目分组） */
	cwd?: string;
	/** 是否在线程列表中置顶。 */
	isPinned?: boolean;
	/** 是否归档；归档后进入“归档对话”分组，可取消归档。 */
	isArchived?: boolean;
	/** 会话来源元数据。远程控制会话需要在 Threads 中单独列出。 */
	threadSource?: {
		type: "local" | "remote";
		remoteSessionId?: string;
		channelId?: string;
		peerName?: string;
		peerId?: string;
	};
	// ===== SQLite 后端的瞬态字段（不持久化进 localStorage 压缩格式） =====
	/**
	 * 消息全文是否已加载进内存。
	 * undefined / true = 已加载（localstorage 模式、新建会话、已按需加载）；
	 * false = 仅元数据（sqlite 模式下的未加载会话，messages 为 []）。
	 */
	messagesLoaded?: boolean;
	/** 消息总数（sqlite 模式下未加载会话由 DB 派生；已加载时与 messages.length 一致） */
	messageCount?: number;
	/** 末条消息预览（sqlite 模式下未加载会话的列表展示用） */
	lastPreview?: {
		role: ChatMessage["role"];
		content: string;
		timestamp: number;
	};
	/** 末条 user 消息预览（线程列表 getSessionPreview 用） */
	lastUserPreview?: string;
}

/** 会话消息是否已加载进内存（undefined 视为已加载，兼容 localstorage 模式） */
export function isSessionLoaded(session: ChatSession): boolean {
	return session.messagesLoaded !== false;
}

/** 会话消息数（未加载会话读 DB 派生的 messageCount） */
export function getSessionMessageCount(session: ChatSession): number {
	return isSessionLoaded(session)
		? session.messages.length
		: (session.messageCount ?? session.messages.length);
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
	channel?: "text" | "thought";
	thoughtMeta?: {
		title?: string;
		source?: string;
		model?: string;
		phase?: string;
		durationMs?: number;
	};
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
