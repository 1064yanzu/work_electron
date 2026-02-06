import type { Response } from "express";
import { Readable } from "node:stream";
import type { Logger } from "../../logging/types";
import {
	getOpenAICompatibleAuthHeaders,
	normalizeAnthropicBaseUrl,
	normalizeOpenAICompatibleBaseUrl,
} from "../../llm/providerHttp";
import { loggedFetch } from "../utils/loggedFetch";
import { estimateAnthropicInputTokens } from "./tokenEstimation";
import {
	readOpenAIChatCompletionsStreamAsJson,
	translateToAnthropic,
	translateToOpenAI,
} from "./openaiCompat";
import type {
	AnthropicRequest,
	AnthropicResponse,
	OpenAIResponse,
	OpenAIChatMessage,
	ProviderConfig,
} from "./types";

const OPENAI_COMPAT_TOOL_NAME_MAX_LEN = 64;
const OPENAI_COMPAT_TOOL_DESC_MAX_LEN = 1024;
const OPENAI_COMPAT_SCHEMA_MAX_DEPTH = 10;
const OPENAI_COMPAT_SCHEMA_MAX_KEYS_PER_OBJECT = 200;
const OPENAI_COMPAT_SCHEMA_MAX_ARRAY_ITEMS = 200;
const OPENAI_COMPAT_SCHEMA_STR_MAX_LEN = 512;

function sanitizeOpenAICompatibleToolName(name: unknown): string {
	const raw = typeof name === "string" ? name : "";
	const trimmed = raw.trim();
	const safe = trimmed.replace(/[^A-Za-z0-9_-]/g, "_");
	const clipped = safe.slice(0, OPENAI_COMPAT_TOOL_NAME_MAX_LEN);
	return clipped || "Tool";
}

function sanitizeOpenAICompatibleToolDescription(
	desc: unknown,
): string | undefined {
	if (typeof desc !== "string") return undefined;
	const trimmed = desc.trim();
	if (!trimmed) return undefined;
	return trimmed.length > OPENAI_COMPAT_TOOL_DESC_MAX_LEN
		? `${trimmed.slice(0, OPENAI_COMPAT_TOOL_DESC_MAX_LEN - 1)}…`
		: trimmed;
}

function sanitizeOpenAICompatibleJsonSchema(
	value: unknown,
	opts?: { depth?: number },
): unknown {
	const depth = opts?.depth ?? 0;
	if (depth > OPENAI_COMPAT_SCHEMA_MAX_DEPTH) return undefined;

	if (typeof value === "string") {
		return value.length > OPENAI_COMPAT_SCHEMA_STR_MAX_LEN
			? `${value.slice(0, OPENAI_COMPAT_SCHEMA_STR_MAX_LEN - 1)}…`
			: value;
	}
	if (typeof value === "number" || typeof value === "boolean" || value == null)
		return value;

	if (Array.isArray(value)) {
		return value
			.slice(0, OPENAI_COMPAT_SCHEMA_MAX_ARRAY_ITEMS)
			.map((v) => sanitizeOpenAICompatibleJsonSchema(v, { depth: depth + 1 }))
			.filter((v) => v !== undefined);
	}

	if (typeof value !== "object") return undefined;

	// Drop meta keys that frequently break OpenAI-compatible providers.
	const blockedKeys = new Set([
		"$schema",
		"$id",
		"id",
		"$ref",
		"$defs",
		"definitions",
	]);

	// Keep a conservative subset of JSON Schema keywords (still expressive enough for tools).
	const allowedKeys = new Set([
		"type",
		"properties",
		"required",
		"additionalProperties",
		"items",
		"enum",
		"const",
		"anyOf",
		"oneOf",
		"allOf",
		"minimum",
		"maximum",
		"minLength",
		"maxLength",
		"minItems",
		"maxItems",
		"pattern",
		"format",
		"default",
		"description",
		"title",
	]);

	const entries = Object.entries(value as Record<string, unknown>).slice(
		0,
		OPENAI_COMPAT_SCHEMA_MAX_KEYS_PER_OBJECT,
	);
	const out: Record<string, unknown> = {};

	for (const [k, v] of entries) {
		if (blockedKeys.has(k)) continue;
		if (!allowedKeys.has(k)) continue;

		if (k === "required") {
			if (Array.isArray(v)) {
				out.required = v
					.map((x) => (typeof x === "string" ? x : null))
					.filter(Boolean);
			}
			continue;
		}

		if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
			const props: Record<string, unknown> = {};
			for (const [pk, pv] of Object.entries(v as Record<string, unknown>).slice(
				0,
				OPENAI_COMPAT_SCHEMA_MAX_KEYS_PER_OBJECT,
			)) {
				props[pk] = sanitizeOpenAICompatibleJsonSchema(pv, {
					depth: depth + 1,
				});
			}
			out.properties = props;
			continue;
		}

		out[k] = sanitizeOpenAICompatibleJsonSchema(v, { depth: depth + 1 });
	}

	return out;
}

