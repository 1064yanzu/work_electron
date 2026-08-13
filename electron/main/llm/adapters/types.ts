import type { LlmCallResult, Provider, StreamChunk } from "../types";

export interface LlmAdapterCallOptions {
	provider: Provider;
	model: string;
	prompt: string;
	apiKey: string | undefined;
	context?: string[];
	temperature?: number;
}

export interface LlmAdapterStreamOptions extends LlmAdapterCallOptions {
	signal?: AbortSignal;
	onChunk: (
		text: string,
		channel?: "text" | "thought",
		thoughtMeta?: StreamChunk["thoughtMeta"],
	) => void;
}

export interface LlmAdapterStreamResult {
	usage?: StreamChunk["usage"];
}

/** 统一的 LLM Provider 适配器接口：新增 Provider 实现该接口并在 registry 注册即可 */
export interface LlmProviderAdapter {
	id: string;
	call(opts: LlmAdapterCallOptions): Promise<LlmCallResult>;
	callStream(opts: LlmAdapterStreamOptions): Promise<LlmAdapterStreamResult>;
}
