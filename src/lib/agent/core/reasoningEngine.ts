// 智能推理引擎 - ReAct 模式实现
// 实现 思考(Thought) -> 行动(Action) -> 观察(Observation) 的循环

import { invokeLlmWithCallback } from "../../chat/api";
import { getPrompt } from "../../prompts";
import { settingsStore } from "../../settingsStore";
import { toolRegistry } from "../registry";
import type { ToolContext, ToolType } from "../types";

// ==================== 类型定义 ====================

// 推理步骤类型
export type ReasoningStepType =
	| "thought" // 思考：分析当前状态和下一步
	| "action" // 行动：调用工具或生成输出
	| "observation" // 观察：分析工具执行结果
	| "reflection" // 反思：评估进度和调整策略
	| "conclusion"; // 结论：生成最终答案

// 推理步骤
export interface ReasoningStep {
	id: string;
	type: ReasoningStepType;
	content: string;
	metadata?: {
		confidence?: number; // 置信度 0-1
		alternativeActions?: string[]; // 备选行动
		toolCall?: {
			tool: ToolType;
			input: Record<string, unknown>;
			reason: string;
		};
		observationSummary?: string;
		adjustments?: string[]; // 策略调整
	};
	timestamp: number;
}

// 推理上下文
export interface ReasoningContext {
	goal: string; // 原始目标
	subGoals: SubGoal[]; // 分解的子目标
	currentSubGoalIndex: number; // 当前子目标索引
	steps: ReasoningStep[]; // 推理步骤历史
	observations: Observation[]; // 观察结果
	workingMemory: WorkingMemory; // 工作记忆
	constraints: ReasoningConstraint[]; // 约束条件
}

// 子目标
export interface SubGoal {
	id: string;
	description: string;
	status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
	priority: number; // 优先级 1-10
	dependencies: string[]; // 依赖的其他子目标ID
	estimatedComplexity: "low" | "medium" | "high";
	result?: string;
	error?: string;
}

// 观察结果
export interface Observation {
	id: string;
	source: string; // 来源（工具名、检索结果等）
	content: string; // 观察内容
	relevance: number; // 与目标的相关性 0-1
	reliability: number; // 可靠性 0-1
	timestamp: number;
}

// 工作记忆
export interface WorkingMemory {
	facts: Fact[]; // 已确认的事实
	hypotheses: Hypothesis[]; // 当前假设
	pendingQuestions: string[]; // 待解答的问题
	keyEntities: Entity[]; // 关键实体
	contextWindow: string[]; // 上下文窗口（最近N条重要信息）
}

// 事实
export interface Fact {
	id: string;
	content: string;
	source: string;
	confidence: number;
	timestamp: number;
}

// 假设
export interface Hypothesis {
	id: string;
	content: string;
	confidence: number;
	supportingEvidence: string[];
	contradictingEvidence: string[];
}

// 实体
export interface Entity {
	name: string;
	type:
		| "person"
		| "organization"
		| "concept"
		| "tool"
		| "location"
		| "date"
		| "other";
	attributes: Record<string, string>;
	mentions: number;
}

// 推理约束
export interface ReasoningConstraint {
	type: "time" | "tool" | "resource" | "quality";
	description: string;
	value: number | string;
}

// 推理配置
export interface ReasoningEngineConfig {
	maxIterations: number; // 最大推理迭代次数
	maxToolCalls: number; // 最大工具调用次数
	confidenceThreshold: number; // 置信度阈值
	reflectionInterval: number; // 反思间隔（每N步反思一次）
	enableSelfCorrection: boolean; // 是否启用自我纠正
	verboseThinking: boolean; // 是否详细展示思考过程
	onStep?: (step: ReasoningStep) => void;
	onSubGoalUpdate?: (subGoal: SubGoal) => void;
	onMemoryUpdate?: (memory: WorkingMemory) => void;
}

const DEFAULT_CONFIG: ReasoningEngineConfig = {
	maxIterations: 15,
	maxToolCalls: 20,
	confidenceThreshold: 0.7,
	reflectionInterval: 3,
	enableSelfCorrection: true,
	verboseThinking: true,
};

// ==================== 推理引擎类 ====================

export class ReasoningEngine {
	private config: ReasoningEngineConfig;
	private context: ReasoningContext | null = null;
	private abortController: AbortController | null = null;
	private toolCallCount = 0;
	private iterationCount = 0;

