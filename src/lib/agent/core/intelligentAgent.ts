// 智能Agent - 整合所有核心模块
// 实现真正的自主决策、规划、记忆调用、工具选择

import { invokeLlmWithCallback } from "../../chat/api";
import { getPrompt } from "../../prompts";
import { settingsStore } from "../../settingsStore";
import { permissionStore } from "../permissionStore";
import { toolRegistry } from "../registry";
import { agentStore } from "../store";
import type { AgentTask, ToolCall, ToolContext, ToolType } from "../types";
import { EnhancedMemorySystem, type MemoryEntry } from "./memorySystem";
import {
	type ExecutionPlan,
	type PlanNode,
	PlanningSystem,
} from "./planningSystem";
// 导入核心模块
import { ReasoningEngine, type ReasoningStep } from "./reasoningEngine";
import {
	type QualityAssessment,
	type ReflectionResult,
	SelfReflectionSystem,
} from "./selfReflection";
import {
	IntelligentToolSelector,
	type ToolMatch,
	type ToolSelectionContext,
} from "./toolSelector";

// ==================== 类型定义 ====================

// Agent状态
export type AgentState =
	| "idle" // 空闲
	| "thinking" // 思考中
	| "planning" // 规划中
	| "executing" // 执行中
	| "reflecting" // 反思中
	| "completed" // 完成
	| "error"; // 错误

// Agent思考步骤（用于UI展示）
export interface ThinkingStep {
	id: string;
	phase: "analyze" | "plan" | "decide" | "execute" | "reflect" | "conclude";
	title: string;
	content: string;
	timestamp: number;
	duration?: number;
	metadata?: {
		toolRecommendations?: ToolMatch[];
		memoryRetrieved?: MemoryEntry[];
		planNodes?: PlanNode[];
		reflection?: ReflectionResult;
		quality?: QualityAssessment;
	};
}

// Agent配置
export interface IntelligentAgentConfig {
	// 推理配置
	maxIterations: number;
	maxToolCalls: number;
	confidenceThreshold: number;

	// 规划配置
	enableDynamicPlanning: boolean;
	maxPlanDepth: number;

	// 记忆配置
	enableMemory: boolean;
	memoryRetrievalLimit: number;

	// 反思配置
	enableSelfReflection: boolean;
	qualityThreshold: number;

	// 回调
	onStateChange?: (state: AgentState) => void;
	onThinkingStep?: (step: ThinkingStep) => void;
	onProgress?: (progress: number, message: string) => void;
	onToolCall?: (toolCall: ToolCall) => void;
}

const DEFAULT_CONFIG: IntelligentAgentConfig = {
	maxIterations: 15,
	maxToolCalls: 20,
	confidenceThreshold: 0.7,
	enableDynamicPlanning: true,
	maxPlanDepth: 4,
	enableMemory: true,
	memoryRetrievalLimit: 5,
	enableSelfReflection: true,
	qualityThreshold: 0.6,
};

// ==================== 智能Agent类 ====================

export class IntelligentAgent {
	private config: IntelligentAgentConfig;
	private state: AgentState = "idle";

	// 核心模块
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private _reasoning: ReasoningEngine;
	private planning: PlanningSystem;
	private memory: EnhancedMemorySystem;
	private toolSelector: IntelligentToolSelector;
	private reflection: SelfReflectionSystem;

	// 执行状态
	private abortController: AbortController | null = null;
	private currentTask: AgentTask | null = null;
	private thinkingSteps: ThinkingStep[] = [];
	private toolCallCount = 0;
	private iterationCount = 0;

	constructor(config: Partial<IntelligentAgentConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		// 初始化核心模块
		this._reasoning = new ReasoningEngine({
			maxIterations: this.config.maxIterations,
			maxToolCalls: this.config.maxToolCalls,
			confidenceThreshold: this.config.confidenceThreshold,
			onStep: (step) => this.handleReasoningStep(step),
		});

		this.planning = new PlanningSystem({
			maxDepth: this.config.maxPlanDepth,
			enableDynamicReplan: this.config.enableDynamicPlanning,
			onNodeUpdate: (node) => this.handlePlanNodeUpdate(node),
		});

		this.memory = new EnhancedMemorySystem({
			enableSemanticSearch: true,
		});

		this.toolSelector = new IntelligentToolSelector();

		this.reflection = new SelfReflectionSystem({
			enableAutoRetry: true,
			qualityThreshold: this.config.qualityThreshold,
		});
	}

