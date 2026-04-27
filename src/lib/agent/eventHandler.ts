/**
 * Agent Event Handler
 *
 * 处理从 SDK 接收的事件并转换为 UI 回调。
 * 集中管理事件处理逻辑，与 ClaudeAgentService 解耦。
 */

import type { AgentSdkEventPayload } from "./sdkClient";
import { AgentStreamState, type UIEvent } from "./streamState";
import type { AgentMessage } from "./claudeAgentService";

/**
 * 事件处理回调
 */
export interface EventHandlerCallbacks {
	onChunk?: (text: string) => void;
	onMessage?: (message: AgentMessage) => void;
	onComplete?: (result: { success: boolean; summary?: string }) => void;
	onError?: (error: string) => void;
}

/**
 * Agent 事件处理器
 */
export class AgentEventHandler {
	private streamState = new AgentStreamState();
	private callbacks: EventHandlerCallbacks = {};
	private toolUseErrorCount = 0;
	private lastToolUseError: string | null = null;
	/** 累积已发送的可见文本，用于 text_delta 去重（避免与 claudeAgentService 双重推送） */
	private streamedVisibleText = "";

	/**
	 * 设置回调函数
	 */
	setCallbacks(callbacks: EventHandlerCallbacks): void {
		this.callbacks = callbacks;
	}

	/**
	 * 处理 SDK 事件
	 */
	handleEvent(payload: AgentSdkEventPayload): {
		shouldAbort: boolean;
		abortReason?: string;
	} {
		const { type } = payload;

		switch (type) {
			case "sdk_message":
				return this.handleSdkMessage(payload);

			case "transformed":
				return this.handleTransformed(payload);

			case "stderr":
				this.handleStderr(payload);
				return { shouldAbort: false };

			case "done":
				this.handleDone(payload);
				return { shouldAbort: false };

			case "error":
				this.handleError(payload);
				return { shouldAbort: false };

			default:
				return { shouldAbort: false };
		}
	}

	/**
	 * 处理 SDK 原始消息
	 */
	private handleSdkMessage(payload: AgentSdkEventPayload): {
		shouldAbort: boolean;
		abortReason?: string;
	} {
		const message = payload.message as any;
		if (!message) return { shouldAbort: false };

		// 检测重复工具错误
		if (message.type === "user") {
			const blocks = Array.isArray(message.message?.content)
				? message.message.content
				: [];
			const toolErrors = blocks
				.filter((b: any) => b?.type === "tool_result")
				.map((b: any) => (typeof b?.content === "string" ? b.content : ""))
				.filter((s: string) => s.includes("<tool_use_error>"));

			if (toolErrors.length > 0) {
				this.toolUseErrorCount += toolErrors.length;
				this.lastToolUseError =
					toolErrors[toolErrors.length - 1] ?? this.lastToolUseError;

				if (this.toolUseErrorCount >= 3) {
					const err = this.lastToolUseError || "Tool call failed repeatedly";
					this.callbacks.onComplete?.({ success: false, summary: err });
					return { shouldAbort: true, abortReason: err };
				}
			}
		}

		// 处理 assistant 消息（仅发送 onMessage，不调用 onChunk）
		// text 内容统一由 handleTransformed 的 text_delta 路径处理，避免重复
		if (message.type === "assistant" || message.type === "stream_event") {
			const content = this.extractTextFromMessage(message);
			if (content) {
				this.callbacks.onMessage?.({
					type: "assistant",
					content,
					status: "running",
				});
			}
		}

		return { shouldAbort: false };
	}