	constructor(config: Partial<ReasoningEngineConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// 初始化推理上下文
	async initialize(goal: string): Promise<ReasoningContext> {
		this.abortController = new AbortController();
		this.toolCallCount = 0;
		this.iterationCount = 0;

		// 分解目标为子目标
		const subGoals = await this.decomposeGoal(goal);

		this.context = {
			goal,
			subGoals,
			currentSubGoalIndex: 0,
			steps: [],
			observations: [],
			workingMemory: {
				facts: [],
				hypotheses: [],
				pendingQuestions: [goal],
				keyEntities: [],
				contextWindow: [],
			},
			constraints: [
				{
					type: "tool",
					description: "最大工具调用次数",
					value: this.config.maxToolCalls,
				},
				{
					type: "time",
					description: "最大推理迭代次数",
					value: this.config.maxIterations,
				},
			],
		};

		return this.context;
	}

	// 分解目标为子目标
	private async decomposeGoal(goal: string): Promise<SubGoal[]> {
		const activeModel = settingsStore.getActiveModel();
		if (!activeModel) {
			// 如果没有模型，返回单一目标
			return [
				{
					id: "goal-1",
					description: goal,
					status: "pending",
					priority: 10,
					dependencies: [],
					estimatedComplexity: "medium",
				},
			];
		}

		const decompositionPrompt = `分析用户目标，将其分解为可执行的子目标。

用户目标: ${goal}

## 分析要求
1. 识别目标的核心意图
2. 判断是否需要分解（简单任务不需要分解）
3. 如果需要分解，按逻辑顺序列出子目标
4. 评估每个子目标的复杂度和依赖关系

## 可用工具
${this.getToolsSummary()}

## 输出格式（JSON）
{
  "needsDecomposition": true/false,
  "subGoals": [
    {
      "id": "goal-1",
      "description": "子目标描述",
      "priority": 1-10,
      "dependencies": [],
      "estimatedComplexity": "low|medium|high"
    }
  ],
  "reasoning": "分解理由"
}`;

		try {
			let response = "";
			const taskPlanningPrompt = await getPrompt("taskPlanning");
			await new Promise<void>((resolve, reject) => {
				invokeLlmWithCallback({
					model: activeModel,
					prompt: decompositionPrompt,
					systemPrompt: taskPlanningPrompt,
					context: [],
					onChunk: (chunk) => {
						response += chunk;
					},
					onComplete: () => resolve(),
					onError: (err) => reject(new Error(err)),
				});
			});

			// 解析响应
			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				if (parsed.needsDecomposition && Array.isArray(parsed.subGoals)) {
					return parsed.subGoals.map((sg: any) => ({
						...sg,
						status: "pending" as const,
					}));
				}
			}
		} catch (error) {
			console.warn("[ReasoningEngine] 目标分解失败:", error);
		}

		// 默认返回单一目标
		return [
			{
				id: "goal-1",
				description: goal,
				status: "pending",
				priority: 10,
				dependencies: [],
				estimatedComplexity: "medium",
			},
		];
	}

	// 执行推理循环
	async reason(toolContext: ToolContext): Promise<string> {
		if (!this.context) {
			throw new Error("推理上下文未初始化");
		}

		const activeModel = settingsStore.getActiveModel();
		if (!activeModel) {
			throw new Error("请先配置并选择一个模型");
		}

		let finalAnswer = "";

		while (this.iterationCount < this.config.maxIterations) {
			if (this.abortController?.signal.aborted) {
				break;
			}

			this.iterationCount++;

			// 1. 思考阶段
			const thought = await this.think(activeModel);
			this.addStep(thought);
			this.config.onStep?.(thought);

			// 检查是否可以直接得出结论
			if (
				thought.metadata?.confidence &&
				thought.metadata.confidence >= this.config.confidenceThreshold
			) {
				if (
					thought.content.includes("已收集足够信息") ||
					thought.content.includes("可以给出答案")
				) {
					// 进入结论阶段
					const conclusion = await this.conclude(activeModel);
					this.addStep(conclusion);
					this.config.onStep?.(conclusion);
					finalAnswer = conclusion.content;
					break;
				}
			}

			// 2. 行动阶段
			const action = await this.act(activeModel, toolContext);
			this.addStep(action);
			this.config.onStep?.(action);

			// 如果行动是生成结论
			if (action.type === "conclusion") {
				finalAnswer = action.content;
				break;
			}

			// 3. 观察阶段（如果有工具调用）
			if (action.metadata?.toolCall) {
				const observation = await this.observe(action, toolContext);
				this.addStep(observation);
				this.config.onStep?.(observation);

				// 更新工作记忆
				this.updateWorkingMemory(observation);
			}

			// 4. 定期反思
			if (
				this.config.enableSelfCorrection &&
				this.iterationCount % this.config.reflectionInterval === 0
			) {
				const reflection = await this.reflect(activeModel);
				this.addStep(reflection);
				this.config.onStep?.(reflection);

				// 根据反思结果调整策略
				if (reflection.metadata?.adjustments) {
					this.applyAdjustments(reflection.metadata.adjustments);
				}
			}

			// 检查是否完成所有子目标
			if (this.allSubGoalsCompleted()) {
				const conclusion = await this.conclude(activeModel);
				this.addStep(conclusion);
				this.config.onStep?.(conclusion);
				finalAnswer = conclusion.content;
				break;
			}
		}

		return finalAnswer || this.generateFallbackAnswer();
	}

