import { normalizeAnthropicBaseUrl } from "../providerHttp";
import { formatUpstreamErrorDetail } from "../protocol/errors";
import { createSseParser, readTextStream } from "../protocol/sse";
import {
	buildContextMessage,
	createCallSignal,
	createTimeoutSignal,
	LLM_CALL_TIMEOUT_MS,
	LLM_STREAM_TIMEOUT_MS,
	parseOpenAIStyleResult,
	sleep,
	tryParseJson,
	withJitter,
} from "../shared";
import type { LlmCallResult, Provider, StreamChunk } from "../types";
import type {
	LlmAdapterStreamOptions,
	LlmAdapterStreamResult,
	LlmProviderAdapter,
} from "./types";

/**
 * 调用 Anthropic API
 */
async function callAnthropic(
	provider: Provider,
	model: string,
	prompt: string,
	apiKey: string | undefined,
	context?: string[],
	temperature?: number,
): Promise<LlmCallResult> {
	const baseUrl = normalizeAnthropicBaseUrl(
		provider.api_base,
		"https://api.anthropic.com",
	);
	const url = `${baseUrl}/v1/messages`;

	// 构建用户消息（包含上下文）
	let userContent = prompt;
	const contextMsg = buildContextMessage(context);
	if (contextMsg) {
		userContent = `${contextMsg}\n\n---\n\n${prompt}`;
	}

	const transientStatus = new Set([429, 500, 502, 503, 504, 524, 529]);
	let response: Response | null = null;
	let lastErrorText = "";

	const MAX_RETRIES = 4;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey || "",
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: userContent }],
				max_tokens: 4096,
				temperature: temperature ?? 0.7,
			}),
			signal: createTimeoutSignal(LLM_CALL_TIMEOUT_MS),
		});

		if (response.ok) break;
		lastErrorText = await response.text();
		if (transientStatus.has(response.status) && attempt < MAX_RETRIES - 1) {
			const baseDelay = 1000;
			const delay = withJitter(Math.min(baseDelay * 2.5 ** attempt, 30_000));
			await sleep(delay);
			continue;
		}
		throw new Error(
			`Anthropic call failed: ${formatUpstreamErrorDetail(response.status, lastErrorText)}`,
		);
	}

	if (!response || !response.ok) {
		throw new Error(
			`Anthropic call failed: unknown - ${lastErrorText || "no response"}`,
		);
	}

	// 先读取文本，再安全解析 —— 兼容某些代理/中继返回 SSE 格式的情况
	const rawText = await response.text();
	const data = tryParseJson(rawText) as {
		content?: Array<{ type: string; text?: string }>;
		usage?: {
			input_tokens: number;
			output_tokens: number;
			cache_read_input_tokens?: number;
			cache_creation_input_tokens?: number;
		};
	} | null;

	// 如果不是合法 JSON（可能是 SSE 流格式），回退到通用 SSE 解析
	if (!data || !Array.isArray(data.content)) {
		return parseOpenAIStyleResult(rawText);
	}

	const textContent = data.content
		.filter((c) => c.type === "text")
		.map((c) => c.text || "")
		.join("");

	return {
		content: textContent,
		usage: data.usage
			? {
					prompt_tokens: data.usage.input_tokens,
					completion_tokens: data.usage.output_tokens,
					total_tokens: data.usage.input_tokens + data.usage.output_tokens,
					cache_read_input_tokens:
						data.usage.cache_read_input_tokens || undefined,
					cache_creation_input_tokens:
						data.usage.cache_creation_input_tokens || undefined,
				}
			: undefined,
	};
}

async function callAnthropicStream(
	opts: LlmAdapterStreamOptions,
): Promise<LlmAdapterStreamResult> {
	const baseUrl = normalizeAnthropicBaseUrl(
		opts.provider.api_base,
		"https://api.anthropic.com",
	);
	const url = `${baseUrl}/v1/messages`;

	let userContent = opts.prompt;
	const contextMsg = buildContextMessage(opts.context);
	if (contextMsg) userContent = `${contextMsg}\n\n---\n\n${opts.prompt}`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": opts.apiKey || "",
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: opts.model,
			messages: [{ role: "user", content: userContent }],
			max_tokens: 4096,
			temperature: opts.temperature ?? 0.7,
			stream: true,
		}),
		signal: createCallSignal(LLM_STREAM_TIMEOUT_MS, opts.signal),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`Anthropic call failed (stream): ${response.status} - ${error}`,
		);
	}
	if (!response.body) throw new Error("No response body for streaming");

	let usage: StreamChunk["usage"] | undefined;
	// 分别跟踪 message_start 和 message_delta 中的 token 数据
	let startInputTokens = 0;
	let startCacheReadTokens = 0;
	let startCacheCreationTokens = 0;
	const blockKindByIndex = new Map<number, string>();
	const parse = createSseParser(
		(data) => {
			try {
				const json = JSON.parse(data) as any;
				// message_start 包含 input_tokens 和 cache 相关 token
				if (json?.type === "message_start" && json?.message?.usage) {
					const u = json.message.usage;
					startInputTokens = Number(u.input_tokens ?? 0);
					startCacheReadTokens = Number(u.cache_read_input_tokens ?? 0);
					startCacheCreationTokens = Number(u.cache_creation_input_tokens ?? 0);
				}
				if (json?.type === "content_block_start") {
					const idx = typeof json?.index === "number" ? json.index : -1;
					if (idx >= 0) {
						const blockType =
							typeof json?.content_block?.type === "string"
								? json.content_block.type
								: "";
						blockKindByIndex.set(idx, blockType);
					}
				}
				if (json?.type === "content_block_delta") {
					const delta = json?.delta;
					const idx = typeof json?.index === "number" ? json.index : -1;
					const blockKind = idx >= 0 ? blockKindByIndex.get(idx) : "";
					if (
						delta?.type === "thinking_delta" &&
						typeof delta?.thinking === "string"
					) {
						opts.onChunk(delta.thinking, "thought", {
							title: "Thinking",
							source: "thinking",
							model: opts.model,
						});
					}
					if (delta?.type === "text_delta" && typeof delta?.text === "string") {
						if (blockKind === "thinking" || blockKind === "reasoning") {
							opts.onChunk(delta.text, "thought", {
								title: blockKind === "reasoning" ? "Reasoning" : "Thinking",
								source: blockKind,
								model: opts.model,
							});
						} else {
							opts.onChunk(delta.text, "text");
						}
					}
				}
				if (
					json?.type === "content_block_stop" &&
					typeof json?.index === "number"
				) {
					blockKindByIndex.delete(json.index);
				}
				// message_delta 只包含 output_tokens，需要合并 message_start 的 input_tokens
				if (json?.type === "message_delta" && json?.usage) {
					const outputTokens = Number(json.usage.output_tokens ?? 0);
					usage = {
						prompt_tokens: startInputTokens,
						completion_tokens: outputTokens,
						total_tokens: startInputTokens + outputTokens,
						cache_read_input_tokens: startCacheReadTokens || undefined,
						cache_creation_input_tokens: startCacheCreationTokens || undefined,
					};
				}
			} catch {
				// ignore
			}
		},
		{ joinMultilineData: false },
	);

	await readTextStream(response.body, parse);
	return { usage };
}

export const anthropicAdapter: LlmProviderAdapter = {
	id: "anthropic",
	call: (opts) =>
		callAnthropic(
			opts.provider,
			opts.model,
			opts.prompt,
			opts.apiKey,
			opts.context,
			opts.temperature,
		),
	callStream: (opts) => callAnthropicStream(opts),
};
