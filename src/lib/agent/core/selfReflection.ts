// 自我反思与纠错机制
// 实现失败检测、原因分析、策略调整

import { invokeLlmWithCallback } from "../../chat/api";
import { getPrompt } from "../../prompts";
import { settingsStore } from "../../settingsStore";
import type { ToolCall, ToolType } from "../types";

// ==================== 类型定义 ====================

// 错误类型
export type ErrorCategory =
	| "input_error" // 输入参数错误
	| "network_error" // 网络错误
	| "timeout_error" // 超时错误
	| "permission_error" // 权限错误
	| "resource_error" // 资源不可用
	| "logic_error" // 逻辑错误
	| "quality_error" // 质量问题
	| "unknown_error"; // 未知错误

// 错误严重程度
export type ErrorSeverity = "critical" | "major" | "minor" | "warning";

// 反思结果
export interface ReflectionResult {
	// 错误分析
	errorCategory: ErrorCategory;
	errorSeverity: ErrorSeverity;
	rootCause: string;

	// 策略建议
	shouldRetry: boolean;
	retryStrategy?: RetryStrategy;
	alternativeApproach?: AlternativeApproach;

	// 学习
	lessonsLearned: string[];
	preventionMeasures: string[];

	// 置信度
	confidence: number;
}

// 重试策略
export interface RetryStrategy {
	type: "same" | "modified" | "alternative";
	modifications?: Record<string, unknown>;
	delay: number;
	maxAttempts: number;
	backoffMultiplier: number;
}

// 替代方案
export interface AlternativeApproach {
	tool: ToolType;
	input: Record<string, unknown>;
	reason: string;
	confidence: number;
}

// 执行反馈
export interface ExecutionFeedback {
	toolCall: ToolCall;
	success: boolean;
	error?: string;
	output?: unknown;
	duration: number;
	context: string;
}

// 质量评估
export interface QualityAssessment {
	overallScore: number; // 0-1
	completeness: number; // 完整性
	accuracy: number; // 准确性
	relevance: number; // 相关性
	timeliness: number; // 时效性
	issues: string[];
	suggestions: string[];
}

// 反思配置
export interface ReflectionConfig {
	enableAutoRetry: boolean;
	maxRetries: number;
	retryDelay: number;
	enableLearning: boolean;
	qualityThreshold: number;
	verboseAnalysis: boolean;
}

const DEFAULT_CONFIG: ReflectionConfig = {
	enableAutoRetry: true,
	maxRetries: 3,
	retryDelay: 1000,
	enableLearning: true,
	qualityThreshold: 0.6,
	verboseAnalysis: true,
};

// 错误模式库
const ERROR_PATTERNS: Array<{
	pattern: RegExp;
	category: ErrorCategory;
	severity: ErrorSeverity;
	suggestion: string;
}> = [
	{
		pattern: /timeout|超时|timed out/i,
		category: "timeout_error",
		severity: "major",
		suggestion: "增加超时时间或分解任务",
	},
	{
		pattern: /network|网络|connection|ECONNREFUSED|ETIMEDOUT/i,
		category: "network_error",
		severity: "major",
		suggestion: "检查网络连接或使用本地替代方案",
	},
	{
		pattern: /permission|权限|denied|unauthorized|forbidden/i,
		category: "permission_error",
		severity: "critical",
		suggestion: "请求必要权限或使用允许的操作",
	},
	{
		pattern: /not found|找不到|404|不存在/i,
		category: "resource_error",
		severity: "major",
		suggestion: "验证资源路径或使用替代资源",
	},
	{
		pattern: /invalid|无效|参数错误|missing|required/i,
		category: "input_error",
		severity: "minor",
		suggestion: "检查并修正输入参数",
	},
	{
		pattern: /empty|空|no result|没有结果/i,
		category: "quality_error",
		severity: "warning",
		suggestion: "调整搜索策略或扩大范围",
	},
];

// ==================== 自我反思系统类 ====================

export class SelfReflectionSystem {
	private config: ReflectionConfig;
	private reflectionHistory: Map<string, ReflectionResult[]> = new Map();
	private learnedPatterns: Map<string, { count: number; solution: string }> =
		new Map();

