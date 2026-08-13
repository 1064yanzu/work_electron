/**
 * Provider 调用入口（薄壳）
 *
 * 具体模板实现在 providers/ 下（每个模板一个适配器文件，
 * 由 providers/registry.ts 按 provider_type 查表分发）。
 */
import type { Response } from "express";
import type { Logger } from "../../logging/types";
import { resolveProxyProviderAdapter } from "./providers/registry";
import type { ProviderCallOptions } from "./providers/types";
import type {
	AnthropicRequest,
	AnthropicResponse,
	ProviderConfig,
} from "./types";

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

	return resolveProxyProviderAdapter(provider).call({
		provider,
		model,
		anthropicReq,
		messageId,
		logger,
		requestId,
		conversationId,
		callOptions,
	});
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

	return resolveProxyProviderAdapter(provider).stream({
		provider,
		model,
		anthropicReq,
		messageId,
		res,
		logger,
		requestId,
		conversationId,
		callOptions,
	});
}
