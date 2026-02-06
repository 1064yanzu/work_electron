// AI 聊天 API 封装
import { invoke } from "../tauriCompat";
import { listen, type UnlistenFn } from "../tauriEventCompat";

export interface StreamChunk {
	content: string;
	done: boolean;
	channel?: "text" | "thought";
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
	};
}

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface LlmCallOptions {
	model: string;
	prompt: string;
	systemPrompt?: string; // 系统提示词（用于设定 AI 行为）
	context?: string[];
	temperature?: number;
	onChunk?: (chunk: string) => void;
	onThoughtChunk?: (chunk: string, meta?: StreamChunk["thoughtMeta"]) => void;
	onComplete?: () => void;
	onError?: (error: string) => void;
	onUsage?: (usage: TokenUsage) => void; // Token 消耗回调
}

/**
 * 流式调用 LLM
 */
export async function invokeLlmWithCallback(
	options: LlmCallOptions,
): Promise<void> {
	const {
		model,
		prompt,
		systemPrompt,
		context = [],
		temperature = 0.7,
		onChunk,
		onThoughtChunk,
		onComplete,
		onError,
		onUsage,
	} = options;

	// 如果有系统提示词，将其添加到 prompt 前面
	const fullPrompt = systemPrompt
		? `${systemPrompt}\n\n用户请求：${prompt}`
		: prompt;

	let unlisten: UnlistenFn | null = null;

	try {
		// 先设置监听器
		unlisten = await listen<StreamChunk>("llm-stream-chunk", (event) => {
			const chunk = event.payload;
			if (chunk.done) {
				// 处理 usage 数据
				if (chunk.usage) {
					console.log("[LLM Stream] 收到 usage:", chunk.usage);
					onUsage?.({
						promptTokens: chunk.usage.prompt_tokens,
						completionTokens: chunk.usage.completion_tokens,
						totalTokens: chunk.usage.total_tokens,
					});
				}

				// 检查是否是错误响应（后端在 API 错误时会在 content 中发送错误信息）
				if (
					chunk.content &&
					(chunk.content.startsWith("API 错误") ||
						chunk.content.startsWith("请求失败") ||
						chunk.content.includes("Unauthorized") ||
						chunk.content.includes("无效的令牌") ||
						chunk.content.includes("API key") ||
						chunk.content.includes("authentication"))
				) {
					console.error("[LLM Stream] 收到错误响应:", chunk.content);
					onError?.(chunk.content);
				} else {
					onComplete?.();
				}
				unlisten?.();
			} else if (chunk.content) {
				if (chunk.channel === "thought") {
					onThoughtChunk?.(chunk.content, chunk.thoughtMeta);
				} else {
					onChunk?.(chunk.content);
				}
			}
		});

		// 启动流式调用
		await invoke("invoke_llm_stream", {
			payload: { model, prompt: fullPrompt, context, temperature },
		});
	} catch (error) {
		console.error("LLM 调用失败:", error);
		unlisten?.();

		// 如果流式失败，回退到非流式
		try {
			const response = await invoke<{ content: string }>("invoke_llm", {
				payload: { model, prompt: fullPrompt, context, temperature },
			});

			if (response.content) {
				// 模拟流式输出
				const content = response.content;
				let index = 0;
				const chunkSize = 15;

				const outputChunk = () => {
					if (index < content.length) {
						onChunk?.(content.slice(index, index + chunkSize));
						index += chunkSize;
						setTimeout(outputChunk, 15);
					} else {
						onComplete?.();
					}
				};
				outputChunk();
			} else {
				onComplete?.();
			}
		} catch (fallbackError) {
			onError?.(String(fallbackError));
		}
	}
}

/**
 * 非流式调用 LLM
 */
export async function invokeLlm(options: {
	model: string;
	prompt: string;
	context?: string[];
	temperature?: number;
}): Promise<string> {
	const { model, prompt, context = [], temperature = 0.7 } = options;

	const response = await invoke<{ content: string }>("invoke_llm", {
		payload: { model, prompt, context, temperature },
	});

	return response.content;
}
