// LLM 调用工具

import { invokeLlmWithCallback } from "../../chat/api";
import { settingsStore } from "../../settingsStore";
import {
	createArtifact,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
} from "../types";

export const llmCallTool: ToolDefinition = {
	type: "llm_call",
	name: "AI 分析",
	description: "调用 AI 模型进行分析、总结或生成内容",
	icon: "Sparkles",
	inputSchema: {
		type: "object",
		properties: {
			prompt: { type: "string", description: "提示词" },
			systemPrompt: { type: "string", description: "系统提示词（可选）" },
			context: {
				type: "array",
				items: { type: "string" },
				description: "上下文内容",
			},
			model: {
				type: "string",
				description: "模型名称（可选，使用当前激活模型）",
			},
		},
		required: ["prompt"],
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { prompt, systemPrompt, context: rawContext, model } = input;
		const contextTexts = Array.isArray(rawContext)
			? rawContext
			: typeof rawContext === "string" && rawContext.trim()
				? [rawContext]
				: [];

		if (!prompt) {
			return { success: false, error: "提示词不能为空" };
		}

		// 获取当前激活的模型
		const activeModel = model || settingsStore.getActiveModel();
		if (!activeModel) {
			return { success: false, error: "请先配置并选择一个模型" };
		}

		try {
			context.onProgress?.(10, "正在调用 AI...");

			let accumulatedContent = "";
			let error: string | undefined;

			await new Promise<void>((resolve, reject) => {
				invokeLlmWithCallback({
					model: activeModel,
					prompt,
					systemPrompt,
					context: contextTexts,
					onChunk: (chunk: string) => {
						accumulatedContent += chunk;
						// 计算进度（基于内容长度，最大 90%）
						const progress = Math.min(10 + accumulatedContent.length / 100, 90);
						context.onProgress?.(progress, "正在生成...");
					},
					onComplete: () => {
						context.onProgress?.(100, "生成完成");
						resolve();
					},
					onError: (err: string) => {
						error = err;
						reject(new Error(err));
					},
				});
			});

			if (error) {
				return { success: false, error };
			}

			// 创建 artifact
			const artifact = createArtifact(
				"text",
				"AI 分析结果",
				accumulatedContent,
			);

			return {
				success: true,
				data: {
					content: accumulatedContent,
					model: activeModel,
					promptLength: prompt.length,
					responseLength: accumulatedContent.length,
				},
				artifacts: [artifact],
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : "AI 调用失败",
			};
		}
	},
};
