import { invoke } from "./tauriCompat";
import { listen } from "./tauriEventCompat";
import { formatErrorForDisplay, type LlmErrorDetail } from "./chat/api";

export interface StreamOptions {
	onChunk: (chunk: string) => void;
	onComplete: () => void;
	onError: (error: string) => void;
}

interface StreamChunk {
	content: string;
	done: boolean;
	channel?: "text" | "thought";
}

/**
 * 尝试从流式内容中解析结构化 LLM 错误
 */
function tryParseErrorContent(content: string): LlmErrorDetail | null {
	if (!content) return null;
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
		// 不是 JSON
	}
	return null;
}

/**
 * 真实的流式响应（基于 Tauri 事件）
 */
export async function streamLLMResponse(
	model: string,
	prompt: string,
	context: string[],
	options: StreamOptions,
) {
	let unlisten: (() => void) | null = null;

	try {
		// 监听流式事件
		unlisten = await listen<StreamChunk>("llm-stream-chunk", (event) => {
			const chunk = event.payload;

			if (chunk.done) {
				// 检查是否是结构化错误
				const errorDetail = tryParseErrorContent(chunk.content);
				if (errorDetail) {
					options.onError(formatErrorForDisplay(errorDetail));
				} else {
					options.onComplete();
				}
				if (unlisten) unlisten();
			} else {
				options.onChunk(chunk.content);
			}
		});

		// 启动流式调用
		await invoke("invoke_llm_stream", {
			payload: {
				model,
				prompt,
				context,
				temperature: 0.7,
			},
		});
	} catch (error) {
		options.onError(String(error));
		if (unlisten) unlisten();
	}
}

/**
 * 取消流式响应
 */
export function cancelStream() {
	// 通过事件系统取消
	console.log("Stream cancelled");
}
