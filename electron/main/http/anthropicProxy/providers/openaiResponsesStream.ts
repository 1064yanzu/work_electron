import type { Response } from "express";
import type { Logger } from "../../../logging/types";
import {
	getOpenAIResponsesErrorMessage,
	getOpenAIResponsesItemText,
	getOpenAIResponsesStopReason,
	readOpenAIResponsesStream,
	translateResponsesToAnthropic,
	type OpenAIResponsesResponse,
} from "../openaiResponsesCompat";
import type { ThoughtSource } from "../thinkingCompat";
import type { AnthropicResponse } from "../types";
import {
	mergeStreamingFragment,
	mergeStreamingFragmentWithDelta,
	parseToolCallInput,
} from "./openaiShared";
import {
	emitAnthropicMessageContentBlocks,
	emitToolUseBlock,
	writeSseEvent,
} from "./sseOut";

type ResponsesTextBlockState = {
	key: string;
	index: number;
	text: string;
	stopped: boolean;
};

type ResponsesThoughtBlockState = {
	key: string;
	source: ThoughtSource;
	index: number;
	text: string;
	stopped: boolean;
};

type ResponsesToolCallState = {
	key: string;
	id?: string;
	name?: string;
	args: string;
	blockIndex: number | null;
	sentArgsLength: number;
	stopped: boolean;
};