	constructor(config: Partial<ReflectionConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// 分析执行失败
	async analyzeFailure(feedback: ExecutionFeedback): Promise<ReflectionResult> {
		const { toolCall, error, context: _context } = feedback;

		// 1. 快速模式匹配
		const patternMatch = this.matchErrorPattern(error || "");

		// 2. 深度分析（如果启用）
		let deepAnalysis: Partial<ReflectionResult> = {};
		if (this.config.verboseAnalysis) {
			deepAnalysis = await this.deepAnalyzeError(feedback);
		}

		// 3. 查找历史解决方案（用于未来增强）
		this.findHistoricalSolution(toolCall.type, error || "");

		// 4. 综合分析结果
		const result: ReflectionResult = {
			errorCategory:
				deepAnalysis.errorCategory || patternMatch?.category || "unknown_error",
			errorSeverity:
				deepAnalysis.errorSeverity || patternMatch?.severity || "major",
			rootCause: deepAnalysis.rootCause || this.inferRootCause(feedback),
			shouldRetry: this.shouldRetry(feedback, patternMatch?.category),
			retryStrategy: this.generateRetryStrategy(feedback, patternMatch),
			alternativeApproach: await this.findAlternative(feedback),
			lessonsLearned: deepAnalysis.lessonsLearned || [],
			preventionMeasures: deepAnalysis.preventionMeasures || [],
			confidence: deepAnalysis.confidence || 0.6,
		};

		// 5. 存储反思历史
		this.storeReflection(toolCall.id, result);

		// 6. 学习（如果启用）
		if (this.config.enableLearning && result.alternativeApproach) {
			this.learnFromFailure(toolCall.type, error || "", result);
		}

		return result;
	}

	// 匹配错误模式
	private matchErrorPattern(
		error: string,
	): (typeof ERROR_PATTERNS)[0] | undefined {
		for (const pattern of ERROR_PATTERNS) {
			if (pattern.pattern.test(error)) {
				return pattern;
			}
		}
		return undefined;
	}

	// 深度分析错误
	private async deepAnalyzeError(
		feedback: ExecutionFeedback,
	): Promise<Partial<ReflectionResult>> {
		const activeModel = settingsStore.getActiveModel();
		if (!activeModel) {
			return {};
		}

		const analysisPrompt = `分析以下工具调用失败的原因。

## 工具调用信息
- 工具: ${feedback.toolCall.type}
- 输入: ${JSON.stringify(feedback.toolCall.input, null, 2).slice(0, 500)}
- 错误: ${feedback.error || "未知错误"}
- 耗时: ${feedback.duration}ms

## 上下文
${feedback.context.slice(0, 500)}

## 请分析
1. 错误的根本原因是什么？
2. 这个错误是否可以重试？
3. 有什么替代方案？
4. 如何避免类似错误？

## 输出格式（JSON）
{
  "errorCategory": "input_error|network_error|timeout_error|permission_error|resource_error|logic_error|quality_error|unknown_error",
  "errorSeverity": "critical|major|minor|warning",
  "rootCause": "根本原因描述",
  "shouldRetry": true/false,
  "lessonsLearned": ["教训1", "教训2"],
  "preventionMeasures": ["预防措施1", "预防措施2"],
  "confidence": 0.0-1.0
}`;

		try {
			let response = "";
			const errorAnalysisPrompt = await getPrompt("errorAnalysis");
			await new Promise<void>((resolve, reject) => {
				invokeLlmWithCallback({
					model: activeModel,
					prompt: analysisPrompt,
					systemPrompt: errorAnalysisPrompt,
					context: [],
					onChunk: (chunk) => {
						response += chunk;
					},
					onComplete: () => resolve(),
					onError: (err) => reject(new Error(err)),
				});
			});

			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				return JSON.parse(jsonMatch[0]);
			}
		} catch (error) {
			console.warn("[SelfReflection] 深度分析失败:", error);
		}

		return {};
	}

	// 推断根本原因
	private inferRootCause(feedback: ExecutionFeedback): string {
		const error = feedback.error || "";
		const tool = feedback.toolCall.type;

		if (error.includes("timeout")) {
			return `${tool} 执行超时，可能是网络延迟或任务过于复杂`;
		}
		if (error.includes("network") || error.includes("connection")) {
			return "网络连接问题导致无法完成请求";
		}
		if (error.includes("permission") || error.includes("denied")) {
			return "缺少执行此操作的必要权限";
		}
		if (error.includes("not found") || error.includes("404")) {
			return "请求的资源不存在或已被删除";
		}
		if (error.includes("invalid") || error.includes("参数")) {
			return "输入参数不符合工具要求";
		}

		return `${tool} 执行失败: ${error.slice(0, 100)}`;
	}

	// 判断是否应该重试
	private shouldRetry(
		feedback: ExecutionFeedback,
		category?: ErrorCategory,
	): boolean {
		if (!this.config.enableAutoRetry) return false;

		// 权限错误不重试
		if (category === "permission_error") return false;

		// 逻辑错误通常不能通过重试解决
		if (category === "logic_error") return false;

		// 检查重试次数
		const retryCount = feedback.toolCall.retryCount || 0;
		if (retryCount >= this.config.maxRetries) return false;

		// 网络和超时错误通常可以重试
		if (category === "network_error" || category === "timeout_error")
			return true;

		// 输入错误如果有修正方案可以重试
		if (category === "input_error") return true;

		return false;
	}

