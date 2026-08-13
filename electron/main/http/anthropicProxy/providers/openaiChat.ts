import type { Logger } from "../../../logging/types";
import { humanizeUpstreamError } from "../../../llm/protocol/errors";
import { loggedFetch } from "../../utils/loggedFetch";
import {
	readOpenAIChatCompletionsStreamAsJson,
	translateToAnthropic,
} from "../openaiCompat";
import type {
	AnthropicRequest,
	AnthropicResponse,
	OpenAIChatMessage,
	OpenAIResponse,
	ProviderConfig,
} from "../types";
import {
	applyOpenAIChatReasoningControls,
	flattenToolHistoryForOpenAICompatible,
	isInvalidArgumentError,
	isReasoningControlInvalidArgument,
} from "./openaiShared";
import type { OpenAIChatCompletionRequest, ProviderCallOptions } from "./types";

type OpenAIChatCallParams = {
	provider: ProviderConfig;
	model: string;
	anthropicReq: AnthropicRequest;
	openaiMessages: OpenAIChatMessage[];
	openaiTools: any[] | undefined;
	baseUrl: string;
	headers: Record<string, string>;
	messageId: string;
	logger?: Logger;
	requestId?: string;
	conversationId?: string;
	callOptions?: ProviderCallOptions;
};

/**
 * OpenAI chat/completions 模板（非流式），含 invalid argument 的一次性扁平化重试。
 */
export async function callOpenAIChatTemplate(
	params: OpenAIChatCallParams,
): Promise<AnthropicResponse> {
	const {
		provider,
		model,
		anthropicReq,
		openaiMessages,
		openaiTools,
		baseUrl,
		headers,
		messageId,
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
		stream: false,
	};
	applyOpenAIChatReasoningControls(openaiReq, callOptions?.thinkingLevel);

	logger?.info({
		msg: "anthropic proxy: sending to provider",
		model: openaiReq.model,
		baseUrl,
		providerType: provider.provider_type,
		templateId: provider.template_id || null,
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
		const shouldRetryInvalidArgument =
			response.status === 400 && isInvalidArgumentError(errorText);
		if (shouldRetryInvalidArgument) {
			logger?.warn({
				msg: "anthropic proxy: OpenAI API returned retryable invalid argument",
				status: response.status,
				error: errorText,
			});
		} else {
			logger?.error({
				msg: "anthropic proxy: OpenAI API error",
				status: response.status,
				error: errorText,
			});
		}

		// One-shot retry: flatten prior tool history for stricter OpenAI-compatible gateways.
		if (shouldRetryInvalidArgument) {
			const dropReasoningControls =
				isReasoningControlInvalidArgument(errorText);
			const retryReq = {
				...openaiReq,
				messages: flattenToolHistoryForOpenAICompatible(openaiReq.messages),
				// Some gateways reject tool_choice; omit it in retry.
				tool_choice: undefined,
				reasoning_effort: dropReasoningControls
					? undefined
					: openaiReq.reasoning_effort,
				extra_body: dropReasoningControls ? undefined : openaiReq.extra_body,
				thinking: dropReasoningControls ? undefined : openaiReq.thinking,
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
				const friendly = humanizeUpstreamError(
					retryResp.status,
					retryErr || errorText,
				);
				throw new Error(`${friendly.type}: ${friendly.message}`);
			}

			const openaiResp = (await retryResp.json()) as OpenAIResponse;
			if (!openaiResp.choices || openaiResp.choices.length === 0) {
				throw new Error(
					`OpenAI upstream returned no choices on retry: ${JSON.stringify(
						openaiResp,
					).slice(0, 500)}`,
				);
			}
			return translateToAnthropic(messageId, model, openaiResp);
		}

		const friendly = humanizeUpstreamError(response.status, errorText);
		throw new Error(`${friendly.type}: ${friendly.message}`);
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
	if (!openaiResp.choices || openaiResp.choices.length === 0) {
		throw new Error(
			`OpenAI upstream returned no choices: ${JSON.stringify(openaiResp).slice(
				0,
				500,
			)}`,
		);
	}
	return translateToAnthropic(messageId, model, openaiResp);
}
