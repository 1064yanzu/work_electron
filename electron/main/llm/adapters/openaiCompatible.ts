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
	extractThoughtDeltaFromOpenAIChunk,
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
 * 调用 OpenAI 兼容 API（chat/completions）
 */
async function callOpenAICompatible(
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
	const url = `${baseUrl}/chat/completions`;

	const messages: Array<{ role: string; content: string }> = [];

	// 添加上下文作为 system 消息
	const contextMsg = buildContextMessage(context);
	if (contextMsg) {
		messages.push({ role: "system", content: contextMsg });
	}

	// 添加用户消息
	messages.push({ role: "user", content: prompt });

	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);

	let response: Response | null = null;
	let lastErrorText = "";
	const MAX_RETRIES = 4;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(provider, apiKey),
			},
			body: JSON.stringify({
				model,
				messages,
				temperature: temperature ?? 0.7,
			}),
			signal: createTimeoutSignal(LLM_CALL_TIMEOUT_MS),
		});

		if (response.ok) break;
		lastErrorText = await response.text();
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

async function callOpenAICompatibleStream(
	opts: LlmAdapterStreamOptions,
): Promise<LlmAdapterStreamResult> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		opts.provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/chat/completions`;

	const messages: Array<{ role: string; content: string }> = [];
	const contextMsg = buildContextMessage(opts.context);
	if (contextMsg) messages.push({ role: "system", content: contextMsg });
	messages.push({ role: "user", content: opts.prompt });

	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let lastErrorText = "";

	for (let attempt = 0; attempt < 3; attempt++) {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(opts.provider, opts.apiKey),
			},
			body: JSON.stringify({
				model: opts.model,
				messages,
				stream: true,
				// Some OpenAI-compatible providers support this and will include usage in the final event.
				stream_options: { include_usage: true },
				temperature: opts.temperature ?? 0.7,
			}),
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
					const delta = json?.choices?.[0]?.delta;
					const text = typeof delta?.content === "string" ? delta.content : "";
					if (text) opts.onChunk(text, "text");
					const thought = extractThoughtDeltaFromOpenAIChunk(json);
					if (thought) {
						opts.onChunk(thought, "thought", {
							title: "Reasoning",
							source: "reasoning_content",
							model: opts.model,
						});
					}
					if (json?.usage && typeof json.usage === "object") {
						usage = json.usage as any;
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

export const openaiCompatibleAdapter: LlmProviderAdapter = {
	id: "openai-compatible",
	call: (opts) =>
		callOpenAICompatible(
			opts.provider,
			opts.model,
			opts.prompt,
			opts.apiKey,
			opts.context,
			opts.temperature,
		),
	callStream: (opts) => callOpenAICompatibleStream(opts),
};
