import type { Response } from "express";
import type { Logger } from "../../../logging/types";
import { humanizeUpstreamError } from "../../../llm/protocol/errors";
import { readSseStream } from "../../../llm/protocol/sse";
import { loggedFetch } from "../../utils/loggedFetch";
import { translateToAnthropic } from "../openaiCompat";
import {
	extractThoughtFragmentsFromOpenAIChunk,
	ThoughtDeltaNormalizer,
	type ThoughtSource,
} from "../thinkingCompat";
import { estimateAnthropicInputTokens } from "../tokenEstimation";
import type {
	AnthropicRequest,
	OpenAIChatMessage,
	OpenAIResponse,
	ProviderConfig,
} from "../types";
import {
	applyOpenAIChatReasoningControls,
	flattenToolHistoryForOpenAICompatible,
	isInvalidArgumentError,
	isReasoningControlInvalidArgument,
	mergeStreamingFragment,
	parseToolCallInput,
} from "./openaiShared";
import {
	emitAnthropicMessageContentBlocks,
	emitToolUseBlock,
	writeSseEvent,
} from "./sseOut";
import type { OpenAIChatCompletionRequest, ProviderCallOptions } from "./types";

type OpenAIChatStreamParams = {
	provider: ProviderConfig;
	model: string;
	anthropicReq: AnthropicRequest;
	openaiMessages: OpenAIChatMessage[];
	openaiTools: any[] | undefined;
	baseUrl: string;
	headers: Record<string, string>;
	messageId: string;
	res: Response;
	logger?: Logger;
	requestId?: string;
	conversationId?: string;
	callOptions?: ProviderCallOptions;
};

/**
 * OpenAI chat/completions 模板（流式）：把上游 OpenAI SSE 翻译为 Anthropic SSE。
 * 含 invalid argument 的一次性非流式扁平化重试与部分终止恢复。
 */
