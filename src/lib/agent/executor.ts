/**
 * Agent Executor - SDK Version with Anthropic Proxy
 *
 * Uses Claude Agent SDK for ALL models by routing through the local Anthropic proxy
 * which translates requests to our multi-provider LLM backend.
 *
 * Architecture:
 *   SDK -> ANTHROPIC_BASE_URL (http://127.0.0.1:8765) -> Anthropic Proxy -> Multi-Provider LLM
 */

import { settingsStore } from "../settingsStore";
import { skillsStore } from "../skillsStore";
import { type AgentMessage, ClaudeAgentService } from "./claudeAgentService";
import { agentStore } from "./store";
import type { AgentTaskStep } from "./types";

// Agent 执行配置
interface AgentExecutorConfig {
	maxToolCalls?: number;
	timeout?: number;
	autoExecute?: boolean;
}

/**
 * Build skills context from enabled skills for system prompt
 */
function buildSkillsContext(): string {
	const enabledSkills = skillsStore.getEnabledSkills();

	if (enabledSkills.length === 0) {
		return "";
	}

	let context = "\n\n## 可用技能 (Skills)\n\n";
	context += "以下是当前启用的技能，你可以根据用户需求使用它们：\n\n";

	for (const skill of enabledSkills) {
		context += `### ${skill.name}\n`;
		if (skill.description) {
			context += `${skill.description}\n`;
		}
		context += "\n";
	}

	return context;
}

/**
 * SDK-based Agent Executor
 *
 * Routes ALL models through Claude Agent SDK via local Anthropic proxy.
 * The proxy translates Anthropic API calls to our multi-provider backend.
 */
class AgentExecutor {
	private abortController: AbortController | null = null;
	private sdkService: ClaudeAgentService;

	constructor() {
		this.sdkService = new ClaudeAgentService();
	}

