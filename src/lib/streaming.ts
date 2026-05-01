import { invoke } from "./tauriCompat";
import { listen } from "./tauriEventCompat";
import { formatErrorForDisplay, type LlmErrorDetail } from "./chat/api";

export interface StreamOptions {
	onChunk: (chunk: string) => void;
	onComplete: () => void;
	onError: (error: string) => void;
	/** 可选：调用方提供的 streamId；缺省时由本函数生成并通过返回值暴露 */
	streamId?: string;
}

export interface StreamHandle {
	/** 本次流的 streamId，可用于后续 cancelStream */
	streamId: string;
	/** 取消本次流；幂等。会通过主进程 abort 上游 SSE 并触发 done 事件 */
	cancel: () => Promise<void>;
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
 * 真实的流式响应（基于 Tauri 事件）
 *
 * 返回 StreamHandle，调用方可以在会话切换/组件卸载时调用 cancel() 主动断流，
 * 防止上游 SSE 连接堆叠以及主进程闭包持留。
 */
export async function streamLLMResponse(
	model: string,
	prompt: string,
	context: string[],
	options: StreamOptions,
): Promise<StreamHandle> {
	const streamId = options.streamId || generateStreamId();
	let unlisten: (() => void) | null = null;
	let cancelled = false;
	let finished = false;

	const cleanup = () => {
		if (unlisten) {
			unlisten();
			unlisten = null;
		}
	};

	try {
		// 监听流式事件
		unlisten = await listen<StreamChunk>("llm-stream-chunk", (event) => {
			const chunk = event.payload;

			if (chunk.done) {
				finished = true;
				// 检查是否是结构化错误
				const errorDetail = tryParseErrorContent(chunk.content);
				if (errorDetail) {
					options.onError(formatErrorForDisplay(errorDetail));
				} else {
					options.onComplete();
				}
				cleanup();
			} else {
				if (cancelled) return;
				options.onChunk(chunk.content);
			}
		});

		// 启动流式调用
		await invoke("invoke_llm_stream", {
			model,
			prompt,
			context,
			temperature: 0.7,
			streamId,
		});
	} catch (error) {
		options.onError(String(error));
		cleanup();
	}

	return {
		streamId,
		cancel: async () => {
			if (cancelled || finished) return;
			cancelled = true;
			try {
				await invoke("invoke_llm_stream_cancel", { streamId });
			} catch {
				// 即使主进程已经清理掉也不算错
			}
			cleanup();
		},
	};
}

/**
 * 一次性取消所有进行中的 LLM 流式请求。
 * 用于窗口/Workspace 切换等需要"清场"的场景。
 */
export async function cancelAllStreams(): Promise<number> {
	try {
		const res = await invoke<{ cancelled: boolean; count: number }>(
			"invoke_llm_stream_cancel",
			{ cancelAll: true },
		);
		return res.count;
	} catch {
		return 0;
	}
}

/**
 * @deprecated 使用 streamLLMResponse 返回的 StreamHandle.cancel() 替代。
 * 保留此函数避免破坏既有调用点。
 */
export function cancelStream() {
	void cancelAllStreams();
}
