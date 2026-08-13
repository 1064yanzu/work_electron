/**
 * FIELDS — AI 与模型 · 默认分工 面板的可搜索字段清单
 *
 * 与 `DefaultsPanel.tsx` 内渲染的 `data-settings-anchor` 一一对应。
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "ai.defaults",
		anchorId: "ai.defaults.model.title",
		label: "会话标题生成模型",
		description: "自动根据对话内容生成简短标题的默认模型。",
		keywords: ["title", "title_generation_model", "标题", "会话标题", "生成"],
	},
	{
		tabId: "ai.defaults",
		anchorId: "ai.defaults.model.image",
		label: "图像信息提取模型",
		description: "图片导入后的信息提取与结构化整理使用的模型。",
		keywords: [
			"image",
			"image_extraction_model",
			"图像",
			"图片",
			"提取",
			"ocr",
		],
	},
	{
		tabId: "ai.defaults",
		anchorId: "ai.defaults.model.skill",
		label: "Skill 执行模型",
		description: "Agent 执行技能（skill_llm_model）时优先使用的模型。",
		keywords: ["skill", "skill_llm_model", "技能", "skills", "Agent"],
	},
	{
		tabId: "ai.defaults",
		anchorId: "ai.defaults.search.strategy",
		label: "搜索优先级",
		description: "本地搜索与 MCP 搜索的回退顺序。",
		keywords: [
			"search",
			"search_strategy",
			"策略",
			"local_first",
			"mcp_first",
			"搜索",
		],
	},
	{
		tabId: "ai.defaults",
		anchorId: "ai.defaults.search.provider",
		label: "MCP 搜索引擎",
		description: "当策略选择 MCP 时使用的具体工具（Tavily / Exa）。",
		keywords: ["mcp", "tavily", "exa", "search_provider", "搜索引擎"],
	},
];