	// 思考阶段
	private async think(model: string): Promise<ReasoningStep> {
		const currentSubGoal =
			this.context!.subGoals[this.context!.currentSubGoalIndex];

		const thinkingPrompt = `基于当前状态进行思考分析。

## 原始目标
${this.context!.goal}

## 当前子目标
${currentSubGoal?.description || "无"}

## 已完成的步骤
${this.context!.steps.slice(-5)
	.map((s) => `[${s.type}] ${s.content.slice(0, 200)}`)
	.join("\n")}

## 工作记忆
- 已知事实: ${
			this.context!.workingMemory.facts.slice(-3)
				.map((f) => f.content)
				.join("; ") || "无"
		}
- 当前假设: ${this.context!.workingMemory.hypotheses.map((h) => h.content).join("; ") || "无"}
- 待解答问题: ${this.context!.workingMemory.pendingQuestions.join("; ")}

## 最近观察
${
	this.context!.observations.slice(-3)
		.map((o) => `[${o.source}] ${o.content.slice(0, 300)}`)
		.join("\n") || "无"
}

## 可用工具
${this.getToolsSummary()}

## 思考要求
1. 分析当前进展和距离目标的差距
2. 评估已有信息是否足够
3. 决定下一步应该做什么
4. 给出置信度评估

请以"我需要..."或"我应该..."开头，表达你的思考过程。
同时输出JSON格式的元数据：
\`\`\`json
{
  "confidence": 0-1,
  "nextAction": "工具调用|直接回答|需要更多信息",
  "reasoning": "推理过程"
}
\`\`\``;

		let response = "";
		const chainOfThoughtPrompt = await getPrompt("chainOfThought");
		await new Promise<void>((resolve, reject) => {
			invokeLlmWithCallback({
				model,
				prompt: thinkingPrompt,
				systemPrompt: chainOfThoughtPrompt,
				context: [],
				onChunk: (chunk) => {
					response += chunk;
				},
				onComplete: () => resolve(),
				onError: (err) => reject(new Error(err)),
			});
		});

		// 解析元数据
		let confidence = 0.5;
		const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			try {
				const meta = JSON.parse(jsonMatch[1]);
				confidence = meta.confidence || 0.5;
			} catch {
				/* ignore */
			}
		}

		// 清理思考内容
		const thoughtContent = response.replace(/```json[\s\S]*?```/g, "").trim();

