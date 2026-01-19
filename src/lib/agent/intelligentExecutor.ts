// 智能执行器 - 桥接新的智能Agent系统与现有UI
// 提供与agentExecutor相同的接口，但使用更智能的实现

import { events } from "../events";
import { settingsStore } from "../settingsStore";
import {
	type AgentState,
	IntelligentAgent,
	type IntelligentAgentConfig,
	type ThinkingStep,
} from "./core/intelligentAgent";
import { enhancedMemory } from "./core/memorySystem";
import { toolSelector } from "./core/toolSelector";
import { agentStore } from "./store";

// 思考步骤事件
const AGENT_THINKING_EVENT = "agent:thinking_step";
const AGENT_STATE_CHANGE_EVENT = "agent:state_change";

// 执行器配置
interface IntelligentExecutorConfig {
	maxToolCalls?: number;
	timeout?: number;
	enableIntelligentMode?: boolean; // 是否启用智能模式
	enableThinkingDisplay?: boolean; // 是否展示思考过程
	enableMemory?: boolean; // 是否启用记忆
}

const DEFAULT_CONFIG: IntelligentExecutorConfig = {
	maxToolCalls: 20,
	timeout: 180000, // 3 分钟
	enableIntelligentMode: true,
	enableThinkingDisplay: true,
	enableMemory: true,
};

class IntelligentAgentExecutor {
	private config: IntelligentExecutorConfig;
	private agent: IntelligentAgent | null = null;
	private thinkingSteps: ThinkingStep[] = [];

	constructor(config: IntelligentExecutorConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// 获取或创建智能Agent实例
	private getAgent(): IntelligentAgent {
		if (!this.agent) {
			const agentConfig: Partial<IntelligentAgentConfig> = {
				maxIterations: 15,
				maxToolCalls: this.config.maxToolCalls || 20,
				enableMemory: this.config.enableMemory ?? true,
				enableSelfReflection: true,
				onStateChange: (state: AgentState) => {
					events.emit(AGENT_STATE_CHANGE_EVENT, { state });
				},
				onThinkingStep: (step: ThinkingStep) => {
					this.thinkingSteps.push(step);
					events.emit(AGENT_THINKING_EVENT, {
						step,
						allSteps: this.thinkingSteps,
					});
				},
				onProgress: (_progress: number, message: string) => {
					agentStore.setThinking(message);
				},
				onToolCall: (toolCall) => {
					console.log(
						"[IntelligentExecutor] 工具调用:",
						toolCall.type,
						toolCall.input,
					);
				},
			};

			this.agent = new IntelligentAgent(agentConfig);
		}
		return this.agent;
	}

	// 执行研究任务（智能模式）
	async executeResearchTask(query: string): Promise<void> {
		this.thinkingSteps = [];

		try {
			const agent = this.getAgent();
			const result = await agent.execute(query, {
				context: ["这是一个研究任务，需要检索资料并综合分析"],
			});

			// 结果已由 agent 内部存储到 agentStore
			console.log("[IntelligentExecutor] 研究任务完成:", result.slice(0, 200));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "执行失败";
			agentStore.failTask(errorMessage);
		}
	}

	// 执行自定义任务（智能模式）
	async executeCustomTask(
		query: string,
		systemPrompt?: string,
		_config?: IntelligentExecutorConfig,
		options?: {
			conversationContext?: string[];
			fallbackSearchQuery?: string | null;
			activeDocContent?: string | null;
			attachedContexts?: Array<{ title: string; content: string }>;
		},
	): Promise<void> {
		this.thinkingSteps = [];

		const activeModel = settingsStore.getActiveModel();
		if (!activeModel) {
			agentStore.failTask("请先配置并选择一个模型");
			return;
		}

		try {
			const agent = this.getAgent();

			// 准备上下文
			const contextParts: string[] = [];

			if (systemPrompt) {
				contextParts.push(`系统提示: ${systemPrompt}`);
			}

			if (options?.conversationContext?.length) {
				contextParts.push(
					`对话历史: ${options.conversationContext.slice(-6).join("\n")}`,
				);
			}

			// 执行任务
			const result = await agent.execute(query, {
				context: contextParts,
				attachedDocs: options?.attachedContexts,
				activeDocContent: options?.activeDocContent || undefined,
			});

			console.log("[IntelligentExecutor] 任务完成:", result.slice(0, 200));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "执行失败";
			agentStore.failTask(errorMessage);
		}
	}

	// 取消当前任务
	cancel(): void {
		if (this.agent) {
			this.agent.cancel();
		}
		agentStore.cancelTask();
	}

	// 获取思考步骤
	getThinkingSteps(): ThinkingStep[] {
		return [...this.thinkingSteps];
	}

	// 获取当前状态
	getState(): AgentState {
		return this.agent?.getState() || "idle";
	}

	// 获取记忆系统
	getMemory() {
		return enhancedMemory;
	}

	// 获取工具选择器
	getToolSelector() {
		return toolSelector;
	}

	// 清理资源
	dispose(): void {
		if (this.agent) {
			this.agent.stop();
			this.agent = null;
		}
		this.thinkingSteps = [];
	}

	// 分析任务意图（快速）
	async analyzeIntent(query: string) {
		return toolSelector.analyzeIntent(query);
	}

	// 获取工具推荐
	async getToolRecommendations(goal: string, limit = 3) {
		return toolSelector.getRecommendations(goal, limit);
	}

	// 搜索相关记忆
	async searchMemories(query: string, limit = 5) {
		return enhancedMemory.retrieveRelevantMemories(query, limit);
	}
}

// 单例导出
export const intelligentExecutor = new IntelligentAgentExecutor();

// 兼容原有接口的包装函数
export function createIntelligentExecutor(
	config?: IntelligentExecutorConfig,
): IntelligentAgentExecutor {
	return new IntelligentAgentExecutor(config);
}
