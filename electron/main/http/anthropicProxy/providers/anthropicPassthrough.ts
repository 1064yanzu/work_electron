import { Readable } from "node:stream";
import { normalizeAnthropicBaseUrl } from "../../../llm/providerHttp";
import { humanizeUpstreamError } from "../../../llm/protocol/errors";
import { loggedFetch } from "../../utils/loggedFetch";
import type { AnthropicResponse } from "../types";
import { writeSseEvent } from "./sseOut";
import type {
	ProxyProviderAdapter,
	ProxyProviderCallParams,
	ProxyProviderStreamParams,
} from "./types";

/**
 * Anthropic 直连模板：请求/响应原样转发（非流式转发 JSON，流式透传 SSE 字节流）。
 */
async function callAnthropicPassthrough(
	params: ProxyProviderCallParams,
): Promise<AnthropicResponse> {
	const {
		provider,
		model,
		anthropicReq,
		logger,
		requestId,
		conversationId,
		callOptions,
	} = params;

	// 直接转发到 Anthropic
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

async function streamAnthropicPassthrough(
	params: ProxyProviderStreamParams,
): Promise<void> {
	const {
		provider,
		model,
		anthropicReq,
		res,
		logger,
		requestId,
		conversationId,
		callOptions,
	} = params;

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
			error: humanizeUpstreamError(upstream.status, errorText),
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
}

export const anthropicPassthroughAdapter: ProxyProviderAdapter = {
	id: "anthropic-passthrough",
	call: callAnthropicPassthrough,
	stream: streamAnthropicPassthrough,
};
