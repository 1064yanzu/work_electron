// 提示词管理工具

import { getConfig } from "./config";
import {
	buildDocumentBudget,
	type DocumentBudgetResult,
} from "./agent/context/documentBudget";
import {
	renderStyleProfilePrompt,
	renderStyleRecipePrompt,
} from "./api/styleProfile";

/**
 * 系统级提示词模板的默认值。
 * 编辑入口：提示词库（PromptLibraryModal）侧栏底部的「系统模板」分区。
 * （原 Settings › AI › 提示词模板 面板已并入提示词库，见精简决策方案 C2）
 */
export const DEFAULT_PROMPTS: Record<string, string> = {
	titleGeneration: `请为以下用户提问生成一个非常简短的对话标题（不超过10个字），直接返回标题内容，不要有任何引号或额外文字：

{message}`,
};

const ACTIVE_STYLE_PROFILE_KEY = "active_style_profile_id";
const ACTIVE_STYLE_INTENSITY_KEY = "active_style_profile_intensity";
const ACTIVE_STYLE_RECIPE_KEY = "active_style_recipe_id";

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

export async function getChatSystemPromptWithBudget(input: {
	documentContent: string;
	hasActiveDoc: boolean;
	docPath?: string | null;
	maxInlineChars?: number;
	maxSummaryChars?: number;
}): Promise<{ prompt: string; budget: DocumentBudgetResult }> {
	const budget = buildDocumentBudget({
		content: input.documentContent,
		hasActiveDoc: input.hasActiveDoc,
		docPath: input.docPath,
		maxInlineChars: input.maxInlineChars,
		maxSummaryChars: input.maxSummaryChars,
	});
	let prompt = await getChatSystemPrompt(budget.injectedDocument);

	// 注入活跃风格包（优先配方，与 Agent SDK 注入优先级一致；若未设置则跳过）
	try {
		const intensity = (await getConfig(ACTIVE_STYLE_INTENSITY_KEY)) || "medium";
		const activeRecipeId = await getConfig(ACTIVE_STYLE_RECIPE_KEY);
		let styleBlock = "";
		if (activeRecipeId) {
			styleBlock = await renderStyleRecipePrompt(activeRecipeId, intensity);
		} else {
			const activeProfileId = await getConfig(ACTIVE_STYLE_PROFILE_KEY);
			if (activeProfileId) {
				styleBlock = await renderStyleProfilePrompt(activeProfileId, intensity);
			}
		}
		if (styleBlock) {
			prompt = `${prompt}\n\n${styleBlock}`;
		}
	} catch {
		// 风格包注入失败不阻断正常对话
	}

	return { prompt, budget };
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