	// 执行任务
	async execute(
		goal: string,
		options?: {
			context?: string[];
			attachedDocs?: Array<{ title: string; content: string }>;
			activeDocContent?: string;
		},
	): Promise<string> {
		this.setState("thinking");
		this.abortController = new AbortController();
		this.thinkingSteps = [];
		this.toolCallCount = 0;
		this.iterationCount = 0;

		// 创建任务
		this.currentTask = agentStore.startTask("custom", goal);
		const taskContext: ToolContext = {
			taskId: this.currentTask.id,
			abortSignal: this.abortController.signal,
		};

		try {
			// Phase 1: 分析与理解
			this.addThinkingStep("analyze", "理解任务", `分析用户目标: "${goal}"`);

			// 获取活跃模型
			const activeModel = settingsStore.getActiveModel();
			if (!activeModel) {
				throw new Error("请先配置并选择一个模型");
			}

			// Phase 2: 记忆检索
			let memoryContext = "";
			if (this.config.enableMemory) {
				this.addThinkingStep(
					"analyze",
					"检索记忆",
					"从记忆系统中检索相关信息...",
				);

				this.memory.setCurrentGoal(goal);
				const relevantMemories = await this.memory.retrieveRelevantMemories(
					goal,
					this.config.memoryRetrievalLimit,
				);

				if (relevantMemories.length > 0) {
					memoryContext = this.memory.formatMemoriesAsContext(relevantMemories);
					const lastStep = this.thinkingSteps[this.thinkingSteps.length - 1];
					if (lastStep) {
						lastStep.metadata = { memoryRetrieved: relevantMemories };
					}
				}

				// 添加用户画像
				const userProfile = this.memory.getUserProfileSummary();
				if (userProfile !== "暂无用户画像信息") {
					memoryContext += `\n## 用户画像\n${userProfile}\n`;
				}
			}

			// Phase 3: 工具推荐
			this.addThinkingStep(
				"decide",
				"选择工具",
				"分析任务需求，推荐合适的工具...",
			);

			const toolContext: ToolSelectionContext = {
				goal,
				previousTools: [],
				previousResults: [],
				availableContext: options?.context || [],
			};
			const toolRecommendations = await this.toolSelector.selectTools(
				toolContext,
				"comprehensive",
			);

			const lastDecideStep = this.thinkingSteps[this.thinkingSteps.length - 1];
			if (lastDecideStep) {
				lastDecideStep.metadata = { toolRecommendations };
				lastDecideStep.content = `推荐工具: ${toolRecommendations.map((t) => `${t.tool}(${(t.score * 100).toFixed(0)}%)`).join(", ")}`;
			}

			// Phase 4: 制定计划
			this.setState("planning");
			this.addThinkingStep("plan", "制定计划", "将目标分解为可执行的子任务...");

			const plan = await this.planning.createPlan(goal);
			const planStep = this.thinkingSteps[this.thinkingSteps.length - 1];
			if (planStep) {
				planStep.metadata = { planNodes: Array.from(plan.nodes.values()) };
				planStep.content = `计划包含 ${plan.stats.totalNodes} 个步骤`;
			}

			// Phase 5: 执行计划
			this.setState("executing");
			this.addThinkingStep("execute", "执行任务", "开始执行计划...");

			const result = await this.executePlan(plan, taskContext, activeModel, {
				memoryContext,
				attachedDocs: options?.attachedDocs,
				activeDocContent: options?.activeDocContent,
				conversationContext: options?.context,
			});

			// Phase 6: 质量评估与反思
			if (this.config.enableSelfReflection) {
				this.setState("reflecting");
				this.addThinkingStep("reflect", "质量评估", "评估输出质量...");

				const quality = await this.reflection.assessQuality(goal, result);
				const reflectStep = this.thinkingSteps[this.thinkingSteps.length - 1];
				if (reflectStep) {
					reflectStep.metadata = { quality };
					reflectStep.content = `质量评分: ${(quality.overallScore * 100).toFixed(0)}%`;
				}

				// 如果质量不达标，尝试改进
				if (this.reflection.needsImprovement(quality)) {
					this.addThinkingStep(
						"reflect",
						"尝试改进",
						"质量不达标，尝试改进...",
					);
					const improvedResult = await this.tryImprove(
						goal,
						result,
						quality,
						taskContext,
						activeModel,
					);
					if (improvedResult) {
						this.setState("completed");
						this.addThinkingStep("conclude", "任务完成", "已生成改进后的结果");

						agentStore.completeTask(improvedResult);
						this.storeTaskMemory(goal, improvedResult);

						return improvedResult;
					}
				}
			}

			// 完成
			this.setState("completed");
			this.addThinkingStep("conclude", "任务完成", "已生成最终结果");

			agentStore.completeTask(result);
			this.storeTaskMemory(goal, result);

			return result;
		} catch (error) {
			this.setState("error");
			const errorMsg = error instanceof Error ? error.message : "执行失败";

			this.addThinkingStep("reflect", "执行失败", `错误: ${errorMsg}`);
			agentStore.failTask(errorMsg);

			throw error;
		} finally {
			this.abortController = null;
		}
	}

