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

export interface ToolCallStartEvent {
	type: "tool_call_start";
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface ToolCallEndEvent {
	type: "tool_call_end";
	id: string;
	output: unknown;
	isError: boolean;
	duration?: number;
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

export type UIEvent =
	| TextEvent
	| ToolCallStartEvent
	| ToolCallEndEvent
	| ResultEvent
	| SessionInitEvent
	| TurnCompleteEvent
	| SystemNoticeEvent
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
