import { invoke } from "./tauriCompat";
import { listen } from "./tauriEventCompat";

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
				options.onComplete();
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
