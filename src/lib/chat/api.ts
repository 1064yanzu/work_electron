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
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
}

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
}

/** 结构化 LLM 错误信息 */
export interface LlmErrorDetail {
	code: string;
	title: string;
	message: string;
	suggestion: string;
	httpStatus?: number;
	rawError: string;
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
	onError?: (error: string, detail?: LlmErrorDetail) => void;
	onUsage?: (usage: TokenUsage) => void; // Token 消耗回调
	/**
	 * 可选取消信号。abort 时会通过 IPC 通知主进程立即断开上游 SSE，
	 * 并停止派发后续 chunk。语义与 fetch 的 signal 一致。
	 */
	signal?: AbortSignal;
}

/**
 * 尝试从流式响应内容中解析结构化 LLM 错误
 * 后端会以 JSON 格式发送错误：{ __llm_error__: true, code, title, message, suggestion, ... }
 */
function tryParseStreamError(content: string): LlmErrorDetail | null {
	if (!content) return null;

	// 1. 尝试解析后端发送的结构化错误 JSON
	try {
		const parsed = JSON.parse(content);
		if (parsed?.__llm_error__ === true) {
			return {
				code: parsed.code || "unknown",
				title: parsed.title || "调用失败",
				message: parsed.message || "AI 服务调用时发生了意外错误。",
				suggestion: parsed.suggestion || "请重试或检查配置。",
				httpStatus: parsed.httpStatus,
				rawError: parsed.rawError || content,
			};
		}
	} catch {
		// 不是 JSON，继续检查其他模式
	}

	// 2. 兼容旧格式："Error: LLM call failed: 403 - ..." 等
	if (
		content.startsWith("Error:") ||
		content.startsWith("API 错误") ||
		content.startsWith("请求失败")
	) {
		return parseLegacyError(content);
	}

	return null;
}

/**
 * 解析旧格式的错误文本，生成友好的错误信息（前端兜底）
 */
function parseLegacyError(content: string): LlmErrorDetail {
	const lowerContent = content.toLowerCase();

	if (lowerContent.includes("403") || lowerContent.includes("forbidden")) {
		return {
			code: "auth_forbidden",
			title: "API 访问被拒绝",
			message:
				"API 服务商拒绝了此请求，可能是 API Key 无权限、已过期或账户被禁用。",
			suggestion: "请前往「设置 → AI 服务」检查 API Key 和账户状态。",
			httpStatus: 403,
			rawError: content,
		};
	}

	if (
		lowerContent.includes("401") ||
		lowerContent.includes("unauthorized") ||
		(lowerContent.includes("invalid") && lowerContent.includes("key"))
	) {
		return {
			code: "auth_unauthorized",
			title: "认证失败",
			message: "API Key 无效或未正确配置。",
			suggestion: "请前往「设置 → AI 服务」检查 API Key 是否正确填写。",
			httpStatus: 401,
			rawError: content,
		};
	}

	if (lowerContent.includes("429") || lowerContent.includes("rate limit")) {
		return {
			code: "rate_limit",
			title: "请求频率过高",
			message: "API 调用已超出速率限制。",
			suggestion: "请稍后再试，或考虑添加多个 API Key 进行轮询。",
			httpStatus: 429,
			rawError: content,
		};
	}

	if (lowerContent.includes("timeout") || lowerContent.includes("timed out")) {
		return {
			code: "timeout",
			title: "请求超时",
			message: "AI 服务响应时间过长。",
			suggestion: "请缩短内容后重试，或稍后再试。",
			rawError: content,
		};
	}

	if (
		lowerContent.includes("no enabled provider") ||
		lowerContent.includes("no provider")
	) {
		return {
			code: "no_provider",
			title: "未找到可用的 AI 服务",
			message: "没有找到已启用的 AI 服务商。",
			suggestion: "请前往「设置 → AI 服务」配置并启用至少一个 Provider。",
			rawError: content,
		};
	}

	return {
		code: "unknown",
		title: "调用失败",
		message: "AI 服务调用时发生了意外错误。",
		suggestion: "请重试或检查 Provider 配置。",
		rawError: content,
	};
}

/**
 * 将 LlmErrorDetail 格式化为用户友好的显示文本
 */
export function formatErrorForDisplay(detail: LlmErrorDetail): string {
	return `**${detail.title}**\n\n${detail.message}\n\n💡 ${detail.suggestion}`;
}

function generateStreamId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 流式调用 LLM
 *
 * 若 options.signal 提供：abort 时会 IPC 通知主进程立即断开上游 SSE，
 * 并停止派发后续 chunk；done 事件仍会触发 onComplete 来收尾 UI 状态。
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
		signal,
	} = options;

	// 如果有系统提示词，将其添加到 prompt 前面
	const fullPrompt = systemPrompt
		? `${systemPrompt}\n\n用户请求：${prompt}`
		: prompt;

	const streamId = generateStreamId();
	let unlisten: UnlistenFn | null = null;
	let cancelled = false;
	let abortHandler: (() => void) | null = null;

	const detachAbort = () => {
		if (abortHandler && signal) {
			signal.removeEventListener("abort", abortHandler);
			abortHandler = null;
		}
	};

	if (signal) {
		if (signal.aborted) {
			cancelled = true;
		} else {
			abortHandler = () => {
				cancelled = true;
				void invoke("invoke_llm_stream_cancel", { streamId }).catch(() => {});
			};
			signal.addEventListener("abort", abortHandler, { once: true });
		}
	}

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
						cacheReadInputTokens: chunk.usage.cache_read_input_tokens,
						cacheCreationInputTokens: chunk.usage.cache_creation_input_tokens,
					});
				}

				// 尝试解析结构化错误
				const errorDetail = tryParseStreamError(chunk.content);
				if (errorDetail) {
					console.error(
						"[LLM Stream] 收到错误:",
						errorDetail.title,
						errorDetail.rawError,
					);
					const displayError = formatErrorForDisplay(errorDetail);
					onError?.(displayError, errorDetail);
				} else {
					onComplete?.();
				}
				unlisten?.();
				detachAbort();
			} else if (chunk.content) {
				if (cancelled) return;
				if (chunk.channel === "thought") {
					onThoughtChunk?.(chunk.content, chunk.thoughtMeta);
				} else {
					onChunk?.(chunk.content);
				}
			}
		});

		// 启动流式调用
		await invoke("invoke_llm_stream", {
			payload: {
				model,
				prompt: fullPrompt,
				context,
				temperature,
				streamId,
			},
		});

		// 若用户在 invoke 完成前已经 abort，立即让主进程取消（处理竞态）
		if (cancelled) {
			void invoke("invoke_llm_stream_cancel", { streamId }).catch(() => {});
		}
	} catch (error) {
		console.error("LLM 调用失败:", error);
		unlisten?.();
		detachAbort();

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
					if (cancelled) return;
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
			// 回退也失败了，尝试解析错误
			const errorStr = String(fallbackError);
			const errorDetail = parseLegacyError(errorStr);
			const displayError = formatErrorForDisplay(errorDetail);
			onError?.(displayError, errorDetail);
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
