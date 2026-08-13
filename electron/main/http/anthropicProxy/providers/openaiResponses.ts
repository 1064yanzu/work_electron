import type { Response } from "express";
import type { Logger } from "../../../logging/types";
import { humanizeUpstreamError } from "../../../llm/protocol/errors";
import { loggedFetch } from "../../utils/loggedFetch";
import {
	getOpenAIEndpointResolution,
	toOpenAIResponsesRequest,
	translateResponsesToAnthropic,
} from "../openaiResponsesCompat";
import { estimateAnthropicInputTokens } from "../tokenEstimation";
import type {
	AnthropicRequest,
	AnthropicResponse,
	OpenAIChatMessage,
	ProviderConfig,
} from "../types";
import {
	applyOpenAIResponsesReasoningControls,
	isResponsesEndpointUnsupported,
	toOpenAIResponsesTools,
} from "./openaiShared";
import { streamOpenAIResponsesToAnthropic } from "./openaiResponsesStream";
import { writeSseEvent } from "./sseOut";
import type { ProviderCallOptions } from "./types";

type OpenAIResponsesAttemptParams = {
	provider: ProviderConfig;
	model: string;
	anthropicReq: AnthropicRequest;
	openaiMessages: OpenAIChatMessage[];
	baseUrl: string;
	headers: Record<string, string>;
	messageId: string;
	endpointResolution: ReturnType<typeof getOpenAIEndpointResolution>;
	logger?: Logger;
	requestId?: string;
	conversationId?: string;
	callOptions?: ProviderCallOptions;
};

/**
 * OpenAI Responses API 模板（非流式）。
 * 返回 null 表示 responses endpoint 不受支持且允许回退（由调用方转 chat/completions）。
 */
export async function callOpenAIResponsesTemplate(
	params: OpenAIResponsesAttemptParams,
): Promise<AnthropicResponse | null> {
	const {
		model,
		anthropicReq,
		openaiMessages,
		baseUrl,
		headers,
		messageId,
		endpointResolution,
		logger,
		requestId,
		conversationId,
		callOptions,
	} = params;

	const responsesReq = toOpenAIResponsesRequest({
		model,
		anthropicReq,
		openaiMessages,
		tools: toOpenAIResponsesTools(anthropicReq),
		stream: false,
	});
	applyOpenAIResponsesReasoningControls(
		responsesReq,
		callOptions?.thinkingLevel,
	);

	logger?.info({
		msg: "anthropic proxy: sending to openai responses api",
		model,
		inputCount: responsesReq.input.length,
		hasTools: !!responsesReq.tools,
		toolCount: responsesReq.tools?.length || 0,
	});

	const responsesUpstream = await loggedFetch(
		`${baseUrl}/responses`,
		{
			method: "POST",
			headers,
			body: JSON.stringify(responsesReq),
		},
		{
			logger,
			requestId,
			conversationId,
			service: "anthropic-proxy:upstream",
			readResponseBody: false,
		},
	);

	if (!responsesUpstream.ok) {
		const errorText = await responsesUpstream.text();
		if (
			endpointResolution.source !== "model" &&
			isResponsesEndpointUnsupported(responsesUpstream.status, errorText)
		) {
			logger?.warn({
				msg: "anthropic proxy: responses api unsupported, falling back to chat completions",
				status: responsesUpstream.status,
				error: errorText,
			});
			return null;
		}
		logger?.error({
			msg: "anthropic proxy: openai responses api error",
			status: responsesUpstream.status,
			error: errorText,
		});
		throw new Error(
			`OpenAI Responses API error: ${responsesUpstream.status} ${errorText}`.trim(),
		);
	}

	return translateResponsesToAnthropic(
		messageId,
		model,
		await responsesUpstream.json(),
	);
}

type OpenAIResponsesStreamAttemptParams = OpenAIResponsesAttemptParams & {
	res: Response;
};

/**
 * OpenAI Responses API 模板（流式）。
 * 返回 false 表示 responses endpoint 不受支持且允许回退（由调用方转 chat/completions）；
 * 其余情况（流成功或错误已写回客户端）返回 true。
 */
export async function streamOpenAIResponsesTemplate(
	params: OpenAIResponsesStreamAttemptParams,
): Promise<boolean> {
	const {
		model,
		anthropicReq,
		openaiMessages,
		baseUrl,
		headers,
		messageId,
		endpointResolution,
		res,
		logger,
		requestId,
		conversationId,
		callOptions,
	} = params;

	const estimatedInputTokens = estimateAnthropicInputTokens(anthropicReq);
	const responsesReq = toOpenAIResponsesRequest({
		model,
		anthropicReq,
		openaiMessages,
		tools: toOpenAIResponsesTools(anthropicReq),
		stream: true,
	});
	applyOpenAIResponsesReasoningControls(
		responsesReq,
		callOptions?.thinkingLevel,
	);

	logger?.info({
		msg: "anthropic proxy: streaming via openai responses api",
		model,
		inputCount: responsesReq.input.length,
		hasTools: !!responsesReq.tools,
		toolCount: responsesReq.tools?.length || 0,
	});

	const responsesUpstream = await loggedFetch(
		`${baseUrl}/responses`,
		{
			method: "POST",
			headers,
			body: JSON.stringify(responsesReq),
		},
		{
			logger,
			requestId,
			conversationId,
			service: "anthropic-proxy:upstream-stream",
			readResponseBody: false,
		},
	);

	if (!responsesUpstream.ok) {
		const errorText = await responsesUpstream.text();
		if (
			endpointResolution.source !== "model" &&
			isResponsesEndpointUnsupported(responsesUpstream.status, errorText)
		) {
			logger?.warn({
				msg: "anthropic proxy: streaming responses api unsupported, falling back to chat completions",
				status: responsesUpstream.status,
				error: errorText,
			});
			return false;
		}
		writeSseEvent(res, "error", {
			type: "error",
			error: humanizeUpstreamError(responsesUpstream.status, errorText),
		});
		res.end();
		return true;
	}

	await streamOpenAIResponsesToAnthropic({
		upstreamBody: responsesUpstream.body,
		upstreamContentType: String(
			responsesUpstream.headers.get("content-type") || "",
		),
		readJsonFallback: () => responsesUpstream.json(),
		res,
		messageId,
		model,
		estimatedInputTokens,
		logger,
		requestId,
	});
	return true;
}