	// 执行计划
	private async executePlan(
		plan: ExecutionPlan,
		taskContext: ToolContext,
		model: string,
		options: {
			memoryContext?: string;
			attachedDocs?: Array<{ title: string; content: string }>;
			activeDocContent?: string;
			conversationContext?: string[];
		},
	): Promise<string> {
		const executionResults: Array<{
			node: PlanNode;
			result: unknown;
			success: boolean;
		}> = [];

		while (!this.planning.isPlanCompleted()) {
			if (this.abortController?.signal.aborted) {
				throw new Error("任务已取消");
			}

			if (this.iterationCount >= this.config.maxIterations) {
				break;
			}

			this.iterationCount++;

			// 获取下一批可执行节点
			const executableNodes = this.planning.getNextExecutableNodes();
			if (executableNodes.length === 0) {
				break;
			}

			// 并行执行节点
			const nodePromises = executableNodes.map((node) =>
				this.executeNode(node, taskContext, model),
			);

			const results = await Promise.all(nodePromises);
			executionResults.push(...results);

			// 更新进度
			const progress = this.planning.getProgress();
			this.config.onProgress?.(
				progress.percentage,
				`已完成 ${progress.completed}/${progress.total} 个步骤`,
			);
		}

		// 生成最终结果
		return this.synthesizeResults(plan, executionResults, model, options);
	}

