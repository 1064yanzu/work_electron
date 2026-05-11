/**
 * panels/agent/fields.ts — `ai.agent` 面板可搜索字段声明
 *
 * 与 AgentSettings.tsx 内的子区段对齐。锚点 id 命名：
 *   `ai.agent.<section>.<field>`，跟 SettingsDisclosure id 同前缀。
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "ai.agent",
		anchorId: "ai.agent.scenarios",
		label: "Agent 模型场景",
		description: "为不同场景指定不同模型（编码、研究、写作 …）",
		keywords: ["scenario", "场景", "模型", "switching"],
	},
	{
		tabId: "ai.agent",
		anchorId: "ai.agent.sdk.runtime",
		label: "Claude Agent SDK 运行时",
		description: "交互审批、兼容模式、permission mode、插件路径",
		keywords: ["sdk", "interactive", "permission", "plugin", "运行时"],
	},
	{
		tabId: "ai.agent",
		anchorId: "ai.agent.context.runtime",
		label: "上下文治理",
		description: "上下文裁剪策略、运行预算、上下文预算、多 Agent 协作",
		keywords: [
			"context",
			"policy",
			"budget",
			"max_turns",
			"thinking",
			"token",
			"上下文",
			"预算",
			"多智能体",
			"multi-agent",
			"teammate",
		],
	},
	{
		tabId: "ai.agent",
		anchorId: "ai.agent.permission.policy",
		label: "工具权限策略",
		description: "按风险等级控制 Agent 调用工具的默认行为",
		keywords: ["permission", "权限", "工具", "L0", "L1", "L2", "auto_approve"],
	},
	{
		tabId: "ai.agent",
		anchorId: "ai.agent.session.persistence",
		label: "会话持久化与回放",
		description: "落库、回放、Trace、blocks 优先渲染、回放条数",
		keywords: ["replay", "persist", "trace", "回放", "落库", "持久化"],
	},
	{
		tabId: "ai.agent",
		anchorId: "ai.agent.kb.retrieval",
		label: "资料库检索",
		description: "FTS / 向量 / 混合检索模式与 Embedding 模型",
		keywords: [
			"kb",
			"知识库",
			"向量",
			"embedding",
			"FTS",
			"混合",
			"vector",
			"retrieval",
			"检索",
		],
	},
];