export async function streamOpenAIResponsesToAnthropic(params: {
	upstreamBody: ReadableStream<Uint8Array> | null;
	upstreamContentType: string;
	readJsonFallback: () => Promise<unknown>;
	res: Response;
	messageId: string;
	model: string;
	estimatedInputTokens: number;
	logger?: Logger;
	requestId?: string;
}) {
	const {
		upstreamBody,
		upstreamContentType,
		readJsonFallback,
		res,
		messageId,
		model,
		estimatedInputTokens,
		logger,
		requestId,
	} = params;
	let messageStarted = false;
	let heartbeatTimer: NodeJS.Timeout | null = null;

	const sendMessageStart = () => {
		if (messageStarted || res.writableEnded) return;
		messageStarted = true;
		writeSseEvent(res, "message_start", {
			type: "message_start",
			message: {
				id: messageId,
				type: "message",
				role: "assistant",
				content: [],
				model,
				usage: { input_tokens: estimatedInputTokens, output_tokens: 0 },
			},
		});
	};

	const stopHeartbeat = () => {
		if (!heartbeatTimer) return;
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	};

	const startHeartbeat = () => {
		if (heartbeatTimer || res.writableEnded) return;
		heartbeatTimer = setInterval(() => {
			if (res.writableEnded) {
				stopHeartbeat();
				return;
			}
			writeSseEvent(res, "ping", { type: "ping" });
		}, 3000);
	};

	const finishWithError = (message: string) => {
		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: message || "Upstream stream error" },
		});
		stopHeartbeat();
		res.end();
	};

	sendMessageStart();
	startHeartbeat();
	// 客户端中途断开（页面切换 / 取消）时立即停止 heartbeat，避免向 ended socket 继续写 ping。
	res.once("close", stopHeartbeat);

	if (!upstreamBody) {
		finishWithError("No upstream body");
		return;
	}

	if (!upstreamContentType.includes("text/event-stream")) {
		let fallbackJson: unknown;
		try {
			fallbackJson = await readJsonFallback();
		} catch (error) {
			finishWithError(
				`Upstream did not return SSE and JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return;
		}
		const message = translateResponsesToAnthropic(
			messageId,
			model,
			fallbackJson,
		);
		emitAnthropicMessageContentBlocks(res, message.content, 0);
		writeSseEvent(res, "message_delta", {
			type: "message_delta",
			delta: { stop_reason: message.stop_reason },
			usage: { output_tokens: message.usage.output_tokens },
		});
		writeSseEvent(res, "message_stop", { type: "message_stop" });
		stopHeartbeat();
		res.end();
		return;
	}

	const doneErr = new Error("__OPENAI_RESPONSES_STREAM_DONE__");
	let nextBlockIndex = 0;
	let activeTextKey: string | null = null;
	let activeThoughtKey: string | null = null;
	const textStates = new Map<string, ResponsesTextBlockState>();
	const thoughtStates = new Map<string, ResponsesThoughtBlockState>();
	const toolCalls = new Map<string, ResponsesToolCallState>();
	let lastUsage: OpenAIResponsesResponse["usage"] | null = null;
	let finalResponse: OpenAIResponsesResponse | null = null;
	let pendingStopReason: AnthropicResponse["stop_reason"] | null = null;
	let finalized = false;

	const hasVisibleAssistantOutput = () =>
		[...textStates.values()].some((state) => Boolean(state.text)) ||
		[...thoughtStates.values()].some((state) => Boolean(state.text));

	const hasFlushableToolCalls = () =>
		[...toolCalls.values()].some(
			(state) =>
				typeof state.name === "string" &&
				state.name.trim().length > 0 &&
				(Boolean(state.args) || Boolean(state.id)),
		);

	const isRecoverableStreamTerminationError = (value: unknown) => {
		const message =
			value instanceof Error
				? value.message
				: typeof value === "string"
					? value
					: "";
		if (!message) return false;
		return /stream_read_error|stream closed|missing finish_reason|socket hang up|unexpected end|terminated/i.test(
			message,
		);
	};

	const stopTextBlockIfNeeded = (key = activeTextKey) => {
		if (!key) return;
		const state = textStates.get(key);
		if (!state || state.stopped) {
			if (activeTextKey === key) activeTextKey = null;
			return;
		}
		writeSseEvent(res, "content_block_stop", {
			type: "content_block_stop",
			index: state.index,
		});
		state.stopped = true;
		if (activeTextKey === key) activeTextKey = null;
	};

	const stopThoughtBlockIfNeeded = (key = activeThoughtKey) => {
		if (!key) return;
		const state = thoughtStates.get(key);
		if (!state || state.stopped) {
			if (activeThoughtKey === key) activeThoughtKey = null;
			return;
		}
		writeSseEvent(res, "content_block_stop", {
			type: "content_block_stop",
			index: state.index,
		});
		state.stopped = true;
		if (activeThoughtKey === key) activeThoughtKey = null;
	};

	const stopAllToolCallBlocksIfNeeded = () => {
		for (const state of toolCalls.values()) {
			if (state.stopped || state.blockIndex === null) continue;
			writeSseEvent(res, "content_block_stop", {
				type: "content_block_stop",
				index: state.blockIndex,
			});
			state.stopped = true;
		}
	};

	const emitTextDelta = (key: string, incoming: string) => {
		if (!incoming) return;
		stopThoughtBlockIfNeeded();
		if (activeTextKey && activeTextKey !== key) {
			stopTextBlockIfNeeded(activeTextKey);
		}
		let state = textStates.get(key);
		if (!state) {
			state = { key, index: nextBlockIndex++, text: "", stopped: false };
			textStates.set(key, state);
		}
		if (state.stopped) return;
		if (activeTextKey !== key) {
			activeTextKey = key;
			writeSseEvent(res, "content_block_start", {
				type: "content_block_start",
				index: state.index,
				content_block: { type: "text", text: "" },
			});
		}
		const merged = mergeStreamingFragmentWithDelta(state.text, incoming);
		if (!merged.delta) return;
		state.text = merged.next;
		writeSseEvent(res, "content_block_delta", {
			type: "content_block_delta",
			index: state.index,
			delta: { type: "text_delta", text: merged.delta },
		});
	};

	const emitThoughtDelta = (
		key: string,
		source: ThoughtSource,
		incoming: string,
	) => {
		if (!incoming) return;
		stopTextBlockIfNeeded();
		if (activeThoughtKey && activeThoughtKey !== key) {
			stopThoughtBlockIfNeeded(activeThoughtKey);
		}
		let state = thoughtStates.get(key);
		if (!state) {
			state = {
				key,
				source,
				index: nextBlockIndex++,
				text: "",
				stopped: false,
			};
			thoughtStates.set(key, state);
		}
		if (state.stopped) return;
		if (activeThoughtKey !== key) {
			activeThoughtKey = key;
			writeSseEvent(res, "content_block_start", {
				type: "content_block_start",
				index: state.index,
				content_block: { type: source, text: "" },
			});
		}
		const merged = mergeStreamingFragmentWithDelta(state.text, incoming);
		if (!merged.delta) return;
		state.text = merged.next;
		writeSseEvent(res, "content_block_delta", {
			type: "content_block_delta",
			index: state.index,
			delta: {
				type: "thinking_delta",
				thinking: merged.delta,
			},
		});
	};

	const getToolState = (key: string) => {
		let state = toolCalls.get(key);
		if (!state) {
			state = {
				key,
				args: "",
				blockIndex: null,
				sentArgsLength: 0,
				stopped: false,
			};
			toolCalls.set(key, state);
		}
		return state;
	};

	/**
	 * 统一的工具调用 key 派生函数。
	 * 确保 output_item.added / function_call_arguments.delta / done 等事件
	 * 对同一个工具调用产生相同的 key，避免创建重复的 state 导致名称丢失。
	 *
	 * 优先级：event.item_id → item.id → 通过 output_index 查找已知 key → idx_N → tool_N
	 * 注意：item.call_id 不能用于 key（它和 event.item_id 是不同的标识符）
	 */
	const outputIndexToToolKey = new Map<number, string>();

	const deriveToolCallKey = (
		event: any,
		item?: Record<string, unknown> | null,
	): string => {
		if (typeof event.item_id === "string" && event.item_id) {
			// 同时注册到 output_index 辅助索引
			if (typeof event.output_index === "number") {
				outputIndexToToolKey.set(event.output_index, event.item_id);
			}
			return event.item_id;
		}
		if (item && typeof item.id === "string" && item.id) {
			if (typeof event.output_index === "number") {
				outputIndexToToolKey.set(event.output_index, item.id);
			}
			return item.id;
		}
		// 通过 output_index 查找已知的 key（处理 item_id 在某些事件中缺失的情况）
		if (typeof event.output_index === "number") {
			const existing = outputIndexToToolKey.get(event.output_index);
			if (existing) return existing;
			const fallback = `idx_${event.output_index}`;
			outputIndexToToolKey.set(event.output_index, fallback);
			return fallback;
		}
		return `tool_${toolCalls.size}`;
	};

	const hydrateToolCallFromItem = (
		item: Record<string, unknown>,
		keyHint?: string,
	) => {
		// key 派生优先级与 deriveToolCallKey 一致：item.id 优先于 item.call_id
		// 因为 function_call_arguments.delta 事件中 event.item_id 对应的是 item.id
		const key =
			keyHint ||
			(typeof item.id === "string" && item.id) ||
			(typeof item.call_id === "string" && item.call_id) ||
			`tool_${toolCalls.size}`;
		const state = getToolState(String(key));
		if (typeof item.call_id === "string" && item.call_id)
			state.id = item.call_id;
		else if (typeof item.id === "string" && item.id) state.id = item.id;
		if (typeof item.name === "string" && item.name) state.name = item.name;
		if (typeof item.arguments === "string" && item.arguments) {
			state.args = mergeStreamingFragment(state.args, item.arguments);
		}
		// 【关键修复】只积累状态，不实时 emit，等 finalize 时一次性发送
	};

	const hydrateMessageItem = (
		item: Record<string, unknown>,
		baseKey: string,
	) => {
		const itemText = getOpenAIResponsesItemText(item as any);
		if (itemText) {
			emitTextDelta(`${baseKey}:text:0`, itemText);
		}
		const content = Array.isArray(item.content) ? item.content : [];
		content.forEach((part, partIndex) => {
			if (!part || typeof part !== "object") return;
			const record = part as Record<string, unknown>;
			const partType = typeof record.type === "string" ? record.type : "";
			const partText =
				(typeof record.text === "string" && record.text) ||
				(typeof record.content === "string" && record.content) ||
				"";
			if (!partText) return;
			if (partType.includes("reasoning") || partType.includes("thinking")) {
				emitThoughtDelta(
					`${baseKey}:thought:${partIndex}`,
					partType.includes("reasoning") ? "reasoning" : "thinking",
					partText,
				);
				return;
			}
			emitTextDelta(`${baseKey}:text:${partIndex}`, partText);
		});
	};

	const finalize = () => {
		if (finalized || res.writableEnded) return;
		finalized = true;
		stopHeartbeat();
		stopTextBlockIfNeeded();
		stopThoughtBlockIfNeeded();

		// 强制刷出所有延迟创建的 tool call blocks
		// 【关键修复】使用 emitToolUseBlock 一次性发送完整 JSON，
		// 避免 SDK 的 input_json_delta 流式拼装器在超大输入时解析为 {} 的 bug。
		for (const state of toolCalls.values()) {
			if (state.blockIndex !== null) continue;
			if (!state.args && !state.name && !state.id) continue;
			// 跳过无名工具调用（避免产生 unknown_tool 错误导致 SDK 报错）
			const toolName = typeof state.name === "string" ? state.name.trim() : "";
			if (!toolName) continue;
			stopTextBlockIfNeeded();
			stopThoughtBlockIfNeeded();
			// 解析并清洗参数；Write 的大内容在部分 OpenAI 兼容网关会返回非严格 JSON，
			// 这里做有限修复，避免直接降级成 {} 触发 SDK 必填参数错误。
			const parsed = parseToolCallInput(toolName, state.args || "{}");
			const parsedInput = parsed.input;
			if (parsed.error) {
				console.warn(
					parsed.repaired
						? `[proxy] Repaired malformed tool_call args for ${toolName} (len=${state.args.length})`
						: `[proxy] Failed to parse tool_call args for ${toolName} (len=${state.args.length}), falling back to {}`,
				);
			}
			state.blockIndex = nextBlockIndex;
			emitToolUseBlock(res, {
				index: nextBlockIndex++,
				id: state.id || `toolu_${crypto.randomUUID().replace(/-/g, "")}`,
				name: toolName,
				input: parsedInput,
			});
			state.stopped = true;
			state.sentArgsLength = state.args.length;
		}

		stopAllToolCallBlocksIfNeeded();
		const stopReason =
			pendingStopReason ||
			getOpenAIResponsesStopReason(finalResponse, toolCalls.size > 0);
		const completionTokens =
			typeof lastUsage?.output_tokens === "number"
				? lastUsage.output_tokens
				: 0;
		writeSseEvent(res, "message_delta", {
			type: "message_delta",
			delta: { stop_reason: stopReason },
			usage: { output_tokens: completionTokens },
		});
		writeSseEvent(res, "message_stop", { type: "message_stop" });
		res.end();
	};

	let streamError: unknown = null;
	try {
		await readOpenAIResponsesStream(upstreamBody, async (event) => {
			if (res.writableEnded) throw doneErr;
			const eventType = typeof event.type === "string" ? event.type : "";
			if (event.response?.usage) lastUsage = event.response.usage;
			if (event.response) finalResponse = event.response;

			if (eventType === "error" || eventType === "response.failed") {
				throw new Error(getOpenAIResponsesErrorMessage(event));
			}

			if (eventType === "response.output_text.delta") {
				const key = `text:${event.item_id || event.output_index || 0}:${event.content_index || 0}`;
				emitTextDelta(key, typeof event.delta === "string" ? event.delta : "");
				return;
			}

			if (eventType === "response.output_text.done") {
				const key = `text:${event.item_id || event.output_index || 0}:${event.content_index || 0}`;
				emitTextDelta(
					key,
					typeof event.text === "string"
						? event.text
						: typeof event.delta === "string"
							? event.delta
							: "",
				);
				return;
			}

			if (eventType.includes("reasoning") || eventType.includes("thinking")) {
				const source: ThoughtSource = eventType.includes("reasoning")
					? "reasoning"
					: "thinking";
				const key = `${source}:${event.item_id || event.output_index || 0}:${event.content_index || 0}`;
				const text =
					typeof event.delta === "string"
						? event.delta
						: typeof event.text === "string"
							? event.text
							: "";
				emitThoughtDelta(key, source, text);
				return;
			}

			if (
				eventType === "response.content_part.added" ||
				eventType === "response.content_part.done"
			) {
				const part =
					event.part && typeof event.part === "object" ? event.part : null;
				if (!part) return;
				const partType = typeof part.type === "string" ? part.type : "";
				const partText =
					(typeof part.text === "string" && part.text) ||
					(typeof part.content === "string" && part.content) ||
					"";
				if (!partText) return;
				if (partType.includes("reasoning") || partType.includes("thinking")) {
					emitThoughtDelta(
						`${partType}:${event.item_id || event.output_index || 0}:${event.content_index || 0}`,
						partType.includes("reasoning") ? "reasoning" : "thinking",
						partText,
					);
					return;
				}
				emitTextDelta(
					`text:${event.item_id || event.output_index || 0}:${event.content_index || 0}`,
					partText,
				);
				return;
			}

			if (eventType === "response.function_call_arguments.delta") {
				const key = deriveToolCallKey(event);
				const state = getToolState(key);
				if (typeof event.delta === "string" && event.delta) {
					state.args = mergeStreamingFragment(state.args, event.delta);
				}
				// 【关键修复】只积累 args，不实时 emit，等 finalize 时一次性发送
				return;
			}

			if (eventType === "response.function_call_arguments.done") {
				const key = deriveToolCallKey(event);
				const state = getToolState(key);
				const finalArgs =
					typeof event.delta === "string"
						? event.delta
						: typeof event.text === "string"
							? event.text
							: "";
				if (finalArgs) {
					state.args = mergeStreamingFragment(state.args, finalArgs);
				}
				// 【关键修复】只积累 args，不实时 emit，等 finalize 时一次性发送
				return;
			}

			if (
				eventType === "response.output_item.added" ||
				eventType === "response.output_item.done"
			) {
				const item =
					event.item && typeof event.item === "object" ? event.item : null;
				if (!item) return;
				const itemType = typeof item.type === "string" ? item.type : "";
				const itemKey = deriveToolCallKey(event, item);
				if (itemType === "function_call") {
					hydrateToolCallFromItem(item, itemKey);
					return;
				}
				if (
					itemType === "message" ||
					itemType === "output_text" ||
					itemType === "text"
				) {
					hydrateMessageItem(item, itemKey);
				}
				return;
			}

			if (
				eventType === "response.completed" ||
				eventType === "response.incomplete" ||
				eventType === "response.done"
			) {
				if (finalResponse?.output) {
					finalResponse.output.forEach((item, index) => {
						if (!item || typeof item !== "object") return;
						const key = String(
							item.id || item.call_id || `final_item_${index}`,
						);
						if (item.type === "function_call") {
							hydrateToolCallFromItem(item as any, key);
							return;
						}
						if (
							item.type === "message" ||
							item.type === "output_text" ||
							item.type === "text"
						) {
							hydrateMessageItem(item as any, key);
						}
					});
				}
				pendingStopReason = getOpenAIResponsesStopReason(
					finalResponse,
					toolCalls.size > 0,
				);
				finalize();
				throw doneErr;
			}
		});
	} catch (error) {
		if (error !== doneErr) streamError = error;
	}

	if (streamError) {
		if (
			isRecoverableStreamTerminationError(streamError) &&
			(hasVisibleAssistantOutput() || hasFlushableToolCalls())
		) {
			logger?.warn({
				msg: "anthropic proxy: recovering responses stream after partial termination",
				requestId,
				model,
				error:
					streamError instanceof Error
						? streamError.message
						: String(streamError),
				hasVisibleAssistantOutput: hasVisibleAssistantOutput(),
				hasFlushableToolCalls: hasFlushableToolCalls(),
			});
			if (!pendingStopReason) {
				pendingStopReason = hasFlushableToolCalls() ? "tool_use" : "end_turn";
			}
			finalize();
			return;
		}
		finishWithError(
			streamError instanceof Error ? streamError.message : String(streamError),
		);
		return;
	}

	finalize();
}