	// 执行单个节点
	private async executeNode(
		node: PlanNode,
		taskContext: ToolContext,
		_model: string,
	): Promise<{ node: PlanNode; result: unknown; success: boolean }> {
		this.planning.updateNodeStatus(node.id, "in_progress");

		try {
			if (node.type === "action" && node.action) {
				// 执行工具调用
				const { tool, input } = node.action;

				if (this.toolCallCount >= this.config.maxToolCalls) {
					throw new Error("工具调用次数已达上限");
				}

				const toolCall = await this.executeToolCall(tool, input, taskContext);
				this.toolCallCount++;

				const success = toolCall.status === "completed";

				// 如果失败，尝试反思和重试
				if (!success && this.config.enableSelfReflection) {
					const reflectionResult = await this.reflection.analyzeFailure({
						toolCall,
						success: false,
						error: toolCall.error,
						output: toolCall.output,
						duration: toolCall.duration || 0,
						context: node.description || node.title,
					});

					if (reflectionResult.shouldRetry && reflectionResult.retryStrategy) {
						// 重试
						const retryInput = {
							...input,
							...reflectionResult.retryStrategy.modifications,
						};
						await new Promise((r) =>
							setTimeout(r, reflectionResult.retryStrategy!.delay),
						);

						const retryCall = await this.executeToolCall(
							tool,
							retryInput,
							taskContext,
						);
						this.toolCallCount++;

						this.planning.updateNodeStatus(
							node.id,
							retryCall.status === "completed" ? "completed" : "failed",
							{
								success: retryCall.status === "completed",
								data: retryCall.output,
								error: retryCall.error,
							},
						);

						// 记录工具使用
						this.toolSelector.recordUsage(
							tool,
							retryCall.status === "completed",
						);

						return {
							node,
							result: retryCall.output,
							success: retryCall.status === "completed",
						};
					}

					// 尝试替代方案
					if (reflectionResult.alternativeApproach) {
						const altCall = await this.executeToolCall(
							reflectionResult.alternativeApproach.tool,
							reflectionResult.alternativeApproach.input,
							taskContext,
						);
						this.toolCallCount++;

						this.planning.updateNodeStatus(
							node.id,
							altCall.status === "completed" ? "completed" : "failed",
							{
								success: altCall.status === "completed",
								data: altCall.output,
								error: altCall.error,
							},
						);

						// 记录工具使用
						this.toolSelector.recordUsage(
							reflectionResult.alternativeApproach.tool,
							altCall.status === "completed",
						);

						return {
							node,
							result: altCall.output,
							success: altCall.status === "completed",
						};
					}
				}

				this.planning.updateNodeStatus(
					node.id,
					success ? "completed" : "failed",
					{
						success,
						data: toolCall.output,
						error: toolCall.error,
					},
				);

				// 记录工具使用
				this.toolSelector.recordUsage(tool, success);

				// 添加观察到记忆
				if (success && toolCall.output) {
					const outputStr =
						typeof toolCall.output === "string"
							? toolCall.output
							: JSON.stringify(toolCall.output).slice(0, 500);
					this.memory.addObservation(outputStr, tool);
				}

				return { node, result: toolCall.output, success };
			}

			// 非action节点直接标记完成
			this.planning.updateNodeStatus(node.id, "completed");
			return { node, result: null, success: true };
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "执行失败";
			this.planning.updateNodeStatus(node.id, "failed", {
				success: false,
				error: errorMsg,
			});
			return { node, result: null, success: false };
		}
	}

	// 执行工具调用
	private async executeToolCall(
		type: ToolType,
		input: Record<string, unknown>,
		context: ToolContext,
	): Promise<ToolCall> {
		const tool = toolRegistry.get(type);
		const toolName = tool?.name || type;

		// 创建工具调用记录
		const toolCall: ToolCall = {
			id: `${context.taskId}-tool-${Date.now()}`,
			type,
			name: toolName,
			input,
			status: "pending",
			startedAt: Date.now(),
		};

		agentStore.addToolCall(toolCall);
		this.config.onToolCall?.(toolCall);

		// 权限检查
		const permResult = await permissionStore.requestPermission(
			toolCall.id,
			toolName,
			type,
			input,
		);

		if (permResult.decision === "denied") {
			toolCall.status = "cancelled";
			toolCall.error = `权限被拒绝: ${permResult.reason || "用户拒绝"}`;
			toolCall.completedAt = Date.now();
			agentStore.updateToolCall(toolCall.id, toolCall);
			return toolCall;
		}

		// 执行工具
		toolCall.status = "running";
		agentStore.updateToolCall(toolCall.id, { status: "running" });

		try {
			const result = await toolRegistry.execute(type, input, {
				...context,
				onProgress: (progress, message) => {
					agentStore.updateToolCall(toolCall.id, {
						metadata: { progress, message },
					});
				},
			});

			toolCall.completedAt = Date.now();
			toolCall.duration =
				toolCall.completedAt - (toolCall.startedAt ?? toolCall.completedAt);

			if (result.success) {
				toolCall.status = "completed";
				toolCall.output = result.data;
				if (result.artifacts) {
					agentStore.addArtifacts(result.artifacts);
				}
			} else {
				toolCall.status = "error";
				toolCall.error = result.error;
			}

			agentStore.updateToolCall(toolCall.id, toolCall);
			return toolCall;
		} catch (error) {
			toolCall.status = "error";
			toolCall.error = error instanceof Error ? error.message : "执行失败";
			toolCall.completedAt = Date.now();
			toolCall.duration =
				toolCall.completedAt - (toolCall.startedAt || Date.now());

			agentStore.updateToolCall(toolCall.id, toolCall);
			return toolCall;
		}
	}

