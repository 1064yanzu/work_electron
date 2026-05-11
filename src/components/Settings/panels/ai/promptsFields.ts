/**
 * panels/ai/promptsFields.ts — `ai.prompts` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const PROMPTS_FIELDS: FieldDescriptor[] = [
	{
		tabId: "ai.prompts",
		anchorId: "ai.prompts.titleGeneration",
		label: "会话标题生成模板",
		description: "对话首条消息后自动生成简短标题的提示词模板",
		keywords: ["title", "prompt", "模板", "标题", "提示词"],
	},
];
