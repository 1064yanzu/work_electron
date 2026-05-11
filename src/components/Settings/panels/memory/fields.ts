/**
 * panels/memory/fields.ts — `ai.memory` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "ai.memory",
		anchorId: "ai.memory.overview",
		label: "Agent 记忆",
		description: "查看 / 编辑 Agent 的长期记忆条目，按分类组织",
		keywords: ["memory", "记忆", "long-term", "长期", "知识"],
	},
];
