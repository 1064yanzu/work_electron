/** Provider 类型 */
export type ProviderType =
	| "openai"
	| "anthropic"
	| "deepseek"
	| "ollama"
	| "dify"
	| "custom";

export interface Provider {
	id: string;
	name: string;
	provider_type: ProviderType;
	is_enabled: boolean;
	api_key?: string;
	api_base?: string;
	models: string[];
	metadata: Record<string, unknown>;
	template_id?: string;
	created_at: number;
	updated_at: number;
}

export interface StreamChunk {
	content: string;
	done: boolean;
	channel?: "text" | "thought";
	/**
	 * 标识当前 chunk 所属的流。多个并发流共享 `llm-stream-chunk` 通道，
	 * 渲染端凭此过滤，避免不同 stream 的 chunk 互相串扰。
	 * 缺省（旧调用方未传 streamId 时）保持兼容：渲染端会按"无主"处理。
	 */
	streamId?: string;
	thoughtMeta?: {
		title?: string;
		source?: string;
		model?: string;
		phase?: string;
		durationMs?: number;
	};
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
}

export interface LlmCallOptions {
	model: string;
	prompt: string;
	context?: string[];
	temperature?: number;
	/** 流式调用专用：渲染端可凭此 id 主动取消 */
	streamId?: string;
}

export interface LlmCallResult {
	content: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
}

export interface ImageGenerationOptions {
	model: string;
	prompt: string;
	n?: number; // 生成数量，默认 1
	size?: string; // 尺寸，如 "1024x1024"
	quality?: string; // "standard" | "hd"
	style?: string; // "vivid" | "natural"
	// 高级参数（参考 Cherry Studio）
	negativePrompt?: string; // 负向提示词
	seed?: number; // 随机种子
	numInferenceSteps?: number; // 推理步数
	guidanceScale?: number; // 引导比例 (CFG Scale)
	promptEnhancement?: boolean; // 提示词增强
}

export interface ImageGenerationResult {
	images: Array<{
		url?: string;
		base64?: string;
		revised_prompt?: string;
	}>;
	model: string;
}