export async function streamOpenAIChatTemplate(
	params: OpenAIChatStreamParams,
): Promise<void> {
	const {
		model,
		anthropicReq,
		openaiMessages,
		openaiTools,
		baseUrl,
		headers,
		messageId,
		res,
		logger,
		requestId,
		conversationId,
		callOptions,
	} = params;

	const openaiReq: OpenAIChatCompletionRequest = {
		model,
		messages: openaiMessages,
		temperature: anthropicReq.temperature ?? 0.7,
		max_tokens: anthropicReq.max_tokens ?? 4096,
		tools: openaiTools,
		tool_choice: openaiTools?.length ? "auto" : undefined,
		stream: true,
	};
	applyOpenAIChatReasoningControls(openaiReq, callOptions?.thinkingLevel);

	logger?.info({
		msg: "anthropic proxy: streaming via openai-compatible provider",
		model,
		messageCount: openaiMessages.length,
		hasTools: !!openaiReq.tools,
		toolCount: openaiReq.tools?.length || 0,
	});

	// 尽早发送 message_start，避免上游首包较慢时客户端误判为“无流式输出”并触发补偿请求。
	const estimatedInputTokens = estimateAnthropicInputTokens(anthropicReq);
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

	sendMessageStart();
	startHeartbeat();
	// 客户端中途断开时立即停止 heartbeat，避免向 ended socket 写 ping。
	res.once("close", stopHeartbeat);

	const upstream = await loggedFetch(
		`${baseUrl}/chat/completions`,
		{
			method: "POST",
			headers,
			body: JSON.stringify(openaiReq),
		},
		{
			logger,
			requestId,
			conversationId,
			service: "anthropic-proxy:upstream-stream",
			readResponseBody: false,
		},
	);

	if (!upstream.ok) {
		const errorText = await upstream.text();
		const shouldRetryInvalidArgument =
			upstream.status === 400 && isInvalidArgumentError(errorText);
		if (shouldRetryInvalidArgument) {
			logger?.warn({
				msg: "anthropic proxy: openai stream returned retryable invalid argument",
				status: upstream.status,
				error: errorText,
			});
		} else {
			logger?.error({
				msg: "anthropic proxy: openai stream error",
				status: upstream.status,
				error: errorText,
			});
		}

		// One-shot retry for strict gateways: flatten tool history and fall back to non-stream JSON.
		if (shouldRetryInvalidArgument) {
			const dropReasoningControls =
				isReasoningControlInvalidArgument(errorText);
			const retryReq = {
				...openaiReq,
				messages: flattenToolHistoryForOpenAICompatible(openaiReq.messages),
				tool_choice: undefined,
				stream: false,
				reasoning_effort: dropReasoningControls
					? undefined
					: openaiReq.reasoning_effort,
				extra_body: dropReasoningControls ? undefined : openaiReq.extra_body,
				thinking: dropReasoningControls ? undefined : openaiReq.thinking,
			};
			logger?.warn({
				msg: "anthropic proxy: retrying openai stream request as non-stream with flattened tool history",
				status: upstream.status,
				model,
				origMessages: openaiReq.messages.length,
				retryMessages: retryReq.messages.length,
			});

			const retryUpstream = await loggedFetch(
				`${baseUrl}/chat/completions`,
				{
					method: "POST",
					headers,
					body: JSON.stringify(retryReq),
				},
				{
					logger,
					requestId,
					conversationId,
					service: "anthropic-proxy:upstream-stream",
					readResponseBody: false,
				},
			);

			if (retryUpstream.ok) {
				let openaiResp: OpenAIResponse | null = null;
				try {
					openaiResp = (await retryUpstream.json()) as OpenAIResponse;
				} catch (e) {
					writeSseEvent(res, "error", {
						type: "error",
						error: {
							type: "api_error",
							message: `Retry upstream JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
						},
					});
					stopHeartbeat();
					res.end();
					return;
				}

				const message = translateToAnthropic(messageId, model, openaiResp);
				sendMessageStart();

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
		}

		writeSseEvent(res, "error", {
			type: "error",
			error: humanizeUpstreamError(upstream.status, errorText),
		});
		stopHeartbeat();
		res.end();
		return;
	}
	if (!upstream.body) {
		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: "No upstream body" },
		});
		stopHeartbeat();
		res.end();
		return;
	}

	const contentType = String(upstream.headers.get("content-type") || "");
	if (!contentType.includes("text/event-stream")) {
		// Provider doesn't actually stream; fallback to non-stream and emit a single delta.
		let openaiResp: OpenAIResponse | null = null;
		try {
			openaiResp = (await upstream.json()) as OpenAIResponse;
		} catch (e) {
			writeSseEvent(res, "error", {
				type: "error",
				error: {
					type: "api_error",
					message: `Upstream did not return SSE and JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
				},
			});
			stopHeartbeat();
			res.end();
			return;
		}

		const message = translateToAnthropic(messageId, model, openaiResp);
		sendMessageStart();

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

	const doneErr = new Error("__OPENAI_STREAM_DONE__");
	let nextBlockIndex = 0;
	let textBlockIndex: number | null = null;
	let thoughtBlockIndex: number | null = null;
	type StreamingToolCallState = {
		id?: string;
		name?: string;
		args: string;
		blockIndex: number | null;
		sentArgsLength: number;
		stopped: boolean;
	};
	let toolCalls = new Map<number, StreamingToolCallState>();
	const thoughtDeltaNormalizer = new ThoughtDeltaNormalizer();
	let pendingStopReason: "end_turn" | "tool_use" | "max_tokens" | null = null;
	let lastUsage: any = null;
	let finalized = false;
	let sawDoneSentinel = false;
	let sawExplicitFinishReason = false;
	let sawAssistantDelta = false;

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

	const stopTextBlockIfNeeded = () => {
		if (textBlockIndex === null) return;
		writeSseEvent(res, "content_block_stop", {
			type: "content_block_stop",
			index: textBlockIndex,
		});
		textBlockIndex = null;
	};

	const stopThoughtBlockIfNeeded = () => {
		if (thoughtBlockIndex === null) return;
		writeSseEvent(res, "content_block_stop", {
			type: "content_block_stop",
			index: thoughtBlockIndex,
		});
		thoughtBlockIndex = null;
	};

	const ensureThoughtBlock = (_source: ThoughtSource) => {
		if (thoughtBlockIndex !== null) {
			return thoughtBlockIndex;
		}
		stopThoughtBlockIfNeeded();
		thoughtBlockIndex = nextBlockIndex++;
		writeSseEvent(res, "content_block_start", {
			type: "content_block_start",
			index: thoughtBlockIndex,
			content_block: {
				type: "thinking",
				text: "",
			},
		});
		return thoughtBlockIndex;
	};

	const emitToolCallArgsIfNeeded = (state: StreamingToolCallState) => {
		if (state.blockIndex === null) return;
		const deltaArgs = state.args.slice(state.sentArgsLength);
		if (!deltaArgs) return;
		writeSseEvent(res, "content_block_delta", {
			type: "content_block_delta",
			index: state.blockIndex,
			delta: {
				type: "input_json_delta",
				partial_json: deltaArgs,
			},
		});
		state.sentArgsLength = state.args.length;
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

	const flushToolCallsAsToolUse = () => {
		if (toolCalls.size === 0) return false;
		stopTextBlockIfNeeded();
		stopThoughtBlockIfNeeded();
		const sorted = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
		let flushed = false;
		for (const [_idx, state] of sorted) {
			// 跳过无名工具调用
			const toolName = typeof state.name === "string" ? state.name.trim() : "";
			if (!toolName) continue;
			// 【关键修复】使用 emitToolUseBlock 一次性发送完整 JSON，
			// 而不是通过 startToolCallBlockIfNeeded + emitToolCallArgsIfNeeded
			// 的流式路径。SDK 的 input_json_delta 流式拼装器在处理超大输入时
			// 有 bug（input 被解析为 {}），一次性发送可绕过该问题。
			if (state.blockIndex === null) {
				// 还没有发送过 block，用完整 JSON 一次性发
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
			} else {
				// 已经发送过 block（不应发生，兜底处理）
				emitToolCallArgsIfNeeded(state);
			}
			flushed = true;
		}
		// 停止所有已开启但未关闭的 blocks（兜底）
		stopAllToolCallBlocksIfNeeded();
		return flushed;
	};

	const finalize = () => {
		if (finalized || res.writableEnded) return;
		finalized = true;
		stopHeartbeat();

		stopTextBlockIfNeeded();
		stopThoughtBlockIfNeeded();
		stopAllToolCallBlocksIfNeeded();
		const stopReason =
			pendingStopReason || (toolCalls.size > 0 ? "tool_use" : "end_turn");

		const usageAny = lastUsage as any;
		const completionTokens =
			typeof usageAny?.completion_tokens === "number"
				? usageAny.completion_tokens
				: typeof usageAny?.output_tokens === "number"
					? usageAny.output_tokens
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
		await readSseStream(upstream.body, async (data) => {
			if (res.writableEnded) throw doneErr;
			if (data === "[DONE]") {
				sawDoneSentinel = true;
				finalize();
				throw doneErr;
			}
			let parsed: any = null;
			try {
				parsed = JSON.parse(data);
			} catch {
				return;
			}
			if (parsed?.usage) lastUsage = parsed.usage;

			const choice = parsed?.choices?.[0];
			const delta = choice?.delta || {};
			const finishReason = choice?.finish_reason as string | null | undefined;
			const thoughtDeltas = thoughtDeltaNormalizer.consume(
				extractThoughtFragmentsFromOpenAIChunk(parsed),
			);

			if (thoughtDeltas.length > 0) {
				sawAssistantDelta = true;
				stopTextBlockIfNeeded();
				for (const fragment of thoughtDeltas) {
					if (!fragment.text) continue;
					const thoughtIndex = ensureThoughtBlock(fragment.source);
					writeSseEvent(res, "content_block_delta", {
						type: "content_block_delta",
						index: thoughtIndex,
						delta: {
							type: "thinking_delta",
							thinking: fragment.text,
						},
					});
				}
			}

			if (typeof delta?.content === "string" && delta.content.length > 0) {
				sawAssistantDelta = true;
				stopThoughtBlockIfNeeded();
				if (textBlockIndex === null) {
					textBlockIndex = nextBlockIndex++;
					writeSseEvent(res, "content_block_start", {
						type: "content_block_start",
						index: textBlockIndex,
						content_block: { type: "text", text: "" },
					});
				}
				writeSseEvent(res, "content_block_delta", {
					type: "content_block_delta",
					index: textBlockIndex,
					delta: { type: "text_delta", text: delta.content },
				});
			}

			if (Array.isArray(delta?.tool_calls)) {
				if (delta.tool_calls.length > 0) sawAssistantDelta = true;
				for (const tc of delta.tool_calls) {
					const idx = typeof tc?.index === "number" ? tc.index : 0;
					const existing = toolCalls.get(idx) || {
						args: "",
						blockIndex: null,
						sentArgsLength: 0,
						stopped: false,
					};
					if (typeof tc?.id === "string" && tc.id) existing.id = tc.id;
					if (typeof tc?.function?.name === "string" && tc.function.name)
						existing.name = tc.function.name;
					if (
						typeof tc?.function?.arguments === "string" &&
						tc.function.arguments
					) {
						existing.args = mergeStreamingFragment(
							existing.args,
							tc.function.arguments,
						);
					}
					// 【关键修复】不在流式过程中实时发送 input_json_delta，
					// 只累积 args，等 finish_reason 时由 flushToolCallsAsToolUse
					// 用完整 JSON 一次性发送。
					// 原因：SDK 的流式 JSON 拼装器在处理超大输入（如 1MB+ HTML）
					// 时存在 bug，会将 input 解析为 {}，触发 InputValidationError。
					toolCalls.set(idx, existing);
				}
			}

			if (!finishReason) return;
			sawExplicitFinishReason = true;

			// 【调试】打印 finishReason 值，帮助定位 error_during_execution 问题
			logger?.info({
				msg: "anthropic proxy: stream finish_reason received",
				requestId,
				finishReason,
				hasToolCalls: toolCalls.size > 0,
			});

			if (finishReason === "tool_calls") {
				flushToolCallsAsToolUse();
				pendingStopReason = "tool_use";
				return;
			}

			if (finishReason === "stop" || finishReason === "length") {
				stopTextBlockIfNeeded();
				stopThoughtBlockIfNeeded();

				// 某些网关会在有工具调用时仍返回 stop，这里按实际内容兜底为 tool_use。
				if (toolCalls.size > 0) {
					if (flushToolCallsAsToolUse()) {
						pendingStopReason = "tool_use";
					}
					return;
				}

				pendingStopReason =
					finishReason === "length" ? "max_tokens" : "end_turn";
				return;
			}
		});
	} catch (e) {
		if (e !== doneErr) streamError = e;
	}

	if (!streamError && !sawDoneSentinel && !sawExplicitFinishReason) {
		logger?.warn({
			msg: "anthropic proxy: upstream stream ended without explicit completion",
			requestId,
			model,
			sawAssistantDelta,
			toolCallCount: toolCalls.size,
			hasUsage: !!lastUsage,
		});
		if (sawAssistantDelta || hasFlushableToolCalls()) {
			pendingStopReason = hasFlushableToolCalls() ? "tool_use" : "end_turn";
			finalize();
			return;
		}
		streamError = new Error(
			"Upstream stream closed before completion (missing finish_reason/[DONE])",
		);
	}

	if (streamError) {
		if (
			isRecoverableStreamTerminationError(streamError) &&
			(sawAssistantDelta || hasFlushableToolCalls())
		) {
			logger?.warn({
				msg: "anthropic proxy: recovering chat-completions stream after partial termination",
				requestId,
				model,
				error:
					streamError instanceof Error
						? streamError.message
						: String(streamError),
				sawAssistantDelta,
				hasFlushableToolCalls: hasFlushableToolCalls(),
			});
			if (!pendingStopReason) {
				pendingStopReason = hasFlushableToolCalls() ? "tool_use" : "end_turn";
			}
			finalize();
			return;
		}
		const msg =
			streamError instanceof Error ? streamError.message : String(streamError);
		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: msg || "Upstream stream error" },
		});
		stopHeartbeat();
		res.end();
		return;
	}

	finalize();
}
