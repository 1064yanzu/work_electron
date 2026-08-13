// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：llm（共 7 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type { InvokeLlmPayload, InvokeLlmResult } from "./common";

export interface LlmIpcSchema {
	// ==================
	// LLM 命令
	// ==================
	invoke_llm: {
		input: InvokeLlmPayload;
		output: InvokeLlmResult;
	};
	invoke_llm_stream: {
		input: InvokeLlmPayload;
		output: { started: boolean };
	};
	/**
	 * 取消进行中的 LLM 流式调用，立即 abort 上游 SSE 连接。
	 * - streamId 提供：取消该 id 对应的流；不存在时返回 cancelled=false。
	 * - cancelAll=true：取消所有进行中的流。
	 */
	invoke_llm_stream_cancel: {
		input: { streamId?: string; cancelAll?: boolean };
		output: { cancelled: boolean; count: number };
	};
	invoke_image_generation: {
		input: {
			model: string;
			prompt: string;
			n?: number;
			size?: string;
			quality?: string;
			style?: string;
			// 高级参数
			negativePrompt?: string;
			seed?: number;
			numInferenceSteps?: number;
			guidanceScale?: number;
			promptEnhancement?: boolean;
		};
		output: {
			images: Array<{
				url?: string;
				base64?: string;
				revised_prompt?: string;
			}>;
			model: string;
		};
	};

	// ==================
	// 生图配置管理
	// ==================
	get_image_gen_config: {
		input: {};
		output: {
			providerId: string;
			model: string;
			defaultSize: string;
			promptTemplate: string;
			negativePrompt?: string;
			quality?: string;
			style?: string;
		};
	};
	set_image_gen_config: {
		input: {
			providerId?: string;
			model?: string;
			defaultSize?: string;
			promptTemplate?: string;
			negativePrompt?: string;
			quality?: string;
			style?: string;
		};
		output: { success: boolean };
	};
	generate_image_for_text: {
		input: {
			text: string;
			overrides?: {
				providerId?: string;
				model?: string;
				defaultSize?: string;
				promptTemplate?: string;
				negativePrompt?: string;
			};
		};
		output: {
			images: Array<{
				imageUrl: string;
				revisedPrompt?: string;
			}>;
			model: string;
		};
	};
}
