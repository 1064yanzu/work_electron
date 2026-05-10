/**
 * fields.ts — ai.models 面板可搜索字段声明
 *
 * Phase 4 · 对应 tasks.md 4.8 / R7.2 / R7.3。
 * 每条 `anchorId` 对应面板内实际渲染时用 `settingsAnchorProps(anchorId)`
 * 挂载的 DOM 节点，保证 `SettingsSearch` 能 scrollIntoView + 1.2s 高亮命中。
 */
import type { FieldDescriptor } from "../../../fieldRegistry";

export const FIELDS: readonly FieldDescriptor[] = [
	{
		tabId: "ai.models",
		anchorId: "ai.models.providerList",
		label: "服务商列表",
		description: "启用 / 新增 / 切换模型服务商",
		keywords: ["provider", "服务商", "平台", "厂商"],
	},
	{
		tabId: "ai.models",
		anchorId: "ai.models.apiKey",
		label: "API 密钥",
		description: "当前服务商的 API Key，支持多密钥以逗号或换行分隔",
		keywords: [
			"api",
			"apikey",
			"api key",
			"key",
			"token",
			"密钥",
			"sk-",
		],
	},
	{
		tabId: "ai.models",
		anchorId: "ai.models.apiBase",
		label: "API 地址",
		description: "自定义 API Base URL（可选）",
		keywords: ["base", "base url", "endpoint", "api base", "地址"],
	},
	{
		tabId: "ai.models",
		anchorId: "ai.models.endpointType",
		label: "端点类型",
		description: "兼容型 / Responses — OpenAI 兼容服务商可用，属于高级选项",
		keywords: [
			"endpoint",
			"端点",
			"chat completions",
			"responses",
			"兼容型",
		],
	},
	{
		tabId: "ai.models",
		anchorId: "ai.models.models",
		label: "模型列表",
		description: "管理当前服务商下的模型：添加 / 删除 / 同步 / 测试连接",
		keywords: ["models", "model", "模型", "gpt", "claude", "gemini"],
	},
] as const;
