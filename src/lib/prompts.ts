// 提示词管理工具

import { DEFAULT_PROMPTS } from "../components/Settings/panels/PromptSettings";
import { getConfig } from "./config";

// 提示词配置键
export const PROMPT_KEYS = {
	// 基础提示词
	titleGeneration: "prompt_title_generation",
	chatSystem: "prompt_chat_system",
	researchSystem: "prompt_research_system",
	imageExtraction: "prompt_image_extraction",

	// Agent 相关提示词
	intentRecognition: "prompt_intent_recognition",
	agentFormat: "prompt_agent_format",
	finalSynthesis: "prompt_final_synthesis",
	taskReplan: "prompt_task_replan",
	agentSystem: "prompt_agent_system",
	errorAnalysis: "prompt_error_analysis",
	skillGenerate: "prompt_skill_generate",

	// 推理相关提示词
	taskPlanning: "prompt_task_planning",
	informationSynthesis: "prompt_information_synthesis",
	contentImprovement: "prompt_content_improvement",
	chainOfThought: "prompt_chain_of_thought",
	decisionEngine: "prompt_decision_engine",
	selfReflection: "prompt_self_reflection",
	qualityAssessment: "prompt_quality_assessment",
} as const;

/**
 * 获取提示词配置
 * @param key 提示词键名
 * @returns 提示词内容（如果未配置则返回默认值）
 */
export async function getPrompt(
	key: keyof typeof PROMPT_KEYS,
): Promise<string> {
	try {
		const configKey = PROMPT_KEYS[key];
		const value = await getConfig(configKey);
		return value || DEFAULT_PROMPTS[key] || "";
	} catch (error) {
		console.error(`[prompts] 获取提示词 ${key} 失败:`, error);
		return DEFAULT_PROMPTS[key] || "";
	}
}

/**
 * 获取标题生成提示词
 * @param message 用户消息
 * @returns 完整的提示词
 */
export async function getTitleGenerationPrompt(
	message: string,
): Promise<string> {
	const template = await getPrompt("titleGeneration");
	return template.replace("{message}", message.slice(0, 200));
}

/**
 * 获取聊天系统提示词
 * @param documentContent 当前文档内容
 * @returns 完整的系统提示词
 */
export async function getChatSystemPrompt(
	documentContent: string,
): Promise<string> {
	const template = await getPrompt("chatSystem");
	return template.replace("{document}", documentContent || "（空文档）");
}

/**
 * 获取研究系统提示词
 * @param sources 研究资料内容
 * @returns 完整的系统提示词
 */
export async function getResearchSystemPrompt(
	sources: string,
): Promise<string> {
	const template = await getPrompt("researchSystem");
	return template.replace(
		"{sources}",
		sources || "（未找到相关网络资料，请基于你的知识库进行分析）",
	);
}

export async function getImageExtractionPrompt(): Promise<string> {
	return getPrompt("imageExtraction");
}

/**
 * 获取 Agent 系统提示词
 * @param availableTools 可用工具列表
 * @param context 上下文信息
 * @returns 完整的系统提示词
 */
export async function getAgentSystemPrompt(
	availableTools: string[],
	context?: string,
): Promise<string> {
	const template = await getPrompt("agentSystem");
	return template
		.replace("{tools}", availableTools.join("\n"))
		.replace("{context}", context ? `## 当前上下文\n${context}` : "");
}