	/**
	 * Execute a custom task using Claude Agent SDK
	 */
	async executeCustomTask(
		query: string,
		systemPrompt?: string,
		_config: AgentExecutorConfig = {},
		options?: {
			conversationContext?: string[];
			fallbackSearchQuery?: string | null;
			activeDocContent?: string | null;
			attachedContexts?: Array<{ title: string; content: string }>;
			attachedFiles?: Array<{ title: string; path: string }>;
			onChunk?: (chunk: string) => void;
		},
	): Promise<void> {
		// Ensure skills store is initialized
		await skillsStore.init();

		const activeModel = settingsStore.getActiveModel();
		console.log("[AgentExecutor SDK] Active model:", activeModel);

		const enabledSkills = skillsStore.getEnabledSkills();
		console.log(
			"[AgentExecutor SDK] Enabled skills:",
			enabledSkills.map((s) => s.name),
		);

		// Start task in UI store
		agentStore.startTask("custom", query);

		// Build initial steps for UI
		const analysisStep: AgentTaskStep = {
			id: "analysis-step",
			title: "分析任务",
			status: "running",
			kind: "analysis",
		};
		agentStore.setTaskSteps([analysisStep]);

		this.abortController = new AbortController();

		// Build enhanced system prompt with context and skills
		let enhancedPrompt = systemPrompt || "";

		// Add skills context
		enhancedPrompt += buildSkillsContext();

		// Add conversation context if available
		if (options?.conversationContext?.length) {
			enhancedPrompt +=
				"\n\n## 对话历史\n" + options.conversationContext.join("\n");
		}

		// Add attached contexts
		if (options?.attachedContexts?.length) {
			enhancedPrompt += "\n\n## 用户附加资料\n";
			for (const ctx of options.attachedContexts) {
				enhancedPrompt += `### ${ctx.title}\n${ctx.content}\n\n`;
			}
		}

		// Add attached file paths
		if (options?.attachedFiles?.length) {
			enhancedPrompt += "\n\n## 用户附加的文件\n";
			for (const file of options.attachedFiles) {
				enhancedPrompt += `- ${file.title}: ${file.path}\n`;
			}
		}

		// Add active document context
		if (options?.activeDocContent) {
			enhancedPrompt +=
				"\n\n## 当前编辑器文档\n```\n" + options.activeDocContent + "\n```";
		}

		let finalResult = "";
		let toolStepCounter = 0;
		let lastToolCallId: string | null = null;

		try {
			await this.sdkService.execute({
				prompt: query,
				systemPrompt: enhancedPrompt || undefined,
				abortController: this.abortController,

				onChunk: (text) => {
					finalResult += text;
					options?.onChunk?.(text);
				},

				onMessage: (message: AgentMessage) => {
					// Update UI based on message type
					switch (message.type) {
						case "tool_call": {
							toolStepCounter++;
							const toolCallId = `sdk-tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

							// 构建工具描述，包含参数信息
							let description =
								message.content || `Calling ${message.toolName || "Tool"}...`;
							if (
								message.toolInput &&
								Object.keys(message.toolInput).length > 0
							) {
								const inputDesc = Object.entries(message.toolInput)
									.map(
										([k, v]) =>
											`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
									)
									.slice(0, 3) // 最多显示3个参数
									.join(", ");
								description = inputDesc;
							}

							// 推断工具类型
							const inferToolType = (
								name: string,
							): import("./types").ToolType => {
								const lower = name?.toLowerCase() || "";
								if (
									lower === "bash" ||
									lower.includes("terminal") ||
									lower.includes("shell")
								)
									return "code_execute";
								if (lower.includes("skill")) return "skill_call";
								if (lower.includes("search")) return "web_search";
								if (lower.includes("read") || lower.includes("view"))
									return "file_read";
								if (lower.includes("write") || lower.includes("edit"))
									return "file_write";
								if (lower.includes("list") || lower.includes("ls"))
									return "file_list";
								return "custom";
							};

							// 创建并添加 ToolCall 到 store，这会触发 tool_started 事件
							const toolCall: import("./types").ToolCall = {
								id: toolCallId,
								type: inferToolType(message.toolName || ""),
								name: message.toolName || "Tool",
								description: description,
								input: message.toolInput || {},
								status: "running",
								startedAt: Date.now(),
							};
							console.log("[AgentExecutor SDK] Adding ToolCall to store:", {
								id: toolCall.id,
								name: toolCall.name,
								type: toolCall.type,
								hasCurrentTask: !!agentStore.getState().currentTask,
							});
							agentStore.addToolCall(toolCall);

							// 同时添加任务步骤到 UI
							const toolStep: AgentTaskStep = {
								id: `tool-step-${toolStepCounter}`,
								title: message.toolName || "Tool",
								description: description,
								status: "running",
								kind: "custom",
							};

							// Get current steps and append
							const currentSteps =
								agentStore.getState().currentTask?.steps || [];
							agentStore.setTaskSteps([...currentSteps, toolStep]);

							// 保存 toolCallId 以便 tool_result 使用
							lastToolCallId = toolCallId;
							break;
						}

						case "tool_result": {
							// 更新最新的工具调用状态
							if (lastToolCallId) {
								agentStore.updateToolCall(lastToolCallId, {
									output: message.toolOutput,
									status: message.status === "error" ? "error" : "completed",
									completedAt: Date.now(),
								});
							}

							// 更新最新的工具步骤状态和描述
							const steps = agentStore.getState().currentTask?.steps || [];
							if (steps.length > 0) {
								const lastStep = steps[steps.length - 1];
								if (
									lastStep.status === "running" ||
									lastStep.status === "pending"
								) {
									// 格式化输出内容
									const outputStr =
										typeof message.toolOutput === "string"
											? message.toolOutput
											: JSON.stringify(message.toolOutput, null, 2);

									// 追加结果到描述中（限制长度避免 UI 爆炸）
									const truncatedOutput =
										outputStr.length > 1000
											? outputStr.slice(0, 1000) + "\n...(truncated)"
											: outputStr;

									const newDescription = `${lastStep.description}\n\n**Result:**\n\`\`\`\n${truncatedOutput}\n\`\`\``;

									const updatedSteps = [...steps];
									updatedSteps[updatedSteps.length - 1] = {
										...lastStep,
										description: newDescription,
										status: message.status === "error" ? "error" : "completed",
									};
									agentStore.setTaskSteps(updatedSteps);
								}
							}
							break;
						}

						case "assistant":
							// Text content - already handled by onChunk
							break;

						case "result":
							if (message.status === "completed") {
								agentStore.updateTaskStepByKind("analysis", "completed");
							}
							break;

						case "system":
							console.log(
								"[AgentExecutor SDK] System message:",
								message.content,
							);
							break;
					}
				},

				onComplete: (result) => {
					if (result.success) {
						// Mark analysis step as complete
						agentStore.updateTaskStepByKind("analysis", "completed");
						agentStore.completeTask(
							finalResult || result.summary || "Task completed",
						);
					} else {
						agentStore.failTask(result.summary || "Task failed");
					}
				},
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "执行失败";
			console.error("[AgentExecutor SDK] Error:", errorMessage);
			agentStore.failTask(errorMessage);
		} finally {
			this.abortController = null;
		}
	}

	/**
	 * Execute a research task
	 */
	async executeResearchTask(
		query: string,
		config: AgentExecutorConfig = {},
	): Promise<void> {
		// Research task is just a custom task with research-focused prompt
		const researchPrompt = `你是一个研究助手。请对以下主题进行深入研究：

${query}

请使用 WebSearch 工具搜索相关信息，然后综合整理成一份全面的研究报告。`;

		return this.executeCustomTask(query, researchPrompt, config);
	}

	/**
	 * Abort current execution (alias for cancel)
	 */
	abort(): void {
		this.cancel();
	}

	/**
	 * Cancel current execution
	 */
	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		agentStore.cancelTask();
	}

	/**
	 * Check if currently executing
	 */
	isExecuting(): boolean {
		return this.abortController !== null;
	}
}

// Export singleton instance
export const agentExecutor = new AgentExecutor();
