import type { Response } from "express";
import type { Logger } from "../../../logging/types";
import type { IpoThinkingLevelMarker } from "../ipoMarkers";
import type {
	AnthropicRequest,
	AnthropicResponse,
	OpenAIChatMessage,
	ProviderConfig,
} from "../types";

export type ProviderCallOptions = {
	anthropicBeta?: string;
	thinkingLevel?: IpoThinkingLevelMarker | null;
};

export type OpenAIReasoningEffort = "low" | "medium" | "high";

export type OpenAIChatCompletionRequest = {
	model: string;
	messages: OpenAIChatMessage[];
	temperature: number;
	max_tokens: number;
	tools?: any[];
	tool_choice?: "auto";
	stream: boolean;
	reasoning_effort?: OpenAIReasoningEffort;
	extra_body?: Record<string, unknown>;
	thinking?: { type: "disabled" };
};

export interface ProxyProviderCallParams {
	provider: ProviderConfig;
	model: string;
	anthropicReq: AnthropicRequest;
	messageId: string;
	logger?: Logger;
	requestId?: string;
	conversationId?: string;
	callOptions?: ProviderCallOptions;
}

export interface ProxyProviderStreamParams extends ProxyProviderCallParams {
	res: Response;
}

/** 统一的代理 Provider 适配器接口：新增模板实现该接口并在 registry 注册即可 */
export interface ProxyProviderAdapter {
	id: string;
	call(params: ProxyProviderCallParams): Promise<AnthropicResponse>;
	stream(params: ProxyProviderStreamParams): Promise<void>;
}
