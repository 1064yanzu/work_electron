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
import {
	extractThoughtFragmentsFromOpenAIChunk,
	ThoughtDeltaNormalizer,
	type ThoughtSource,
} from "./thinkingCompat";
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

type ProviderCallOptions = {
	anthropicBeta?: string;
};

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

function computeStringOverlap(prev: string, incoming: string): number {
	const max = Math.min(prev.length, incoming.length);
	for (let k = max; k > 0; k--) {
		if (prev.slice(-k) === incoming.slice(0, k)) return k;
	}
	return 0;
}

/**
 * 兼容增量与累计两种上游分片模式，返回新的累计值。
 */
function mergeStreamingFragment(prev: string, incoming: string): string {
	if (!incoming) return prev;
	if (!prev) return incoming;
	if (incoming.startsWith(prev)) return incoming;
	if (prev.endsWith(incoming)) return prev;
	const overlap = computeStringOverlap(prev, incoming);
	if (overlap > 0) return prev + incoming.slice(overlap);
	return prev + incoming;
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
	callOptions?: ProviderCallOptions,
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
		if (typeof callOptions?.anthropicBeta === "string") {
			const beta = callOptions.anthropicBeta.trim();
			if (beta) headers["anthropic-beta"] = beta;
		}

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

function emitThoughtBlock(
	res: Response,
	opts: {
		index: number;
		source: ThoughtSource;
		text: string;
	},
) {
	const text = String(opts.text || "").trim();
	if (!text) return;

	writeSseEvent(res, "content_block_start", {
		type: "content_block_start",
		index: opts.index,
		content_block: {
			// Anthropic SSE 规范中仅保证 thinking block 的兼容性；
			// 将各类 reasoning/thinking 上游字段统一映射为 thinking 事件输出。
			type: "thinking",
			text: "",
		},
	});

	writeSseEvent(res, "content_block_delta", {
		type: "content_block_delta",
		index: opts.index,
		delta: {
			type: "thinking_delta",
			thinking: text,
		},
	});

	writeSseEvent(res, "content_block_stop", {
		type: "content_block_stop",
		index: opts.index,
	});
}

function emitAnthropicMessageContentBlocks(
	res: Response,
	contentBlocks: AnthropicResponse["content"],
	startIndex = 0,
): number {
	let nextIndex = startIndex;

	for (const block of contentBlocks) {
		if (!block || typeof block !== "object") continue;

		if (block.type === "text") {
			const text = typeof block.text === "string" ? block.text : "";
			if (!text) continue;
			const index = nextIndex++;
			writeSseEvent(res, "content_block_start", {
				type: "content_block_start",
				index,
				content_block: { type: "text", text: "" },
			});
			writeSseEvent(res, "content_block_delta", {
				type: "content_block_delta",
				index,
				delta: { type: "text_delta", text },
			});
			writeSseEvent(res, "content_block_stop", {
				type: "content_block_stop",
				index,
			});
			continue;
		}

		if (block.type === "tool_use") {
			emitToolUseBlock(res, {
				index: nextIndex++,
				id: block.id,
				name: block.name,
				input: block.input,
			});
			continue;
		}

		if (block.type === "thinking" || block.type === "reasoning") {
			const thoughtText =
				typeof (block as any).text === "string" ? (block as any).text : "";
			if (!thoughtText) continue;
			emitThoughtBlock(res, {
				index: nextIndex++,
				source: block.type,
				text: thoughtText,
			});
		}
	}

	return nextIndex;
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
	callOptions?: ProviderCallOptions,
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
		if (typeof callOptions?.anthropicBeta === "string") {
			const beta = callOptions.anthropicBeta.trim();
			if (beta) headers["anthropic-beta"] = beta;
		}

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
			error: { type: "api_error", message: errorText || "Upstream error" },
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

	const startToolCallBlockIfNeeded = (state: StreamingToolCallState) => {
		if (state.blockIndex !== null) return;
		stopTextBlockIfNeeded();
		stopThoughtBlockIfNeeded();
		state.blockIndex = nextBlockIndex++;
		writeSseEvent(res, "content_block_start", {
			type: "content_block_start",
			index: state.blockIndex,
			content_block: {
				type: "tool_use",
				id: state.id || `toolu_${crypto.randomUUID().replace(/-/g, "")}`,
				name: state.name || "Tool",
				input: {},
			},
		});
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
		for (const [_idx, state] of sorted) {
			startToolCallBlockIfNeeded(state);
			emitToolCallArgsIfNeeded(state);
		}
		stopAllToolCallBlocksIfNeeded();
		return true;
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
					startToolCallBlockIfNeeded(existing);
					emitToolCallArgsIfNeeded(existing);
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

	if (streamError) {
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