	// 综合结果
	private async synthesizeResults(
		plan: ExecutionPlan,
		results: Array<{ node: PlanNode; result: unknown; success: boolean }>,
		model: string,
		options: {
			memoryContext?: string;
			attachedDocs?: Array<{ title: string; content: string }>;
			activeDocContent?: string;
			conversationContext?: string[];
		},
	): Promise<string> {
		// 收集成功的结果
		const successfulResults = results
			.filter((r) => r.success && r.result)
			.map((r) => {
				const resultStr =
					typeof r.result === "string"
						? r.result
						: JSON.stringify(r.result, null, 2);
				return `[${r.node.title}]\n${resultStr.slice(0, 1500)}`;
			});

		const synthesisPrompt = `基于以下信息，生成对用户问题的完整回答。

## 用户目标
${plan.goal}

${options.memoryContext ? `## 相关记忆\n${options.memoryContext}\n` : ""}

${options.attachedDocs?.length ? `## 用户提供的文档\n${options.attachedDocs.map((d) => `### ${d.title}\n${d.content.slice(0, 2000)}`).join("\n\n")}\n` : ""}

${options.activeDocContent ? `## 当前文档\n${options.activeDocContent.slice(0, 2000)}\n` : ""}

## 执行结果
${successfulResults.join("\n\n---\n\n") || "无执行结果"}

## 要求
1. 综合所有信息给出完整回答
2. 结构清晰，便于阅读
3. 如有引用来源，标注出处
4. 直接回应用户的原始问题`;

		let response = "";
		const informationSynthesisPrompt = await getPrompt("informationSynthesis");
		await new Promise<void>((resolve, reject) => {
			invokeLlmWithCallback({
				model,
				prompt: synthesisPrompt,
				systemPrompt: informationSynthesisPrompt,
				context: options.conversationContext || [],
				onChunk: (chunk) => {
					response += chunk;
				},
				onComplete: () => resolve(),
				onError: (err) => reject(new Error(err)),
			});
		});

		return response;
	}

	// 尝试改进
	private async tryImprove(
		goal: string,
		currentResult: string,
		quality: QualityAssessment,
		context: ToolContext,
		model: string,
	): Promise<string | null> {
		const plan = await this.reflection.generateImprovementPlan(
			goal,
			currentResult,
			quality,
		);

		if (plan.toolsNeeded.length === 0) {
			return null;
		}

		// 执行改进工具
		const additionalResults: string[] = [];
		for (const tool of plan.toolsNeeded.slice(0, 2)) {
			if (this.toolCallCount >= this.config.maxToolCalls) break;

			const toolInput = this.toolSelector.getToolCapabilities(tool);
			if (!toolInput) continue;

			// 简单的输入推断
			let input: Record<string, unknown> = {};
			if (tool === "web_search" || tool === "kb_search_chunks") {
				input = { query: goal };
			} else if (tool === "llm_call") {
				input = { prompt: `改进以下回答: ${currentResult.slice(0, 500)}` };
			}

			const toolCall = await this.executeToolCall(tool, input, context);
			if (toolCall.status === "completed" && toolCall.output) {
				const outputStr =
					typeof toolCall.output === "string"
						? toolCall.output
						: JSON.stringify(toolCall.output).slice(0, 1000);
				additionalResults.push(outputStr);
			}
		}

		if (additionalResults.length === 0) {
			return null;
		}

		// 重新综合
		const improvePrompt = `基于新收集的信息改进回答。

## 用户目标
${goal}

## 原回答
${currentResult.slice(0, 1500)}

## 质量问题
${quality.issues.join("\n")}

## 新信息
${additionalResults.join("\n\n")}

## 要求
改进原回答，解决质量问题。`;

		let improved = "";
		const contentImprovementPrompt = await getPrompt("contentImprovement");
		await new Promise<void>((resolve, reject) => {
			invokeLlmWithCallback({
				model,
				prompt: improvePrompt,
				systemPrompt: contentImprovementPrompt,
				context: [],
				onChunk: (chunk) => {
					improved += chunk;
				},
				onComplete: () => resolve(),
				onError: (err) => reject(new Error(err)),
			});
		});

		return improved || null;
	}

	// 存储任务记忆
	private async storeTaskMemory(goal: string, result: string): Promise<void> {
		if (!this.config.enableMemory) return;

		try {
			// 存储任务摘要
			await this.memory.storeLongTermMemory(
				"episode",
				`任务: ${goal}\n结果: ${result.slice(0, 300)}`,
				"medium",
				["task_result"],
			);

			// 记录任务摘要到短期记忆
			this.memory.addTaskSummary({
				id: this.currentTask?.id || "",
				goal,
				result: result.slice(0, 200),
				success: true,
				toolsUsed: this.currentTask?.toolCalls.map((tc) => tc.type) || [],
				duration: Date.now() - (this.currentTask?.createdAt || Date.now()),
				timestamp: Date.now(),
			});
		} catch (error) {
			console.warn("[IntelligentAgent] 存储记忆失败:", error);
		}
	}

	// 处理推理步骤
	private handleReasoningStep(step: ReasoningStep): void {
		const phaseMap: Record<string, ThinkingStep["phase"]> = {
			thought: "analyze",
			action: "execute",
			observation: "execute",
			reflection: "reflect",
			conclusion: "conclude",
		};

		this.addThinkingStep(
			phaseMap[step.type] || "analyze",
			step.type,
			step.content.slice(0, 500),
		);
	}

	// 处理计划节点更新
	private handlePlanNodeUpdate(node: PlanNode): void {
		const step = this.thinkingSteps.find((s) => s.phase === "plan");
		if (step && step.metadata) {
			const nodes = step.metadata.planNodes || [];
			const idx = nodes.findIndex((n) => n.id === node.id);
			if (idx >= 0) {
				nodes[idx] = node;
			} else {
				nodes.push(node);
			}
			step.metadata.planNodes = nodes;
		}
	}

	// 添加思考步骤
	private addThinkingStep(
		phase: ThinkingStep["phase"],
		title: string,
		content: string,
	): void {
		const step: ThinkingStep = {
			id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
			phase,
			title,
			content,
			timestamp: Date.now(),
		};

		// 计算上一步的持续时间
		if (this.thinkingSteps.length > 0) {
			const lastStep = this.thinkingSteps[this.thinkingSteps.length - 1];
			lastStep.duration = step.timestamp - lastStep.timestamp;
		}

		this.thinkingSteps.push(step);
		this.config.onThinkingStep?.(step);
	}

	// 设置状态
	private setState(state: AgentState): void {
		this.state = state;
		this.config.onStateChange?.(state);
	}

	// 取消执行
	cancel(): void {
		this.abortController?.abort();
		this.setState("idle");
		agentStore.cancelTask();
	}

	// 获取当前状态
	getState(): AgentState {
		return this.state;
	}

	// 获取思考步骤
	getThinkingSteps(): ThinkingStep[] {
		return [...this.thinkingSteps];
	}

	// 获取记忆系统
	getMemory(): EnhancedMemorySystem {
		return this.memory;
	}

	// 获取工具选择器
	getToolSelector(): IntelligentToolSelector {
		return this.toolSelector;
	}

	// 获取推理引擎
	getReasoning(): ReasoningEngine {
		return this._reasoning;
	}

	// 停止
	stop(): void {
		this.cancel();
		this.memory.stop();
	}
}

// 工厂函数
export function createIntelligentAgent(
	config?: Partial<IntelligentAgentConfig>,
): IntelligentAgent {
	return new IntelligentAgent(config);
}

// 单例Agent
let globalAgent: IntelligentAgent | null = null;

export function getGlobalAgent(): IntelligentAgent {
	if (!globalAgent) {
		globalAgent = new IntelligentAgent();
	}
	return globalAgent;
}

export function resetGlobalAgent(): void {
	globalAgent?.stop();
	globalAgent = null;
}
