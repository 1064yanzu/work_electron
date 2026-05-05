/**
 * Agent Model Scenario Configuration
 * 用户可配置的模型场景系统
 *
 * 设计理念:
 * 1. 用户完全自主决定使用什么模型
 * 2. 用户在设置中配置模型和场景的映射
 * 3. 运行时主模型根据场景选择对应的模型
 * 4. 子代理调用用户配置的模型
 */

/**
 * 预定义的场景类型
 */
export type AgentScenario =
	| "default" // 默认/主对话
	| "fast_search" // 快速搜索
	| "code_review" // 代码审查
	| "deep_analysis" // 深度分析
	| "writing" // 写作润色
	| "translation" // 翻译
	| "data_processing" // 数据处理
	| "debugging" // 调试
	| "custom"; // 自定义

export type MultiAgentMode = "subagent_only" | "hybrid" | "teammate_preferred";

export type TeammateSpawnMode = "auto" | "tmux" | "in-process";

/**
 * 场景描述
 */
export const SCENARIO_LABELS: Record<AgentScenario, string> = {
	default: "默认对话",
	fast_search: "快速搜索",
	code_review: "代码审查",
	deep_analysis: "深度分析",
	writing: "写作润色",
	translation: "翻译",
	data_processing: "数据处理",
	debugging: "调试排错",
	custom: "自定义",
};

export const SCENARIO_DESCRIPTIONS: Record<AgentScenario, string> = {
	default: "主对话使用的模型,平衡性能和成本",
	fast_search: "快速文件搜索、简单问答,推荐使用快速便宜的模型",
	code_review: "代码审查、质量检查,推荐使用中等强度模型",
	deep_analysis: "复杂分析、架构设计,推荐使用最强模型",
	writing: "文章写作、内容润色",
	translation: "多语言翻译",
	data_processing: "数据提取、格式转换",
	debugging: "错误排查、问题定位",
	custom: "用户自定义场景",
};

/**
 * 场景模型配置
 */
export interface ScenarioModelConfig {
	/** 场景类型 */
	scenario: AgentScenario;
	/** 自定义场景名称(仅当scenario='custom'时使用) */
	customName?: string;
	/** 对应的模型ID(来自用户配置的模型列表) */
	modelId: string;
	/** 模型所属的provider ID */
	providerId: string;
	/** 是否启用此场景 */
	enabled: boolean;
	/** 场景触发关键词(可选,用于自动匹配) */
	triggerKeywords?: string[];
}

/**
 * Agent模型配置(保存到设置)
 */
export interface AgentModelSettings {
	/** 默认模型ID */
	defaultModelId: string;
	/** 默认模型的provider ID */
	defaultProviderId: string;
	/** 场景模型配置列表 */
	scenarioConfigs: ScenarioModelConfig[];
	/** 是否启用智能场景切换(让AI根据任务自动选择场景) */
	enableSmartScenarioSwitch: boolean;
	/** 上下文压缩配置 */
	contextCompression?: {
		enabled: boolean;
		/** 触发压缩的Token阈值 (默认 20000) */
		threshold: number;
		/** 压缩策略: 'summary' (摘要) | 'selection' (筛选关键信息) */
		strategy: "summary" | "selection";
	};
	/** 运行时上下文治理配置 */
	contextRuntime?: {
		contextPolicy: "balanced" | "strict" | "aggressive";
		subagentContextMode: "capsule" | "inherit";
		maxTurns: number;
		maxThinkingTokens: number;
		maxBudgetUsd?: number;
		settingSources: Array<"user" | "project" | "local">;
		enableToolSearch: "auto" | "auto:5" | "true" | "false";
		contextBudget: {
			maxContextChars: number;
			maxFiles: number;
			maxFileChars: number;
		};
		betas: string[];
		experimentalMultiAgentEnabled: boolean;
		multiAgentMode: MultiAgentMode;
		maxTeammates: number;
		teammateMode: TeammateSpawnMode;
		teammateBudget: {
			maxTurns: number;
			maxThinkingTokens: number;
			maxBudgetUsd?: number;
		};
		leaderSummaryModel?: string;
		teammateExecutionModel?: string;
	};
}

/**
 * 默认配置
 */
