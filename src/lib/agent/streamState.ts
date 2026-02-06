/**
 * Agent Stream State
 *
 * 前端流式状态跟踪器，用于处理转换后的 UI 事件。
 * 与后端 transform.mjs 中的 StreamState 配合使用。
 */

export interface TextEvent {
	type: "text" | "text_delta";
	content: string;
	index?: number;
}

export interface ThoughtDeltaEvent {
	type: "thought_delta";
	content: string;
	source?: string;
	title?: string;
	index?: number;
}

export interface ToolCallStartEvent {
	type: "tool_call_start";
	id: string;
	name: string;
	index?: number;
	input: Record<string, unknown>;
}

export interface ToolCallEndEvent {
	type: "tool_call_end";
	id: string;
	output: unknown;
	isError: boolean;
	duration?: number;
}

export interface ToolBlockStopEvent {
	type: "tool_block_stop";
	index: number;
}

export interface ToolInputCompleteEvent {
	type: "tool_input_complete";
	id: string;
	input: Record<string, unknown>;
}

export interface ResultEvent {
	type: "result";
	subtype: "success" | "error" | "cancelled";
	isError: boolean;
	result: string;
	durationMs?: number;
	numTurns?: number;
}

export interface SessionInitEvent {
	type: "session_init";
	sessionId: string;
	cwd?: string;
}

export interface TurnCompleteEvent {
	type: "turn_complete";
	messageId?: string;
}

export interface SystemNoticeEvent {
	type: "system_notice";
	level?: "info" | "warning" | "error";
	content: string;
}

export interface SessionStartEvent {
	type: "session_start";
	source?: string;
	agentType?: string;
	model?: string;
}

export interface SessionEndEvent {
	type: "session_end";
	reason?: string;
}

export interface SubagentStartEvent {
	type: "subagent_start";
	agentId?: string | null;
	agentType?: string | null;
}

export interface SubagentStopEvent {
	type: "subagent_stop";
	agentId?: string | null;
	agentType?: string | null;
	transcriptPath?: string | null;
}

export interface TaskNotificationEvent {
	type: "task_notification";
	taskId?: string;
	status?: "completed" | "failed" | "stopped" | string;
	outputFile?: string;
	summary?: string;
	notificationType?: string | null;
	title?: string | null;
	message?: string | null;
}

export interface ToolUseSummaryEvent {
	type: "tool_use_summary";
	summary: string;
	precedingToolUseIds: string[];
}

export interface FilesPersistedEvent {
	type: "files_persisted";
	files: Array<{ filename: string; file_id: string }>;
	failed: Array<{ filename: string; error: string }>;
	processedAt?: string;
}

export interface AuthStatusEvent {
	type: "auth_status";
	isAuthenticating: boolean;
	output: string[];
	error?: string;
}

export type UIEvent =
	| TextEvent
	| ThoughtDeltaEvent
	| ToolCallStartEvent
	| ToolCallEndEvent
	| ToolBlockStopEvent
	| ToolInputCompleteEvent
	| ResultEvent
	| SessionInitEvent
	| TurnCompleteEvent
	| SystemNoticeEvent
	| SessionStartEvent
	| SessionEndEvent
	| SubagentStartEvent
	| SubagentStopEvent
	| TaskNotificationEvent
	| ToolUseSummaryEvent
	| FilesPersistedEvent
	| AuthStatusEvent
	| { type: "unknown"; originalType: string; data: unknown };

/**
 * 流式状态跟踪器
 */
export class AgentStreamState {
	private sessionId: string | null = null;
	private currentText = "";
	private pendingToolCalls = new Map<string, ToolCallStartEvent>();
	private completedToolCalls = new Map<
		string,
		{ start: ToolCallStartEvent; end: ToolCallEndEvent }
	>();

	/**
	 * 处理转换后的 UI 事件
	 */
	processEvents(events: UIEvent[]): void {
		for (const event of events) {
			switch (event.type) {
				case "session_init":
					this.sessionId = event.sessionId;
					break;

				case "text":
					this.currentText = event.content;
					break;

				case "text_delta":
					this.currentText += event.content;
					break;

				case "thought_delta":
					break;

				case "tool_call_start":
					this.pendingToolCalls.set(event.id, event);
					break;

				case "tool_call_end": {
					const startEvent = this.pendingToolCalls.get(event.id);
					if (startEvent) {
						this.pendingToolCalls.delete(event.id);
						this.completedToolCalls.set(event.id, {
							start: startEvent,
							end: event,
						});
					}
					break;
				}

				case "turn_complete":
					// 可以在这里做一轮对话完成后的处理
					break;

				case "session_start":
				case "session_end":
				case "subagent_start":
				case "subagent_stop":
				case "task_notification":
				case "tool_use_summary":
				case "files_persisted":
				case "auth_status":
					break;
			}
		}
	}

	/**
	 * 获取当前累积的文本
	 */
	getText(): string {
		return this.currentText;
	}

	/**
	 * 获取当前正在执行的工具调用
	 */
	getPendingToolCalls(): ToolCallStartEvent[] {
		return Array.from(this.pendingToolCalls.values());
	}

	/**
	 * 获取已完成的工具调用
	 */
	getCompletedToolCalls(): Array<{
		start: ToolCallStartEvent;
		end: ToolCallEndEvent;
	}> {
		return Array.from(this.completedToolCalls.values());
	}

	/**
	 * 获取会话 ID
	 */
	getSessionId(): string | null {
		return this.sessionId;
	}

	/**
	 * 重置状态（新会话开始时调用）
	 */
	reset(): void {
		this.sessionId = null;
		this.currentText = "";
		this.pendingToolCalls.clear();
		this.completedToolCalls.clear();
	}
}

/**
 * 创建一个新的状态跟踪器实例
 */
export function createStreamState(): AgentStreamState {
	return new AgentStreamState();
}
