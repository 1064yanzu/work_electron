import {
	getOpenAICompatibleAuthHeaders,
	normalizeOpenAICompatibleBaseUrl,
} from "../../../llm/providerHttp";
import { isDeepSeekModel } from "../deepseekCompat";
import { translateToOpenAI } from "../openaiCompat";
import { getOpenAIEndpointResolution } from "../openaiResponsesCompat";
import type { AnthropicResponse } from "../types";
import { callOpenAIChatTemplate } from "./openaiChat";
import { streamOpenAIChatTemplate } from "./openaiChatStream";
import {
	callOpenAIResponsesTemplate,
	streamOpenAIResponsesTemplate,
} from "./openaiResponses";
import {
	normalizeMessagesForProvider,
	toOpenAICompatibleTools,
} from "./openaiShared";
import type {
	ProxyProviderAdapter,
	ProxyProviderCallParams,
	ProxyProviderStreamParams,
} from "./types";

/**
 * OpenAI 兼容模板（含 gemini 兼容网关等变体）：
 * 按 endpoint 解析结果优先走 Responses API，不支持时回退 chat/completions。
 */
async function callOpenAICompatible(
	params: ProxyProviderCallParams,
): Promise<AnthropicResponse> {
	const { provider, model, anthropicReq, messageId, logger } = params;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

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
	const openaiMessages = normalizeMessagesForProvider(
		provider,
		translateToOpenAI(anthropicReq, {
			preserveReasoningContent: isDeepSeekModel(model),
		}),
		logger,
	);

	const openaiTools = toOpenAICompatibleTools(anthropicReq);
	if (openaiTools?.length) {
		logger?.info({
			msg: "anthropic proxy: converting tools to OpenAI format",
			toolCount: anthropicReq.tools?.length || 0,
			toolNames: anthropicReq.tools?.map((t) => t.name) || [],
		});
	}

	const endpointResolution = getOpenAIEndpointResolution(provider, model);
	const endpointType = endpointResolution.type;

	if (endpointType === "responses") {
		const responsesResult = await callOpenAIResponsesTemplate({
			provider,
			model,
			anthropicReq,
			openaiMessages,
			baseUrl,
			headers,
			messageId,
			endpointResolution,
			logger,
			requestId: params.requestId,
			conversationId: params.conversationId,
			callOptions: params.callOptions,
		});
		if (responsesResult) return responsesResult;
	}

	return callOpenAIChatTemplate({
		provider,
		model,
		anthropicReq,
		openaiMessages,
		openaiTools,
		baseUrl,
		headers,
		messageId,
		logger,
		requestId: params.requestId,
		conversationId: params.conversationId,
		callOptions: params.callOptions,
	});
}

async function streamOpenAICompatible(
	params: ProxyProviderStreamParams,
): Promise<void> {
	const { provider, model, anthropicReq, messageId, res, logger } = params;

	// OpenAI-compatible: stream chat completions and translate to Anthropic SSE
	const openaiMessages = normalizeMessagesForProvider(
		provider,
		translateToOpenAI(anthropicReq, {
			preserveReasoningContent: isDeepSeekModel(model),
		}),
		logger,
	);
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
	const endpointResolution = getOpenAIEndpointResolution(provider, model);
	if (endpointResolution.type === "responses") {
		const handled = await streamOpenAIResponsesTemplate({
			provider,
			model,
			anthropicReq,
			openaiMessages,
			baseUrl,
			headers,
			messageId,
			endpointResolution,
			res,
			logger,
			requestId: params.requestId,
			conversationId: params.conversationId,
			callOptions: params.callOptions,
		});
		if (handled) return;
	}

	await streamOpenAIChatTemplate({
		provider,
		model,
		anthropicReq,
		openaiMessages,
		openaiTools,
		baseUrl,
		headers,
		messageId,
		res,
		logger,
		requestId: params.requestId,
		conversationId: params.conversationId,
		callOptions: params.callOptions,
	});
}

export const openaiCompatibleAdapter: ProxyProviderAdapter = {
	id: "openai-compatible",
	call: callOpenAICompatible,
	stream: streamOpenAICompatible,
};