function toOpenAICompatibleTools(
	anthropicReq: AnthropicRequest,
): any[] | undefined {
	if (!anthropicReq.tools?.length) return undefined;

	return anthropicReq.tools.map((t) => {
		const inputSchema =
			t.input_schema ||
			({
				type: "object",
				properties: {},
				additionalProperties: true,
			} as const);

		const sanitized = sanitizeOpenAICompatibleJsonSchema(inputSchema) as any;
		const validatedSchema = {
			type: "object",
			...(sanitized && typeof sanitized === "object" ? sanitized : {}),
			// Ensure properties exists (some providers require it).
			properties:
				sanitized &&
				typeof sanitized === "object" &&
				(sanitized as any).properties &&
				typeof (sanitized as any).properties === "object" &&
				!Array.isArray((sanitized as any).properties)
					? (sanitized as any).properties
					: {},
		};

		return {
			type: "function" as const,
			function: {
				name: sanitizeOpenAICompatibleToolName(t.name),
				description: sanitizeOpenAICompatibleToolDescription(t.description),
				parameters: validatedSchema,
			},
		};
	});
}

function isInvalidArgumentError(bodyText: string): boolean {
	const t = String(bodyText || "");
	return (
		/\bINVALID_ARGUMENT\b/i.test(t) ||
		/\binvalid argument\b/i.test(t) ||
		/"code"\s*:\s*400/i.test(t)
	);
}

/**
 * Some OpenAI-compatible providers (notably Gemini-style gateways) reject chat histories that
 * include prior tool_calls + role=tool messages. As a compatibility fallback, we flatten tool
 * execution back into plain user text while keeping tools enabled for future calls.
 */
function flattenToolHistoryForOpenAICompatible(
	messages: OpenAIChatMessage[],
): OpenAIChatMessage[] {
	const out: OpenAIChatMessage[] = [];
	const toolCallIdToName = new Map<string, string>();

	for (const m of messages) {
		if (!m || typeof m !== "object") continue;

		// Track tool call ids -> names from assistant messages.
		if (m.role === "assistant" && Array.isArray((m as any).tool_calls)) {
			for (const tc of (m as any).tool_calls) {
				const id = typeof tc?.id === "string" ? tc.id : "";
				const name =
					typeof tc?.function?.name === "string" ? tc.function.name : "";
				if (id && name) toolCallIdToName.set(id, name);
			}
			// Drop assistant tool_calls message from history to avoid invalid argument.
			// We'll rely on the subsequent tool result (flattened) to convey information.
			continue;
		}

		if (m.role === "tool") {
			const toolCallId = (m as any).tool_call_id
				? String((m as any).tool_call_id)
				: "";
			const toolName = toolCallIdToName.get(toolCallId) || "Tool";
			const content =
				typeof (m as any).content === "string" ? (m as any).content : "";
			out.push({
				role: "user",
				content: `Tool result (${toolName}):\n${content}`.trim(),
			});
			continue;
		}

		// Keep system/user/assistant text messages as-is.
		out.push(m);
	}

	return out;
}

/**
 * 调用 Provider API（非流式）
 */