		return {
			id: this.generateStepId(),
			type: "thought",
			content: thoughtContent,
			metadata: { confidence },
			timestamp: Date.now(),
		};
	}

	// 行动阶段
	private async act(
		model: string,
		_toolContext: ToolContext,
	): Promise<ReasoningStep> {
		const lastThought = this.context!.steps.filter(
			(s) => s.type === "thought",
		).pop();

		const actionPrompt = `基于思考结果，决定下一步行动。

## 最近思考
${lastThought?.content || "无"}

## 原始目标
${this.context!.goal}

## 可用工具
${this.getToolsDescription()}

## 决策要求
1. 如果需要调用工具，选择最合适的工具
2. 如果信息已足够，直接生成答案
3. 如果需要多个工具，选择最优先的一个

## 输出格式
如果需要调用工具，输出：
\`\`\`json
{
  "action": "tool_call",
  "tool": "工具类型",
  "input": { 参数 },
  "reason": "调用原因"
}
\`\`\`

如果可以直接回答，输出：
\`\`\`json
{
  "action": "answer",
  "content": "回答内容"
}
\`\`\``;

		let response = "";
		const decisionEnginePrompt = await getPrompt("decisionEngine");
		await new Promise<void>((resolve, reject) => {
			invokeLlmWithCallback({
				model,
				prompt: actionPrompt,
				systemPrompt: decisionEnginePrompt,
				context: [],
				onChunk: (chunk) => {
					response += chunk;
				},
				onComplete: () => resolve(),
				onError: (err) => reject(new Error(err)),
			});
		});

		// 解析行动
		const jsonMatch =
			response.match(/```json\s*([\s\S]*?)\s*```/) ||
			response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			try {
				const jsonStr = jsonMatch[1] || jsonMatch[0];
				const action = JSON.parse(jsonStr);

				if (action.action === "tool_call" && action.tool) {
					return {
						id: this.generateStepId(),
						type: "action",
						content: `调用工具 ${action.tool}: ${action.reason || ""}`,
						metadata: {
							toolCall: {
								tool: action.tool as ToolType,
								input: action.input || {},
								reason: action.reason || "",
							},
						},
						timestamp: Date.now(),
					};
				}

				if (action.action === "answer") {
					return {
						id: this.generateStepId(),
						type: "conclusion",
						content: action.content,
						timestamp: Date.now(),
					};
				}
			} catch {
				/* ignore */
			}
		}

		// 默认返回思考延续
		return {
			id: this.generateStepId(),
			type: "action",
			content: "继续分析...",
			timestamp: Date.now(),
		};
	}

	// 观察阶段
	private async observe(
		action: ReasoningStep,
		toolContext: ToolContext,
	): Promise<ReasoningStep> {
		if (!action.metadata?.toolCall) {
			return {
				id: this.generateStepId(),
				type: "observation",
				content: "无工具调用结果",
				timestamp: Date.now(),
			};
		}

		const { tool, input } = action.metadata.toolCall;
		this.toolCallCount++;

		try {
			const result = await toolRegistry.execute(tool, input, toolContext);

			const observation: Observation = {
				id: this.generateStepId(),
				source: tool,
				content: result.success
					? typeof result.data === "string"
						? result.data
						: JSON.stringify(result.data, null, 2)
					: `错误: ${result.error}`,
				relevance: result.success ? 0.8 : 0.3,
				reliability: result.success ? 0.9 : 0.2,
				timestamp: Date.now(),
			};

			this.context!.observations.push(observation);

			return {
				id: this.generateStepId(),
				type: "observation",
				content: observation.content.slice(0, 2000),
				metadata: {
					observationSummary: result.success
						? "工具执行成功"
						: `工具执行失败: ${result.error}`,
				},
				timestamp: Date.now(),
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "未知错误";
			return {
				id: this.generateStepId(),
				type: "observation",
				content: `工具调用失败: ${errorMsg}`,
				metadata: {
					observationSummary: `错误: ${errorMsg}`,
				},
				timestamp: Date.now(),
			};
		}
	}

	// 反思阶段
	private async reflect(model: string): Promise<ReasoningStep> {
		const reflectionPrompt = `回顾当前进展，进行自我反思。

## 原始目标
${this.context!.goal}

## 执行进度
- 已完成步骤: ${this.context!.steps.length}
- 工具调用次数: ${this.toolCallCount}
- 子目标完成: ${this.context!.subGoals.filter((sg) => sg.status === "completed").length}/${this.context!.subGoals.length}

## 最近步骤
${this.context!.steps.slice(-5)
	.map((s) => `[${s.type}] ${s.content.slice(0, 150)}`)
	.join("\n")}

## 反思要求
1. 评估当前策略是否有效
2. 识别可能的问题或瓶颈
3. 建议可能的调整

## 输出格式（JSON）
\`\`\`json
{
  "progressAssessment": "进展评估",
  "issuesIdentified": ["问题1", "问题2"],
  "suggestedAdjustments": ["调整1", "调整2"],
  "shouldContinue": true/false,
  "reason": "理由"
}
\`\`\``;

		let response = "";
		const selfReflectionPrompt = await getPrompt("selfReflection");
		await new Promise<void>((resolve, reject) => {
			invokeLlmWithCallback({
				model,
				prompt: reflectionPrompt,
				systemPrompt: selfReflectionPrompt,
				context: [],
				onChunk: (chunk) => {
					response += chunk;
				},
				onComplete: () => resolve(),
				onError: (err) => reject(new Error(err)),
			});
		});

		let adjustments: string[] = [];
		const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			try {
				const reflection = JSON.parse(jsonMatch[1]);
				adjustments = reflection.suggestedAdjustments || [];
			} catch {
				/* ignore */
			}
		}

		return {
			id: this.generateStepId(),
			type: "reflection",
			content: response.replace(/```json[\s\S]*?```/g, "").trim(),
			metadata: { adjustments },
			timestamp: Date.now(),
		};
	}

	// 结论阶段
	private async conclude(model: string): Promise<ReasoningStep> {
		const conclusionPrompt = `基于所有收集的信息，生成最终答案。

## 原始目标
${this.context!.goal}

## 收集的事实
${this.context!.workingMemory.facts.map((f) => `- ${f.content}`).join("\n") || "无"}

## 关键观察
${this.context!.observations.slice(-5)
	.map((o) => `[${o.source}] ${o.content.slice(0, 500)}`)
	.join("\n\n")}

## 要求
1. 综合所有信息给出完整答案
2. 如果有引用来源，标注出处
3. 答案应该直接回应用户的原始问题
4. 结构清晰，便于阅读`;

		let response = "";
		const informationSynthesisPrompt = await getPrompt("informationSynthesis");
		await new Promise<void>((resolve, reject) => {
			invokeLlmWithCallback({
				model,
				prompt: conclusionPrompt,
				systemPrompt: informationSynthesisPrompt,
				context: [],
				onChunk: (chunk) => {
					response += chunk;
				},
				onComplete: () => resolve(),
				onError: (err) => reject(new Error(err)),
			});
		});

		return {
			id: this.generateStepId(),
			type: "conclusion",
			content: response,
			timestamp: Date.now(),
		};
	}

	// 更新工作记忆
	private updateWorkingMemory(observation: ReasoningStep): void {
		// 添加到上下文窗口
		this.context!.workingMemory.contextWindow.push(
			observation.content.slice(0, 500),
		);
		if (this.context!.workingMemory.contextWindow.length > 10) {
			this.context!.workingMemory.contextWindow.shift();
		}

		// 提取事实（简化实现）
		if (observation.metadata?.observationSummary?.includes("成功")) {
			const fact: Fact = {
				id: this.generateStepId(),
				content: observation.content.slice(0, 200),
				source: "tool_observation",
				confidence: 0.8,
				timestamp: Date.now(),
			};
			this.context!.workingMemory.facts.push(fact);
		}

		this.config.onMemoryUpdate?.(this.context!.workingMemory);
	}

	// 应用策略调整
	private applyAdjustments(adjustments: string[]): void {
		// 根据反思建议调整策略
		for (const adjustment of adjustments) {
			if (adjustment.includes("切换") || adjustment.includes("更换")) {
				// 可能需要更换工具或策略
				console.log("[ReasoningEngine] 应用调整:", adjustment);
			}
		}
	}

	// 检查是否完成所有子目标
	private allSubGoalsCompleted(): boolean {
		return this.context!.subGoals.every(
			(sg) => sg.status === "completed" || sg.status === "skipped",
		);
	}

	// 生成后备答案
	private generateFallbackAnswer(): string {
		const observations = this.context!.observations.slice(-3)
			.map((o) => o.content)
			.join("\n\n");

		if (observations) {
			return `基于收集的信息：\n\n${observations}\n\n（注：推理过程已达到最大迭代次数）`;
		}
		return "抱歉，无法完成任务。请尝试提供更多细节或简化问题。";
	}

	// 添加步骤
	private addStep(step: ReasoningStep): void {
		this.context!.steps.push(step);
	}

	// 生成步骤ID
	private generateStepId(): string {
		return `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
	}

	// 获取工具摘要
	private getToolsSummary(): string {
		return toolRegistry
			.getAll()
			.map((t) => `- ${t.type}: ${t.description}`)
			.join("\n");
	}

	// 获取工具详细描述
	private getToolsDescription(): string {
		const toolDetails: Record<string, string> = {
			code_execute: "Python/JavaScript代码执行，用于计算、数据处理",
			web_search: "网络搜索，获取最新资讯",
			kb_search_chunks: "本地资料库检索",
			fetch_url: "抓取网页内容",
			doc_create: "创建新文档",
			doc_update: "更新文档",
			doc_patch: "局部修改文档",
			llm_call: "AI推理分析",
		};

		return toolRegistry
			.getAll()
			.map((t) => `### ${t.type}\n${toolDetails[t.type] || t.description}`)
			.join("\n\n");
	}

	// 取消推理
	cancel(): void {
		this.abortController?.abort();
	}

	// 获取当前状态
	getContext(): ReasoningContext | null {
		return this.context;
	}
}

// 单例导出
export const reasoningEngine = new ReasoningEngine();