	// 生成重试策略
	private generateRetryStrategy(
		feedback: ExecutionFeedback,
		pattern?: (typeof ERROR_PATTERNS)[0],
	): RetryStrategy | undefined {
		if (!this.shouldRetry(feedback, pattern?.category)) {
			return undefined;
		}

		const retryCount = feedback.toolCall.retryCount || 0;
		const baseDelay = this.config.retryDelay;

		// 指数退避
		const delay = baseDelay * 2 ** retryCount;

		let type: RetryStrategy["type"] = "same";
		let modifications: Record<string, unknown> | undefined;

		// 根据错误类型调整策略
		if (pattern?.category === "timeout_error") {
			type = "modified";
			modifications = {
				timeout: (feedback.toolCall.input.timeout || 30) * 2,
			};
		}

		if (pattern?.category === "input_error") {
			type = "modified";
			// 尝试简化输入
			modifications = this.simplifyInput(feedback.toolCall.input);
		}

		return {
			type,
			modifications,
			delay,
			maxAttempts: this.config.maxRetries,
			backoffMultiplier: 2,
		};
	}

	// 简化输入
	private simplifyInput(
		input: Record<string, unknown>,
	): Record<string, unknown> {
		const simplified: Record<string, unknown> = { ...input };

		// 截断过长的字符串
		for (const [key, value] of Object.entries(simplified)) {
			if (typeof value === "string" && value.length > 500) {
				simplified[key] = value.slice(0, 500);
			}
		}

		return simplified;
	}

	// 查找替代方案
	private async findAlternative(
		feedback: ExecutionFeedback,
	): Promise<AlternativeApproach | undefined> {
		const { toolCall } = feedback;

		// 定义工具替代映射
		const alternatives: Record<ToolType, ToolType[]> = {
			web_search: ["kb_search_chunks", "fetch_url"],
			kb_search_chunks: ["web_search"],
			fetch_url: ["browser_open"],
			browser_open: ["fetch_url"],
			doc_update: ["doc_patch"],
			doc_patch: ["doc_update"],
			code_execute: ["llm_call"],
			mcp_call: ["web_search", "llm_call"],
			file_read: ["kb_search_chunks"],
			file_write: ["doc_create"],
			browser_screenshot: ["fetch_url"],
			llm_call: [],
			doc_create: [],
			file_list: ["file_read"],
			skill_call: ["skill_invoke"],
			skill_invoke: ["skill_call"],
			custom: [],
		};

		const altTools = alternatives[toolCall.type] || [];
		if (altTools.length === 0) return undefined;

		// 选择最佳替代
		const bestAlt = altTools[0];
		const altInput = this.adaptInputForTool(
			toolCall.input,
			toolCall.type,
			bestAlt,
		);

		return {
			tool: bestAlt,
			input: altInput,
			reason: `${toolCall.type} 失败后的替代方案`,
			confidence: 0.6,
		};
	}

	// 适配输入参数
	private adaptInputForTool(
		input: Record<string, unknown>,
		fromTool: ToolType,
		toTool: ToolType,
	): Record<string, unknown> {
		// 搜索类工具间的适配
		if (
			(fromTool === "web_search" || fromTool === "kb_search_chunks") &&
			(toTool === "web_search" || toTool === "kb_search_chunks")
		) {
			return { query: input.query };
		}

		// fetch_url 和 browser_open 间的适配
		if (
			(fromTool === "fetch_url" || fromTool === "browser_open") &&
			(toTool === "fetch_url" || toTool === "browser_open")
		) {
			return { url: input.url };
		}

		// 默认传递原始输入
		return { ...input };
	}

	// 查找历史解决方案
	private findHistoricalSolution(
		tool: ToolType,
		error: string,
	): string | undefined {
		const key = `${tool}:${error.slice(0, 50)}`;
		const learned = this.learnedPatterns.get(key);

		if (learned && learned.count >= 2) {
			return learned.solution;
		}

		return undefined;
	}

	// 从失败中学习
	private learnFromFailure(
		tool: ToolType,
		error: string,
		result: ReflectionResult,
	): void {
		const key = `${tool}:${error.slice(0, 50)}`;
		const existing = this.learnedPatterns.get(key);

		const solution = result.alternativeApproach
			? `使用 ${result.alternativeApproach.tool} 替代`
			: result.retryStrategy?.modifications
				? `修改参数后重试`
				: "无有效解决方案";

		if (existing) {
			existing.count++;
		} else {
			this.learnedPatterns.set(key, { count: 1, solution });
		}
	}

