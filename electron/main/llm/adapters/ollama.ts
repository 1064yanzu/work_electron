import { readTextStream } from "../protocol/sse";
import { createCallSignal, LLM_STREAM_TIMEOUT_MS } from "../shared";
import type { LlmCallResult, Provider } from "../types";
import type { LlmProviderAdapter } from "./types";

/**
 * 调用 Ollama API（内部使用流式并聚合结果）
 */
async function callOllama(
	provider: Provider,
	model: string,
	prompt: string,
	_context?: string[],
	_temperature?: number,
): Promise<LlmCallResult> {
	// 使用流式调用内部实现，确保一致性
	let content = "";
	await callOllamaStream({
		provider,
		model,
		prompt,
		onChunk: (text) => {
			content += text;
		},
	});
	return { content };
}

async function callOllamaStream(opts: {
	provider: Provider;
	model: string;
	prompt: string;
	signal?: AbortSignal;
	onChunk: (text: string) => void;
}): Promise<void> {
	const baseUrl = opts.provider.api_base || "http://localhost:11434";
	const url = `${baseUrl}/api/chat`;

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: opts.model,
			messages: [{ role: "user", content: opts.prompt }],
			stream: true,
		}),
		signal: createCallSignal(LLM_STREAM_TIMEOUT_MS, opts.signal),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`Ollama call failed (stream): ${response.status} - ${error}`,
		);
	}
	if (!response.body) throw new Error("No response body for streaming");

	let buf = "";
	await readTextStream(response.body, (text) => {
		buf += text;
		let idx: number;
		while ((idx = buf.indexOf("\n")) !== -1) {
			const line = buf.slice(0, idx).trim();
			buf = buf.slice(idx + 1);
			if (!line) continue;
			try {
				const json = JSON.parse(line) as any;
				const part =
					typeof json?.message?.content === "string"
						? json.message.content
						: "";
				if (part) opts.onChunk(part);
			} catch {
				// ignore
			}
		}
	});
}

export const ollamaAdapter: LlmProviderAdapter = {
	id: "ollama",
	call: (opts) =>
		callOllama(
			opts.provider,
			opts.model,
			opts.prompt,
			opts.context,
			opts.temperature,
		),
	callStream: async (opts) => {
		await callOllamaStream({
			provider: opts.provider,
			model: opts.model,
			prompt: opts.prompt,
			signal: opts.signal,
			onChunk: opts.onChunk,
		});
		return {};
	},
};