export const DEFAULT_AGENT_MODEL_SETTINGS: AgentModelSettings = {
	defaultModelId: "",
	defaultProviderId: "",
	scenarioConfigs: [],
	enableSmartScenarioSwitch: false,
	contextCompression: {
		enabled: false,
		threshold: 30000,
		strategy: "summary",
	},
	contextRuntime: {
		contextPolicy: "balanced",
		subagentContextMode: "capsule",
		maxTurns: 100,
		maxThinkingTokens: 8192,
		maxBudgetUsd: undefined,
		settingSources: ["user", "project"],
		enableToolSearch: "auto:5",
		contextBudget: {
			maxContextChars: 16000,
			maxFiles: 12,
			maxFileChars: 6000,
		},
		betas: [],
		experimentalMultiAgentEnabled: false,
		multiAgentMode: "hybrid",
		maxTeammates: 2,
		teammateMode: "auto",
		teammateBudget: {
			maxTurns: 40,
			maxThinkingTokens: 4096,
			maxBudgetUsd: undefined,
		},
		leaderSummaryModel: undefined,
		teammateExecutionModel: undefined,
	},
};

/**
 * 根据场景获取模型配置
 */
export function getModelForScenario(
	settings: AgentModelSettings,
	scenario: AgentScenario,
	customName?: string,
): { modelId: string; providerId: string } | null {
	// 查找匹配的场景配置
	const config = settings.scenarioConfigs.find((c) => {
		if (!c.enabled) return false;
		if (scenario === "custom") {
			return c.scenario === "custom" && c.customName === customName;
		}
		return c.scenario === scenario;
	});

	if (config) {
		return { modelId: config.modelId, providerId: config.providerId };
	}

	// 回退到默认模型
	if (settings.defaultModelId && settings.defaultProviderId) {
		return {
			modelId: settings.defaultModelId,
			providerId: settings.defaultProviderId,
		};
	}

	return null;
}

/**
 * 根据任务描述推断场景
 */
export function inferScenarioFromTask(taskDescription: string): AgentScenario {
	const lower = taskDescription.toLowerCase();

	// 快速搜索相关
	if (
		lower.includes("查找") ||
		lower.includes("搜索") ||
		lower.includes("find") ||
		lower.includes("search")
	) {
		return "fast_search";
	}

	// 代码审查相关
	if (
		lower.includes("审查") ||
		lower.includes("review") ||
		lower.includes("检查代码")
	) {
		return "code_review";
	}

	// 深度分析相关
	if (
		lower.includes("分析") ||
		lower.includes("架构") ||
		lower.includes("重构") ||
		lower.includes("analyze")
	) {
		return "deep_analysis";
	}

	// 写作相关
	if (
		lower.includes("写") ||
		lower.includes("文章") ||
		lower.includes("润色") ||
		lower.includes("write")
	) {
		return "writing";
	}

	// 翻译相关
	if (lower.includes("翻译") || lower.includes("translate")) {
		return "translation";
	}

	// 调试相关
	if (
		lower.includes("debug") ||
		lower.includes("调试") ||
		lower.includes("bug") ||
		lower.includes("错误")
	) {
		return "debugging";
	}

	// 数据处理相关
	if (
		lower.includes("提取") ||
		lower.includes("转换") ||
		lower.includes("extract") ||
		lower.includes("convert")
	) {
		return "data_processing";
	}

	return "default";
}

/**
 * 生成子代理配置(基于用户的场景配置)
 */
export function generateSubagentConfigs(settings: AgentModelSettings): Record<
	string,
	{
		name: string;
		description: string;
		model: string;
		tools: string[];
	}
> {
	const subagents: Record<string, any> = {};

	for (const config of settings.scenarioConfigs) {
		if (!config.enabled) continue;

		const name =
			config.scenario === "custom"
				? config.customName || "custom-agent"
				: `${config.scenario}-agent`;

		const description =
			config.scenario === "custom"
				? `Custom agent for ${config.customName}`
				: SCENARIO_DESCRIPTIONS[config.scenario];

		// 根据场景确定工具集
		const tools = getToolsForScenario(config.scenario);

		subagents[name] = {
			name,
			description,
			model: config.modelId,
			tools,
		};
	}

	return subagents;
}

/**
 * 根据场景获取推荐的工具集
 */
function getToolsForScenario(scenario: AgentScenario): string[] {
	switch (scenario) {
		case "fast_search":
			return ["Read", "Glob", "Grep"];
		case "code_review":
			return ["Read", "Grep", "Glob", "Bash"];
		case "deep_analysis":
			return ["Read", "Edit", "Write", "Bash", "Grep", "Glob"];
		case "debugging":
			return ["Read", "Edit", "Bash", "Grep", "Glob"];
		case "writing":
			return ["Read", "Write"];
		case "translation":
			return ["Read", "Write"];
		case "data_processing":
			return ["Read", "Write", "Bash"];
		default:
			return ["Read", "Write", "Edit", "Bash", "Grep", "Glob"];
	}
}
