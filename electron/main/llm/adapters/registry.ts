import type { Provider, ProviderType } from "../types";
import { anthropicAdapter } from "./anthropic";
import { ollamaAdapter } from "./ollama";
import { openaiCompatibleAdapter } from "./openaiCompatible";
import { openaiResponsesAdapter } from "./openaiResponses";
import type { LlmProviderAdapter } from "./types";

/** 判断 provider 是否配置了 OpenAI Responses API 端点 */
function getOpenAIEndpointTypeForModel(
	provider: Provider,
	model: string,
): "chat_completions" | "responses" {
	const modelEndpointTypes =
		provider.metadata?.model_endpoint_types &&
		typeof provider.metadata.model_endpoint_types === "object" &&
		!Array.isArray(provider.metadata.model_endpoint_types)
			? (provider.metadata.model_endpoint_types as Record<string, unknown>)
			: null;
	const modelEndpointType = modelEndpointTypes?.[model];
	if (modelEndpointType === "responses") return "responses";
	if (modelEndpointType === "chat_completions") return "chat_completions";
	return provider.metadata?.openai_endpoint_type === "responses"
		? "responses"
		: "chat_completions";
}

function isResponsesEndpoint(provider: Provider, model: string): boolean {
	return getOpenAIEndpointTypeForModel(provider, model) === "responses";
}

type LlmAdapterResolver = (
	provider: Provider,
	model: string,
) => LlmProviderAdapter;

const resolveOpenAIStyleAdapter: LlmAdapterResolver = (provider, model) =>
	isResponsesEndpoint(provider, model)
		? openaiResponsesAdapter
		: openaiCompatibleAdapter;

/** deepseek/dify/custom 均走 OpenAI 兼容协议（与既有分发行为一致） */
const adapterResolvers: Record<ProviderType, LlmAdapterResolver> = {
	openai: resolveOpenAIStyleAdapter,
	anthropic: () => anthropicAdapter,
	deepseek: resolveOpenAIStyleAdapter,
	ollama: () => ollamaAdapter,
	dify: resolveOpenAIStyleAdapter,
	custom: resolveOpenAIStyleAdapter,
};

export function resolveLlmAdapter(
	provider: Provider,
	model: string,
): LlmProviderAdapter {
	const resolver =
		adapterResolvers[provider.provider_type] ?? resolveOpenAIStyleAdapter;
	return resolver(provider, model);
}