	// 存储反思结果
	private storeReflection(toolCallId: string, result: ReflectionResult): void {
		const history = this.reflectionHistory.get(toolCallId) || [];
		history.push(result);
		this.reflectionHistory.set(toolCallId, history);
	}

	// 评估输出质量
	async assessQuality(
		goal: string,
		output: string,
		context?: string,
	): Promise<QualityAssessment> {
		const activeModel = settingsStore.getActiveModel();
		if (!activeModel) {
			return this.defaultQualityAssessment();
		}

		const assessmentPrompt = `评估以下输出的质量。

## 原始目标
${goal}

## 输出内容
${output.slice(0, 2000)}

${context ? `## 上下文\n${context.slice(0, 500)}` : ""}

## 评估维度
1. 完整性：是否完整回答了问题
2. 准确性：信息是否正确
3. 相关性：是否与目标相关
4. 时效性：信息是否及时

## 输出格式（JSON）
{
  "overallScore": 0.0-1.0,
  "completeness": 0.0-1.0,
  "accuracy": 0.0-1.0,
  "relevance": 0.0-1.0,
  "timeliness": 0.0-1.0,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}`;

		try {
			let response = "";
			const qualityAssessmentPrompt = await getPrompt("qualityAssessment");
			await new Promise<void>((resolve, reject) => {
				invokeLlmWithCallback({
					model: activeModel,
					prompt: assessmentPrompt,
					systemPrompt: qualityAssessmentPrompt,
					context: [],
					onChunk: (chunk) => {
						response += chunk;
					},
					onComplete: () => resolve(),
					onError: (err) => reject(new Error(err)),
				});
			});

			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				return JSON.parse(jsonMatch[0]);
			}
		} catch (error) {
			console.warn("[SelfReflection] 质量评估失败:", error);
		}

		return this.defaultQualityAssessment();
	}

	// 默认质量评估
	private defaultQualityAssessment(): QualityAssessment {
		return {
			overallScore: 0.5,
			completeness: 0.5,
			accuracy: 0.5,
			relevance: 0.5,
			timeliness: 0.5,
			issues: [],
			suggestions: [],
		};
	}

	// 检查是否需要改进
	needsImprovement(assessment: QualityAssessment): boolean {
		return assessment.overallScore < this.config.qualityThreshold;
	}

	// 生成改进建议
	async generateImprovementPlan(
		_goal: string,
		_currentOutput: string,
		assessment: QualityAssessment,
	): Promise<{
		strategy: string;
		steps: string[];
		toolsNeeded: ToolType[];
	}> {
		const weakAreas: string[] = [];

		if (assessment.completeness < 0.6) {
			weakAreas.push("完整性不足");
		}
		if (assessment.accuracy < 0.6) {
			weakAreas.push("准确性待提高");
		}
		if (assessment.relevance < 0.6) {
			weakAreas.push("相关性不够");
		}

		// 根据弱项确定改进策略
		let strategy = "";
		const steps: string[] = [];
		const toolsNeeded: ToolType[] = [];

		if (weakAreas.includes("完整性不足")) {
			strategy = "扩展信息收集范围";
			steps.push("进行更广泛的搜索");
			steps.push("获取更多来源的信息");
			toolsNeeded.push("web_search", "kb_search_chunks");
		}

		if (weakAreas.includes("准确性待提高")) {
			strategy = "验证和核实信息";
			steps.push("交叉验证关键事实");
			steps.push("查找权威来源");
			toolsNeeded.push("web_search", "fetch_url");
		}

		if (weakAreas.includes("相关性不够")) {
			strategy = "重新理解目标并聚焦";
			steps.push("重新分析用户意图");
			steps.push("过滤不相关信息");
			toolsNeeded.push("llm_call");
		}

		return {
			strategy: strategy || "继续优化输出",
			steps: steps.length > 0 ? steps : ["检查并改进当前输出"],
			toolsNeeded: toolsNeeded.length > 0 ? toolsNeeded : ["llm_call"],
		};
	}

	// 获取反思历史
	getReflectionHistory(toolCallId: string): ReflectionResult[] {
		return this.reflectionHistory.get(toolCallId) || [];
	}

	// 获取学习到的模式
	getLearnedPatterns(): Map<string, { count: number; solution: string }> {
		return new Map(this.learnedPatterns);
	}

	// 清除历史
	clearHistory(): void {
		this.reflectionHistory.clear();
	}
}

// 单例导出
export const selfReflection = new SelfReflectionSystem();
