import {
	getOpenAICompatibleAuthHeaders,
	normalizeOpenAICompatibleBaseUrl,
} from "../providerHttp";
import { formatUpstreamErrorDetail } from "../protocol/errors";
import { createSseParser, readTextStream } from "../protocol/sse";
import {
	buildContextMessage,
	createCallSignal,
	createTimeoutSignal,
	DEFAULT_RESPONSES_INSTRUCTIONS,
	LLM_CALL_TIMEOUT_MS,
	LLM_STREAM_TIMEOUT_MS,
	parseOpenAIStyleResult,
	sleep,
	withJitter,
} from "../shared";
import type { LlmCallResult, Provider, StreamChunk } from "../types";
import type {
	LlmAdapterStreamOptions,
	LlmAdapterStreamResult,
	LlmProviderAdapter,
} from "./types";

/**
 * 调用 OpenAI Responses API（非流式）
 * 端点: POST /v1/responses
 * 文档: https://platform.openai.com/docs/api-reference/responses
 */
async function callOpenAIResponses(
	provider: Provider,
	model: string,
	prompt: string,
	apiKey: string | undefined,
	context?: string[],
	temperature?: number,
): Promise<LlmCallResult> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/responses`;

	const contextMsg = buildContextMessage(context);
	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let response: Response | null = null;
	let lastErrorText = "";

	const body: Record<string, unknown> = {
		model,
		input: [{ role: "user", content: prompt }],
		instructions: contextMsg ?? DEFAULT_RESPONSES_INSTRUCTIONS,
		temperature: temperature ?? 0.7,
	};

	const MAX_RETRIES = 4;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(provider, apiKey),
			},
			body: JSON.stringify(body),
			signal: createTimeoutSignal(LLM_CALL_TIMEOUT_MS),
		});

		if (response.ok) break;
		lastErrorText = await response.text();
		if (
			response.status === 400 &&
			/stream must be set to true/i.test(lastErrorText)
		) {
			return callOpenAIResponsesStreamingFallback({
				provider,
				model,
				prompt,
				apiKey,
				context,
				temperature,
			});
		}
		if (transientStatus.has(response.status) && attempt < MAX_RETRIES - 1) {
			// 指数退避：1s, 3s, 8s, 20s
			const baseDelay = 1000;
			const delay = withJitter(Math.min(baseDelay * 2.5 ** attempt, 30_000));
			await sleep(delay);
			continue;
		}
		throw new Error(
			`LLM call failed: ${formatUpstreamErrorDetail(response.status, lastErrorText)}`,
		);
	}

	if (!response || !response.ok) {
		throw new Error(
			`LLM call failed: unknown - ${lastErrorText || "no response"}`,
		);
	}

	return parseOpenAIStyleResult(await response.text());
}

async function callOpenAIResponsesStreamingFallback(opts: {
	provider: Provider;
	model: string;
	prompt: string;
	apiKey: string | undefined;
	context?: string[];
	temperature?: number;
	signal?: AbortSignal;
}): Promise<LlmCallResult> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		opts.provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/responses`;

	const contextMsg = buildContextMessage(opts.context);
	const body: Record<string, unknown> = {
		model: opts.model,
		input: [{ role: "user", content: opts.prompt }],
		instructions: contextMsg ?? DEFAULT_RESPONSES_INSTRUCTIONS,
		temperature: opts.temperature ?? 0.7,
		stream: true,
	};

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...getOpenAICompatibleAuthHeaders(opts.provider, opts.apiKey),
		},
		body: JSON.stringify(body),
		signal: createCallSignal(LLM_STREAM_TIMEOUT_MS, opts.signal),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`LLM call failed (stream fallback): ${formatUpstreamErrorDetail(response.status, errorText)}`,
		);
	}

	if (!response.body)
		throw new Error("No response body for streaming fallback");

	let content = "";
	let usage: StreamChunk["usage"] | undefined;
	const parse = createSseParser(
		(data) => {
			if (data === "[DONE]") return;
			try {
				const json = JSON.parse(data) as any;
				const eventType = json?.type as string | undefined;
				if (eventType === "response.output_text.delta") {
					const delta = typeof json.delta === "string" ? json.delta : "";
					if (delta) content += delta;
				} else if (eventType === "response.done") {
					const u = json?.response?.usage;
					if (u && typeof u === "object") {
						const inputT = Number(u.input_tokens ?? 0);
						const outputT = Number(u.output_tokens ?? 0);
						usage = {
							prompt_tokens: inputT,
							completion_tokens: outputT,
							total_tokens: u.total_tokens
								? Number(u.total_tokens)
								: inputT + outputT,
						};
					}
				}
			} catch {
				// ignore malformed lines
			}
		},
		{ joinMultilineData: false },
	);

	await readTextStream(response.body, parse);
	return { content, usage };
}

/**
 * 调用 OpenAI Responses API（流式）
 * SSE 事件: response.output_text.delta / response.done
 */
async function callOpenAIResponsesStream(
	opts: LlmAdapterStreamOptions,
): Promise<LlmAdapterStreamResult> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		opts.provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/responses`;

	const contextMsg = buildContextMessage(opts.context);
	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let lastErrorText = "";

	const body: Record<string, unknown> = {
		model: opts.model,
		input: [{ role: "user", content: opts.prompt }],
		instructions: contextMsg ?? DEFAULT_RESPONSES_INSTRUCTIONS,
		temperature: opts.temperature ?? 0.7,
		stream: true,
	};

	for (let attempt = 0; attempt < 3; attempt++) {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(opts.provider, opts.apiKey),
			},
			body: JSON.stringify(body),
			signal: createCallSignal(LLM_STREAM_TIMEOUT_MS, opts.signal),
		});

		if (!response.ok) {
			lastErrorText = await response.text();
			if (transientStatus.has(response.status) && attempt < 2) {
				await sleep(withJitter(500 * (attempt + 1) * (attempt + 1)));
				continue;
			}
			throw new Error(
				`LLM call failed (stream): ${formatUpstreamErrorDetail(response.status, lastErrorText)}`,
			);
		}

		if (!response.body) throw new Error("No response body for streaming");

		let usage: StreamChunk["usage"] | undefined;

		const parse = createSseParser(
			(data) => {
				if (data === "[DONE]") return;
				try {
					const json = JSON.parse(data) as any;
					const eventType = json?.type as string | undefined;

					if (eventType === "response.output_text.delta") {
						// delta 字段即文本片段
						const delta = typeof json.delta === "string" ? json.delta : "";
						if (delta) opts.onChunk(delta, "text");
					} else if (eventType === "response.done") {
						// 从 response.done 事件提取 usage
						const u = json?.response?.usage;
						if (u && typeof u === "object") {
							const inputT = Number(u.input_tokens ?? 0);
							const outputT = Number(u.output_tokens ?? 0);
							usage = {
								prompt_tokens: inputT,
								completion_tokens: outputT,
								total_tokens: u.total_tokens
									? Number(u.total_tokens)
									: inputT + outputT,
							};
						}
					}
				} catch {
					// ignore malformed lines
				}
			},
			{ joinMultilineData: false },
		);

		await readTextStream(response.body, parse);
		return { usage };
	}

	throw new Error(`LLM call failed (stream): unknown - ${lastErrorText}`);
}

export const openaiResponsesAdapter: LlmProviderAdapter = {
	id: "openai-responses",
	call: (opts) =>
		callOpenAIResponses(
			opts.provider,
			opts.model,
			opts.prompt,
			opts.apiKey,
			opts.context,
			opts.temperature,
		),
	callStream: (opts) => callOpenAIResponsesStream(opts),
};
