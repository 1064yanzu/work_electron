/**
 * panels/memory/fields.ts — `ai.memory` 面板可搜索字段声明
 *
 * 重构后记忆面板从"条目 CRUD"变成"上下文文件全景"，搜索关键词覆盖
 * SOUL / USER / MEMORY 三件套以及 SDK 自动加载的 CLAUDE.md / AGENTS.md。
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "ai.memory",
		anchorId: "ai.memory.overview",
		label: "Agent 记忆",
		description: "管理 SOUL/USER/MEMORY 三件套与 SDK 自动加载的 CLAUDE.md / AGENTS.md",
		keywords: [
			"memory",
			"记忆",
			"long-term",
			"长期",
			"SOUL",
			"USER",
			"MEMORY",
			"灵魂",
			"人格",
			"CLAUDE.md",
			"AGENTS.md",
			"上下文",
		],
	},
];