	/**
	 * 处理转换后的 UI 事件
	 */
	private handleTransformed(payload: AgentSdkEventPayload): {
		shouldAbort: boolean;
		abortReason?: string;
	} {
		const events = (payload as any).events as UIEvent[];
		if (!events || events.length === 0) return { shouldAbort: false };

		this.streamState.processEvents(events);

		for (const event of events) {
			switch (event.type) {
				case "text":
					// 'text' 是完整快照，只取相对于已发送文本的新增部分
					if (typeof event.content === "string" && event.content.length > this.streamedVisibleText.length) {
						const delta = event.content.slice(this.streamedVisibleText.length);
						if (delta) {
							this.streamedVisibleText = event.content;
							this.callbacks.onChunk?.(delta);
						}
					}
					break;
				case "text_delta":
					// 'text_delta' 是真正的增量，直接追加（无需去重）
					if (typeof event.content === "string" && event.content) {
						this.streamedVisibleText += event.content;
						this.callbacks.onChunk?.(event.content);
					}
					break;

				case "thought_delta":
					this.callbacks.onMessage?.({
						type: "thought_delta",
						content: event.content,
						thoughtMeta: {
							title: event.title,
							source: event.source,
						},
						status: "running",
					});
					break;

				case "tool_call_start":
					this.callbacks.onMessage?.({
						type: "tool_call",
						toolCallId: event.id,
						content: `Calling ${event.name}...`,
						toolName: event.name,
						toolInput: event.input,
						status: "running",
					});
					break;

				case "tool_call_end":
					this.callbacks.onMessage?.({
						type: "tool_result",
						toolCallId: event.id,
						content:
							typeof event.output === "string"
								? event.output
								: JSON.stringify(event.output),
						toolOutput: event.output,
						status: event.isError ? "error" : "completed",
					});
					break;

				case "result":
					this.callbacks.onMessage?.({
						type: "result",
						content: event.result || "",
						status: event.isError ? "error" : "completed",
					});
					break;
			}
		}

		return { shouldAbort: false };
	}

	/**
	 * 处理 stderr 消息
	 */
	private handleStderr(payload: AgentSdkEventPayload): void {
		if (payload.error) {
			this.callbacks.onMessage?.({
				type: "system",
				content: payload.error,
				status: "error",
			});
		}
	}

	/**
	 * 处理完成事件
	 */
	private handleDone(payload: AgentSdkEventPayload): void {
		const result = payload.result as any;
		const subtype = result?.subtype;
		const sdkErrors =
			Array.isArray(result?.errors) && result.errors.length > 0
				? result.errors.join("\n")
				: "";
		const resultText = typeof result?.result === "string" ? result.result : "";

		if (subtype === "success") {
			this.callbacks.onComplete?.({ success: true, summary: resultText });
		} else if (subtype === "cancelled") {
			this.callbacks.onComplete?.({ success: false, summary: "Cancelled" });
		} else {
			const errorMsg = sdkErrors || resultText || "Agent failed";
			this.callbacks.onComplete?.({ success: false, summary: errorMsg });
		}
	}

	/**
	 * 处理错误事件
	 */
	private handleError(payload: AgentSdkEventPayload): void {
		const errorMsg = payload.error || "Unknown error";
		this.callbacks.onError?.(errorMsg);
		this.callbacks.onComplete?.({ success: false, summary: errorMsg });
	}

	/**
	 * 从消息中提取文本内容
	 */
	private extractTextFromMessage(message: any): string {
		if (!message) return "";

		// stream_event
		if (message.type === "stream_event") {
			const delta = message.event?.delta;
			if (delta?.type === "text_delta" && delta.text) {
				return delta.text;
			}
			return "";
		}

		// assistant message
		if (message.type === "assistant" && message.message?.content) {
			const content = message.message.content;
			if (Array.isArray(content)) {
				return content
					.filter((b: any) => b?.type === "text")
					.map((b: any) => b.text || "")
					.join("");
			}
		}

		return "";
	}

	/**
	 * 获取状态跟踪器
	 */
	getStreamState(): AgentStreamState {
		return this.streamState;
	}

	/**
	 * 重置状态
	 */
	reset(): void {
		this.streamState.reset();
		this.toolUseErrorCount = 0;
		this.lastToolUseError = null;
		this.streamedVisibleText = "";
	}
}

/**
 * 创建事件处理器实例
 */
export function createEventHandler(): AgentEventHandler {
	return new AgentEventHandler();
}