export async function callProvider(
	provider: ProviderConfig,
	model: string,
	anthropicReq: AnthropicRequest,
	logger?: Logger,
	requestId?: string,
	conversationId?: string,
): Promise<AnthropicResponse> {
	const messageId = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (provider.provider_type === "anthropic") {
		// 直接转发到 Anthropic
		const baseUrl = normalizeAnthropicBaseUrl(
			provider.api_base,
			"https://api.anthropic.com",
		);
		headers["x-api-key"] = provider.api_key || "";
		headers["anthropic-version"] = "2023-06-01";

		const response = await loggedFetch(
			`${baseUrl}/v1/messages`,
			{
				method: "POST",
				headers,
				// Non-streaming request: forward as-is to keep Anthropic response shape intact.
				body: JSON.stringify({ ...anthropicReq, model, stream: false }),
			},
			{
				logger,
				requestId,
				conversationId,
				service: "anthropic-proxy:upstream",
				readResponseBody: false,
			},
		);

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status}`);
		}

		return (await response.json()) as AnthropicResponse;
	}

	// OpenAI 兼容调用
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	Object.assign(
		headers,
		getOpenAICompatibleAuthHeaders(provider, provider.api_key),
	);

	// 转换 Anthropic 请求为 OpenAI 格式
	const openaiMessages = translateToOpenAI(anthropicReq);

	const openaiTools = toOpenAICompatibleTools(anthropicReq);
	if (openaiTools?.length) {
		logger?.info({
			msg: "anthropic proxy: converting tools to OpenAI format",
			toolCount: anthropicReq.tools?.length || 0,
			toolNames: anthropicReq.tools?.map((t) => t.name) || [],
		});
	}

	const openaiReq = {
		model,
		messages: openaiMessages,
		temperature: anthropicReq.temperature ?? 0.7,
		max_tokens: anthropicReq.max_tokens ?? 4096,
		tools: openaiTools,
		tool_choice: openaiTools?.length ? "auto" : undefined,
		// Non-streaming callers expect a single JSON response from upstream.
		stream: false,
	};

	// Log final OpenAI request
	logger?.info({
		msg: "anthropic proxy: sending to provider",
		model: openaiReq.model,
		messageCount: openaiReq.messages.length,
		hasTools: !!openaiReq.tools,
		toolCount: openaiReq.tools?.length || 0,
	});

	const response = await loggedFetch(
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
			service: "anthropic-proxy:upstream",
			readResponseBody: false,
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		logger?.error({
			msg: "anthropic proxy: OpenAI API error",
			status: response.status,
			error: errorText,
		});

		// One-shot retry: flatten prior tool history for stricter OpenAI-compatible gateways.
		if (response.status === 400 && isInvalidArgumentError(errorText)) {
			const retryReq = {
				...openaiReq,
				messages: flattenToolHistoryForOpenAICompatible(openaiReq.messages),
				// Some gateways reject tool_choice; omit it in retry.
				tool_choice: undefined,
			};
			logger?.warn({
				msg: "anthropic proxy: retrying OpenAI request with flattened tool history",
				status: response.status,
				model,
				origMessages: openaiReq.messages.length,
				retryMessages: retryReq.messages.length,
			});

			const retryResp = await loggedFetch(
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
					service: "anthropic-proxy:upstream",
					readResponseBody: false,
				},
			);
			if (!retryResp.ok) {
				const retryErr = await retryResp.text();
				throw new Error(
					`OpenAI API error: ${retryResp.status} - ${retryErr || errorText}`,
				);
			}

			const openaiResp = (await retryResp.json()) as OpenAIResponse;
			return translateToAnthropic(messageId, model, openaiResp);
		}

		throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
	}

	let openaiResp: OpenAIResponse;
	try {
		openaiResp = (await response.json()) as OpenAIResponse;
	} catch (e) {
		// Some OpenAI-compatible providers might still stream even with stream=false.
		const contentType = String(response.headers.get("content-type") || "");
		if (contentType.includes("text/event-stream") && response.body) {
			openaiResp = await readOpenAIChatCompletionsStreamAsJson(response.body);
		} else {
			throw e;
		}
	}

	// Log response for debugging
	logger?.info({
		msg: "anthropic proxy: received OpenAI response",
		choiceCount: openaiResp.choices?.length || 0,
		finishReason: openaiResp.choices?.[0]?.finish_reason,
		hasContent: !!openaiResp.choices?.[0]?.message?.content,
		hasToolCalls: !!openaiResp.choices?.[0]?.message?.tool_calls?.length,
		toolCallCount: openaiResp.choices?.[0]?.message?.tool_calls?.length || 0,
	});

	// 转换回 Anthropic 格式
	return translateToAnthropic(messageId, model, openaiResp);
}

function writeSseEvent(res: Response, event: string, data: unknown) {
	res.write(`event: ${event}\n`);
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function emitToolUseBlock(
	res: Response,
	opts: { index: number; id: string; name: string; input: unknown },
) {
	// Emit tool_use with input carried via input_json_delta (SDK expects this shape).
	writeSseEvent(res, "content_block_start", {
		type: "content_block_start",
		index: opts.index,
		content_block: {
			type: "tool_use",
			id: opts.id,
			name: opts.name,
			input: {},
		},
	});

	writeSseEvent(res, "content_block_delta", {
		type: "content_block_delta",
		index: opts.index,
		delta: {
			type: "input_json_delta",
			partial_json: JSON.stringify(opts.input ?? {}),
		},
	});

	writeSseEvent(res, "content_block_stop", {
		type: "content_block_stop",
		index: opts.index,
	});
}

async function readSseStream(
	body: ReadableStream<Uint8Array>,
	onData: (data: string) => void | Promise<void>,
) {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		while (true) {
			const idx = buffer.indexOf("\n\n");
			if (idx === -1) break;
			const raw = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 2);
			const lines = raw.split(/\r?\n/);
			const dataLines = lines
				.filter((l) => l.startsWith("data:"))
				.map((l) => l.slice("data:".length).trimStart());
			const data = dataLines.join("\n").trim();
			if (data) await onData(data);
		}
	}
	const tail = buffer.trim();
	if (tail) {
		const lines = tail.split(/\r?\n/);
		const dataLines = lines
			.filter((l) => l.startsWith("data:"))
			.map((l) => l.slice("data:".length).trimStart());
		const data = dataLines.join("\n").trim();
		if (data) await onData(data);
	}
}

/**
 * 调用 Provider API（流式）
 */
export async function callProviderStream(
	provider: ProviderConfig,
	model: string,
	anthropicReq: AnthropicRequest,
	res: Response,
	logger?: Logger,
	requestId?: string,
	conversationId?: string,
): Promise<void> {
	const messageId = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

	// Direct Anthropic: proxy SSE as-is
	if (provider.provider_type === "anthropic") {
		const baseUrl = normalizeAnthropicBaseUrl(
			provider.api_base,
			"https://api.anthropic.com",
		);
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"x-api-key": provider.api_key || "",
			"anthropic-version": "2023-06-01",
		};

		const upstream = await loggedFetch(
			`${baseUrl}/v1/messages`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({ ...anthropicReq, model, stream: true }),
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
			logger?.error({
				msg: "anthropic proxy: upstream anthropic stream error",
				status: upstream.status,
				error: errorText,
			});
			writeSseEvent(res, "error", {
				type: "error",
				error: { type: "api_error", message: errorText || "Upstream error" },
			});
			res.end();
			return;
		}
		if (!upstream.body) {
			writeSseEvent(res, "error", {
				type: "error",
				error: { type: "api_error", message: "No upstream body" },
			});
			res.end();
			return;
		}

		// Pipe bytes through (SSE format already correct)
		const nodeStream = Readable.fromWeb(upstream.body as any);
		await new Promise<void>((resolve, reject) => {
			nodeStream.on("error", reject);
			res.on("close", resolve);
			nodeStream.on("end", resolve);
			nodeStream.pipe(res, { end: true });
		});
		return;
	}

	// OpenAI-compatible: stream chat completions and translate to Anthropic SSE
	const openaiMessages = translateToOpenAI(anthropicReq);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	Object.assign(
		headers,
		getOpenAICompatibleAuthHeaders(provider, provider.api_key),
	);

	const openaiTools = toOpenAICompatibleTools(anthropicReq);
	const openaiReq = {
		model,
		messages: openaiMessages,
		temperature: anthropicReq.temperature ?? 0.7,
		max_tokens: anthropicReq.max_tokens ?? 4096,
		tools: openaiTools,
		tool_choice: openaiTools?.length ? "auto" : undefined,
		stream: true,
	};

	logger?.info({
		msg: "anthropic proxy: streaming via openai-compatible provider",
		model,
		messageCount: openaiMessages.length,
		hasTools: !!openaiReq.tools,
		toolCount: openaiReq.tools?.length || 0,
	});

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
		logger?.error({
			msg: "anthropic proxy: openai stream error",
			status: upstream.status,
			error: errorText,
		});

		// One-shot retry for strict gateways: flatten tool history and fall back to non-stream JSON.
		if (upstream.status === 400 && isInvalidArgumentError(errorText)) {
			const retryReq = {
				...openaiReq,
				messages: flattenToolHistoryForOpenAICompatible(openaiReq.messages),
				tool_choice: undefined,
				stream: false,
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
					res.end();
					return;
				}

				const message = translateToAnthropic(messageId, model, openaiResp);

				writeSseEvent(res, "message_start", {
					type: "message_start",
					message: {
						id: message.id,
						type: "message",
						role: "assistant",
						content: [],
						model: message.model,
						usage: {
							input_tokens: message.usage.input_tokens,
							output_tokens: 0,
						},
					},
				});

				message.content.forEach((block, index) => {
					writeSseEvent(res, "content_block_start", {
						type: "content_block_start",
						index,
						content_block:
							block.type === "text" ? { type: "text", text: "" } : block,
					});
					if (block.type === "text") {
						writeSseEvent(res, "content_block_delta", {
							type: "content_block_delta",
							index,
							delta: { type: "text_delta", text: block.text },
						});
					} else if (block.type === "tool_use") {
						writeSseEvent(res, "content_block_delta", {
							type: "content_block_delta",
							index,
							delta: {
								type: "input_json_delta",
								partial_json: JSON.stringify(block.input ?? {}),
							},
						});
					}
					writeSseEvent(res, "content_block_stop", {
						type: "content_block_stop",
						index,
					});
				});

				writeSseEvent(res, "message_delta", {
					type: "message_delta",
					delta: { stop_reason: message.stop_reason },
					usage: { output_tokens: message.usage.output_tokens },
				});
				writeSseEvent(res, "message_stop", { type: "message_stop" });
				res.end();
				return;
			}
		}

		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: errorText || "Upstream error" },
		});
		res.end();
		return;
	}
	if (!upstream.body) {
		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: "No upstream body" },
		});
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
			res.end();
			return;
		}

		const message = translateToAnthropic(messageId, model, openaiResp);

		writeSseEvent(res, "message_start", {
			type: "message_start",
			message: {
				id: message.id,
				type: "message",
				role: "assistant",
				content: [],
				model: message.model,
				usage: { input_tokens: message.usage.input_tokens, output_tokens: 0 },
			},
		});

		message.content.forEach((block, index) => {
			writeSseEvent(res, "content_block_start", {
				type: "content_block_start",
				index,
				content_block:
					block.type === "text" ? { type: "text", text: "" } : block,
			});
			if (block.type === "text") {
				writeSseEvent(res, "content_block_delta", {
					type: "content_block_delta",
					index,
					delta: { type: "text_delta", text: block.text },
				});
			} else if (block.type === "tool_use") {
				writeSseEvent(res, "content_block_delta", {
					type: "content_block_delta",
					index,
					delta: {
						type: "input_json_delta",
						partial_json: JSON.stringify(block.input ?? {}),
					},
				});
			}
			writeSseEvent(res, "content_block_stop", {
				type: "content_block_stop",
				index,
			});
		});

		writeSseEvent(res, "message_delta", {
			type: "message_delta",
			delta: { stop_reason: message.stop_reason },
			usage: { output_tokens: message.usage.output_tokens },
		});
		writeSseEvent(res, "message_stop", { type: "message_stop" });
		res.end();
		return;
	}

	// message_start
	const estimatedInputTokens = estimateAnthropicInputTokens(anthropicReq);
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

	const doneErr = new Error("__OPENAI_STREAM_DONE__");
	let nextBlockIndex = 0;
	let textBlockIndex: number | null = null;
	let toolCalls = new Map<
		number,
		{ id?: string; name?: string; args: string }
	>();
	let emittedToolUse = false;
	let pendingStopReason: "end_turn" | "tool_use" | "max_tokens" | null = null;
	let lastUsage: any = null;
	let finalized = false;

	const stopTextBlockIfNeeded = () => {
		if (textBlockIndex === null) return;
		writeSseEvent(res, "content_block_stop", {
			type: "content_block_stop",
			index: textBlockIndex,
		});
		textBlockIndex = null;
	};

	const finalize = () => {
		if (finalized || res.writableEnded) return;
		finalized = true;

		stopTextBlockIfNeeded();
		const stopReason = pendingStopReason || "end_turn";

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

			if (typeof delta?.content === "string" && delta.content.length > 0) {
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
				for (const tc of delta.tool_calls) {
					const idx = typeof tc?.index === "number" ? tc.index : 0;
					const existing = toolCalls.get(idx) || { args: "" };
					if (typeof tc?.id === "string" && tc.id) existing.id = tc.id;
					if (typeof tc?.function?.name === "string" && tc.function.name)
						existing.name = tc.function.name;
					if (
						typeof tc?.function?.arguments === "string" &&
						tc.function.arguments
					) {
						existing.args += tc.function.arguments;
					}
					toolCalls.set(idx, existing);
				}
			}

			if (!finishReason) return;

			// 【调试】打印 finishReason 值，帮助定位 error_during_execution 问题
			logger?.info({
				msg: "anthropic proxy: stream finish_reason received",
				requestId,
				finishReason,
				hasToolCalls: toolCalls.size > 0,
			});

			if (finishReason === "tool_calls") {
				stopTextBlockIfNeeded();

				// Emit tool_use blocks
				if (!emittedToolUse) {
					emittedToolUse = true;
					const sorted = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
					for (const [_i, tc] of sorted) {
						const toolIndex = nextBlockIndex++;
						let input: unknown = {};
						const rawArgs = String(tc.args || "").trim();
						if (rawArgs) {
							try {
								input = JSON.parse(rawArgs);
							} catch {
								input = { _raw: rawArgs };
							}
						}
						emitToolUseBlock(res, {
							index: toolIndex,
							id: tc.id || `toolu_${crypto.randomUUID().replace(/-/g, "")}`,
							name: tc.name || "Tool",
							input,
						});
					}
				}
				pendingStopReason = "tool_use";
				return;
			}

			if (finishReason === "stop" || finishReason === "length") {
				stopTextBlockIfNeeded();

				// 【关键修复】某些模型（如 Gemini）即使有工具调用也返回 finish_reason="stop"
				// 如果有未发送的工具调用，需要在这里发送它们
				if (toolCalls.size > 0 && !emittedToolUse) {
					emittedToolUse = true;
					const sorted = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
					for (const [_i, tc] of sorted) {
						const toolIndex = nextBlockIndex++;
						let input: unknown = {};
						const rawArgs = String(tc.args || "").trim();
						if (rawArgs) {
							try {
								input = JSON.parse(rawArgs);
							} catch {
								input = { _raw: rawArgs };
							}
						}
						emitToolUseBlock(res, {
							index: toolIndex,
							id: tc.id || `toolu_${crypto.randomUUID().replace(/-/g, "")}`,
							name: tc.name || "Tool",
							input,
						});
					}
					pendingStopReason = "tool_use";
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

	if (streamError) {
		const msg =
			streamError instanceof Error ? streamError.message : String(streamError);
		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: msg || "Upstream stream error" },
		});
		res.end();
		return;
	}

	finalize();
}
