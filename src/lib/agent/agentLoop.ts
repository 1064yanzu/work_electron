// Agent 核心循环
// 实现 LLM 规划 -> 工具选择 -> 执行 -> 反馈 的完整闭环

import { invokeLlmWithCallback } from "../chat/api";
import {
	getAgentSystemPrompt as getConfigurableAgentSystemPrompt,
	getPrompt,
} from "../prompts";
import { settingsStore } from "../settingsStore";
import { errorRecovery } from "./errorRecoveryStrategies";
import { memoryStore } from "./memoryStore";
import { permissionStore } from "./permissionStore";
import { toolRegistry } from "./registry";
import { agentStore } from "./store";
import type {
	AgentTask,
	ThinkingPhase,
	ToolCall,
	ToolCallReflection,
	ToolContext,
	ToolType,
} from "./types";

// ==================== Agent 配置 ====================

export interface AgentLoopConfig {
	maxIterations?: number; // 最大迭代次数
	maxToolCalls?: number; // 最大工具调用次数
	timeout?: number; // 超时时间(ms)
	streamThinking?: boolean; // 是否流式输出思考过程
	autoApproveTools?: boolean; // 是否自动批准工具调用
	enableReflection?: boolean; // 是否启用反思机制
	maxRetries?: number; // 最大重试次数（默认 3）
	onThinking?: (text: string) => void; // 思考过程回调
	onToolCall?: (tool: string, input: Record<string, unknown>) => void;
	onToolResult?: (tool: string, result: unknown) => void;
	onReflection?: (toolCall: ToolCall, reflection: ToolCallReflection) => void; // 反思回调
	onComplete?: (result: string) => void;
	onError?: (error: string) => void;
}

const DEFAULT_CONFIG: AgentLoopConfig = {
	maxIterations: 10,
	maxToolCalls: 15,
	timeout: 180000, // 3 分钟
	streamThinking: true,
	autoApproveTools: false,
	enableReflection: true,
	maxRetries: 3,
};

// ==================== 工具调用解析 ====================

interface ParsedToolCall {
	tool: ToolType;
	input: Record<string, unknown>;
	reason?: string;
}

interface ParsedResponse {
	thinking?: string;
	toolCalls: ParsedToolCall[];
	finalAnswer?: string;
	needsMoreInfo?: boolean;
	isJsonPlan?: boolean; // 标记是否包含 JSON 计划
}

// 解析 AI 响应
function parseAgentResponse(response: string): ParsedResponse {
	const result: ParsedResponse = {
		toolCalls: [],
	};

	// 尝试提取思考过程
	const thinkingMatch = response.match(/<thinking>([\s\S]*?)<\/thinking>/i);
	if (thinkingMatch) {
		result.thinking = thinkingMatch[1].trim();
	}

	// 尝试提取工具调用
	const toolCallMatch = response.match(/<tool_call>([\s\S]*?)<\/tool_call>/gi);
	if (toolCallMatch) {
		for (const match of toolCallMatch) {
			try {
				const jsonMatch = match.match(/<tool_call>([\s\S]*?)<\/tool_call>/i);
				if (jsonMatch) {
					const parsed = JSON.parse(jsonMatch[1].trim());
					if (parsed.tool) {
						result.toolCalls.push({
							tool: parsed.tool as ToolType,
							input: parsed.input || {},
							reason: parsed.reason,
						});
					}
				}
			} catch {
				// 忽略解析错误
			}
		}
	}

	// 尝试提取 JSON 代码块格式的工具调用
	if (result.toolCalls.length === 0) {
		// 1. 尝试匹配 Markdown 代码块
		const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
		// 2. 尝试匹配纯 JSON 对象（如果以 { 开头）
		const jsonObjectMatch = !jsonBlockMatch
			? response.match(/^\s*(\{[\s\S]*\})\s*$/)
			: null;

		const jsonStr = jsonBlockMatch
			? jsonBlockMatch[1]
			: jsonObjectMatch
				? jsonObjectMatch[1]
				: null;

		if (jsonStr) {
			try {
				const parsed = JSON.parse(jsonStr);

				// 标记这是一个 JSON 计划
				if (parsed.plan || parsed.tool_calls || parsed.tool) {
					result.isJsonPlan = true;
				}

				// 处理 { plan: [...] } 格式
				if (parsed.plan && Array.isArray(parsed.plan)) {
					for (const item of parsed.plan) {
						if (item.tool) {
							result.toolCalls.push({
								tool: item.tool as ToolType,
								input: item.input || item.arguments || {},
								reason: item.reason,
							});
						}
					}
				}
				// 处理 { tool_calls: [...] } 格式
				else if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
					for (const call of parsed.tool_calls) {
						if (call.tool) {
							result.toolCalls.push({
								tool: call.tool as ToolType,
								input: call.input || call.arguments || {},
								reason: call.reason,
							});
						}
					}
				}
				// 处理单个工具调用 { tool: "..." }
				else if (parsed.tool) {
					result.toolCalls.push({
						tool: parsed.tool as ToolType,
						input: parsed.input || parsed.arguments || {},
						reason: parsed.reason,
					});
				}
			} catch {
				// 忽略解析错误
			}
		}
	}

	// 尝试提取最终答案
	const answerMatch = response.match(/<answer>([\s\S]*?)<\/answer>/i);
	if (answerMatch) {
		result.finalAnswer = answerMatch[1].trim();
	} else if (result.toolCalls.length === 0 && !result.isJsonPlan) {
		// 只有当不是 JSON 计划且没有工具调用时，才将整个响应视为最终答案
		// 避免将 { "plan": [] } 误判为最终答案
		result.finalAnswer = response
			.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
			.trim();
	}

	// 检查是否需要更多信息
	result.needsMoreInfo =
		response.toLowerCase().includes("need more information") ||
		response.includes("需要更多信息") ||
		response.includes("请提供更多");

	return result;
}

// ==================== 系统提示词 ====================

// 使用可配置的 Agent 系统提示词
async function getAgentSystemPrompt(
	availableTools: string[],
	context?: string,
): Promise<string> {
	return getConfigurableAgentSystemPrompt(availableTools, context);
}

// ==================== Agent 循环类 ====================

export class AgentLoop {
	private config: AgentLoopConfig;
	private abortController: AbortController | null = null;
	private toolCallCount = 0;
	private iterationCount = 0;
	private conversationHistory: Array<{
		role: "user" | "assistant" | "tool";
		content: string;
	}> = [];

	constructor(config: AgentLoopConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// 运行 Agent 循环
	async run(
		userQuery: string,
		context?: string,
		taskType: AgentTask["type"] = "custom",
	): Promise<string> {
		// 创建任务
		const task = agentStore.startTask(taskType, userQuery);

		this.abortController = new AbortController();
		this.toolCallCount = 0;
		this.iterationCount = 0;
		this.conversationHistory = [];

		const toolContext: ToolContext = {
			taskId: task.id,
			abortSignal: this.abortController.signal,
		};

		try {
			agentStore.updateTaskStatus("executing");

			// 初始化进度和思考阶段
			agentStore.initProgress();
			agentStore.clearThinkingSteps();
			agentStore.setThinkingPhase(
				"analyzing" as ThinkingPhase,
				"分析用户请求...",
			);

			// 获取活跃模型
			const activeModel = settingsStore.getActiveModel();
			if (!activeModel) {
				throw new Error("请先配置并选择一个模型");
			}

			// 构建工具描述
			const toolDescriptions = toolRegistry
				.getAll()
				.map((tool) => `- **${tool.type}**: ${tool.description}`);

			// 检索相关记忆
			const relevantMemories = await memoryStore.searchMemories(userQuery, 5);
			const memoryContext =
				memoryStore.formatMemoriesAsContext(relevantMemories);

			// 系统提示词（包含记忆上下文）
			const enhancedContext = context
				? `${context}\n\n${memoryContext}`
				: memoryContext;
			const systemPrompt = await getAgentSystemPrompt(
				toolDescriptions,
				enhancedContext || undefined,
			);

			// 添加用户消息到对话历史
			this.conversationHistory.push({ role: "user", content: userQuery });

			let finalResult = "";

			// 主循环
			while (this.iterationCount < (this.config.maxIterations || 10)) {
				if (this.abortController.signal.aborted) {
					agentStore.updateTaskStatus("cancelled");
					return "任务已取消";
				}

				this.iterationCount++;

				// 调用 LLM
				const llmResponse = await this.callLLM(activeModel, systemPrompt);

				// 解析响应
				const parsed = parseAgentResponse(llmResponse);

				// 输出思考过程
				if (parsed.thinking && this.config.streamThinking) {
					this.config.onThinking?.(parsed.thinking);
					// 保存思考过程到任务元数据
					agentStore.setThinking(parsed.thinking);
					agentStore.updateThinkingContent(parsed.thinking);
				}

				// 如果有最终答案且没有工具调用，结束循环
				if (parsed.finalAnswer && parsed.toolCalls.length === 0) {
					agentStore.setThinkingPhase(
						"concluding" as ThinkingPhase,
						"整理最终答案...",
					);
					agentStore.completePhase("concluding" as ThinkingPhase);
					finalResult = parsed.finalAnswer;
					break;
				}

				// 执行工具调用
				if (parsed.toolCalls.length > 0) {
					// 切换到执行阶段
					agentStore.setThinkingPhase(
						"executing" as ThinkingPhase,
						`执行 ${parsed.toolCalls.length} 个工具调用...`,
					);

					const toolResults: string[] = [];
					let webSearchResults: Array<{ title?: string; url?: string }> = [];
					let sawFetchUrl = false;

					for (const call of parsed.toolCalls) {
						if (this.toolCallCount >= (this.config.maxToolCalls || 15)) {
							toolResults.push(`[工具调用次数已达上限]`);
							break;
						}

						if (this.abortController.signal.aborted) break;

						this.config.onToolCall?.(call.tool, call.input);

						const result = await this.executeToolCall(
							call.tool,
							call.input,
							toolContext,
						);

						this.config.onToolResult?.(call.tool, result);

						if (call.tool === "fetch_url") {
							sawFetchUrl = true;
						}
						if (call.tool === "web_search") {
							const results = (result as any)?.results;
							if (Array.isArray(results)) {
								webSearchResults = results
									.map((r: any) => ({ title: r?.title, url: r?.url }))
									.filter(
										(r: any) =>
											typeof r?.url === "string" && r.url.startsWith("http"),
									);
							}
						}

						// 格式化工具结果
						const resultStr =
							typeof result === "string"
								? result
								: JSON.stringify(result, null, 2);

						const limit = call.tool === "fetch_url" ? 12000 : 2000;
						toolResults.push(
							`工具 ${call.tool} 结果:\n${resultStr.slice(0, limit)}`,
						);
					}

					// 自动补抓：仅有 web_search 时，补抓前几条的正文，避免“只有标题/摘要”
					// 触发条件：模型没主动调用 fetch_url，且用户意图是“搜索/查资料”或 research 任务
					const wantsDeepFetch =
						taskType === "research" ||
						/(^|\s)(搜索|搜一下|查一下|查找|检索|找资料|资料|论文|原文|全文|内容)(\s|$)/.test(
							userQuery,
						);

					if (
						wantsDeepFetch &&
						!sawFetchUrl &&
						webSearchResults.length > 0 &&
						this.toolCallCount < (this.config.maxToolCalls || 15)
					) {
						const remaining =
							(this.config.maxToolCalls || 15) - this.toolCallCount;
						const take = Math.max(
							0,
							Math.min(2, remaining, webSearchResults.length),
						);
						for (const r of webSearchResults.slice(0, take)) {
							if (this.abortController.signal.aborted) break;
							if (this.toolCallCount >= (this.config.maxToolCalls || 15)) break;
							if (!r.url) continue;
							const autoRes = await this.executeToolCall(
								"fetch_url",
								{
									url: r.url,
									title: r.title,
									saveToLibrary: false,
									maxChars: 8000,
								},
								toolContext,
							);
							const autoStr =
								typeof autoRes === "string"
									? autoRes
									: JSON.stringify(autoRes, null, 2);
							toolResults.push(
								`工具 fetch_url 结果(自动补抓):\n${autoStr.slice(0, 12000)}`,
							);
						}
					}

					// 添加工具结果到对话历史
					this.conversationHistory.push({
						role: "tool",
						content: toolResults.join("\n\n---\n\n"),
					});
				}

				// 如果有最终答案，结束循环
				if (parsed.finalAnswer) {
					finalResult = parsed.finalAnswer;
					break;
				}

				// 如果没有工具调用也没有最终答案，可能是需要更多信息
				if (parsed.toolCalls.length === 0 && !parsed.finalAnswer) {
					// 如果是空的 JSON 计划（例如 { "plan": [] }），我们需要继续循环让模型生成回答
					if (parsed.isJsonPlan) {
						continue;
					}
					finalResult = llmResponse;
					break;
				}
			}

			// 完成任务
			agentStore.completeTask(finalResult);

			// 提取记忆（异步，不阻塞）
			const currentTask = agentStore.getState().currentTask;
			if (currentTask) {
				memoryStore
					.extractMemoriesFromTask(
						userQuery,
						finalResult,
						currentTask.toolCalls,
					)
					.catch((err) => {
						console.warn("[AgentLoop] 提取记忆失败:", err);
					});
			}

			this.config.onComplete?.(finalResult);
			return finalResult;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "执行失败";
			agentStore.failTask(errorMessage);
			this.config.onError?.(errorMessage);
			throw error;
		} finally {
			this.abortController = null;
		}
	}

	// 调用 LLM
	private async callLLM(model: string, systemPrompt: string): Promise<string> {
		return new Promise((resolve, reject) => {
			let response = "";
			let lastThinkingLength = 0;
			let receivedFirstChunk = false; // 追踪是否已收到首个 chunk

			// 构建消息
			const messages = this.conversationHistory.map((msg) => ({
				role: msg.role === "tool" ? "user" : msg.role,
				content:
					msg.role === "tool" ? `[工具调用结果]\n${msg.content}` : msg.content,
			}));

			const lastMessage = messages[messages.length - 1];
			// 将最近上下文传入模型，避免"失忆"，并限制长度防止 prompt 过大
			const contextMessages = messages
				.slice(0, -1)
				.map((m) => m.content)
				.slice(-12);

			// 清空之前的部分思考内容
			agentStore.clearPartialThinking();

			// 设置等待 LLM 响应状态
			agentStore.setWaitingForLLM(true);

			invokeLlmWithCallback({
				model,
				prompt: lastMessage?.content || "",
				systemPrompt,
				context: contextMessages,
				onChunk: (chunk) => {
					// 首次收到 chunk 时，取消等待状态
					if (!receivedFirstChunk) {
						receivedFirstChunk = true;
						agentStore.setWaitingForLLM(false);
					}

					response += chunk;

					// 实时流式输出思考过程
					if (this.config.streamThinking) {
						// 检查是否在 <thinking> 标签内
						const thinkingStartIdx = response.indexOf("<thinking>");
						const thinkingEndIdx = response.indexOf("</thinking>");

						if (thinkingStartIdx !== -1) {
							// 提取当前的思考内容（可能不完整）
							const thinkingStart = thinkingStartIdx + 10; // '<thinking>'.length
							const thinkingEnd =
								thinkingEndIdx !== -1 ? thinkingEndIdx : response.length;
							const currentThinking = response.slice(
								thinkingStart,
								thinkingEnd,
							);

							// 只追加新增的部分
							if (currentThinking.length > lastThinkingLength) {
								const newContent = currentThinking.slice(lastThinkingLength);
								agentStore.appendThinking(newContent);
								this.config.onThinking?.(currentThinking);
								lastThinkingLength = currentThinking.length;
							}

							// 如果思考完成，更新最终思考内容
							if (thinkingEndIdx !== -1) {
								agentStore.setThinking(currentThinking.trim());
							}
						}
					}
				},
				onComplete: () => {
					// 确保取消等待状态
					agentStore.setWaitingForLLM(false);
					// 最终提取完整思考过程
					const thinkingMatch = response.match(
						/<thinking>([\s\S]*?)<\/thinking>/i,
					);
					if (thinkingMatch && this.config.streamThinking) {
						agentStore.setThinking(thinkingMatch[1].trim());
					}
					this.conversationHistory.push({
						role: "assistant",
						content: response,
					});
					resolve(response);
				},
				onError: (err) => {
					// 确保取消等待状态
					agentStore.setWaitingForLLM(false);
					reject(new Error(err));
				},
			});
		});
	}

	// 执行工具调用（带重试机制）
	private async executeToolCall(
		toolType: ToolType,
		input: Record<string, unknown>,
		context: ToolContext,
		retryCount: number = 0,
	): Promise<unknown> {
		this.toolCallCount++;

		const tool = toolRegistry.get(toolType);
		const toolName = tool?.name || toolType;
		const maxRetries = this.config.maxRetries || 3;

		// 权限检查
		const permResult = await permissionStore.requestPermission(
			`${context.taskId}-${this.toolCallCount}`,
			toolName,
			toolType,
			input,
		);

		if (permResult.decision === "denied") {
			return { error: `权限被拒绝: ${permResult.reason || "用户拒绝"}` };
		}

		// 创建工具调用记录
		const toolCallId = `${context.taskId}-tool-${this.toolCallCount}`;
		const toolCall: ToolCall = {
			id: toolCallId,
			type: toolType,
			name: toolName,
			input,
			status: "running",
			startedAt: Date.now(),
			retryCount,
			maxRetries,
		};

		// 如果是重试，更新现有记录；否则添加新记录
		if (retryCount > 0) {
			agentStore.updateToolCall(toolCallId, {
				status: "running",
				retryCount,
				startedAt: Date.now(),
			});
		} else {
			agentStore.addToolCall(toolCall);
		}

		try {
			const result = await toolRegistry.execute(toolType, input, context);

			// 如果执行失败但返回了结果，检查是否需要重试
			if (!result.success && result.error) {
				const shouldRetry = await this.shouldRetryAfterFailure(
					toolCall,
					result.error,
					context,
					retryCount,
					maxRetries,
				);

				if (shouldRetry.shouldRetry) {
					// 更新工具调用状态为 pending，准备重试
					agentStore.updateToolCall(toolCallId, {
						status: "pending",
						error: result.error,
						reflection: shouldRetry.reflection,
					});

					// 等待一小段时间后重试
					await new Promise((resolve) => setTimeout(resolve, 1000));

					// 使用调整后的输入重试
					const adjustedInput = shouldRetry.reflection?.adjustedInput || input;
					const alternativeTool = shouldRetry.reflection?.alternativeTool;

					return this.executeToolCall(
						alternativeTool || toolType,
						adjustedInput,
						context,
						retryCount + 1,
					);
				}
			}

			// 更新工具调用状态
			agentStore.updateToolCall(toolCallId, {
				status: result.success ? "completed" : "error",
				output: result.data,
				error: result.error,
				completedAt: Date.now(),
				duration: Date.now() - (toolCall.startedAt || Date.now()),
				retryCount,
			});

			// 添加 artifacts
			if (result.artifacts) {
				agentStore.addArtifacts(result.artifacts);
			}

			return result.success ? result.data : { error: result.error };
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "执行失败";

			// 检查是否需要重试
			const shouldRetry = await this.shouldRetryAfterFailure(
				toolCall,
				errorMsg,
				context,
				retryCount,
				maxRetries,
			);

			if (shouldRetry.shouldRetry) {
				// 更新工具调用状态为 pending，准备重试
				agentStore.updateToolCall(toolCallId, {
					status: "pending",
					error: errorMsg,
					reflection: shouldRetry.reflection,
				});

				// 等待一小段时间后重试
				await new Promise((resolve) => setTimeout(resolve, 1000));

				// 使用调整后的输入重试
				const adjustedInput = shouldRetry.reflection?.adjustedInput || input;
				const alternativeTool = shouldRetry.reflection?.alternativeTool;

				return this.executeToolCall(
					alternativeTool || toolType,
					adjustedInput,
					context,
					retryCount + 1,
				);
			}

			// 不再重试，标记为失败
			agentStore.updateToolCall(toolCallId, {
				status: "error",
				error: errorMsg,
				completedAt: Date.now(),
				duration: Date.now() - (toolCall.startedAt || Date.now()),
				retryCount,
				reflection: shouldRetry.reflection,
			});

			return { error: errorMsg };
		}
	}

	// 判断是否应该重试
	private async shouldRetryAfterFailure(
		toolCall: ToolCall,
		error: string,
		context: ToolContext,
		retryCount: number,
		maxRetries: number,
	): Promise<{ shouldRetry: boolean; reflection?: ToolCallReflection }> {
		// 生成错误恢复策略
		const recoveryStrategy = errorRecovery.generateStrategy(
			error,
			toolCall.type,
			toolCall.name,
			retryCount,
			maxRetries,
		);

		// 检查是否可以自动重试
		const canAutoRetry = errorRecovery.shouldAutoRetry(
			recoveryStrategy.category,
			retryCount,
			maxRetries,
		);

		// 更新工具调用统计
		agentStore.updateToolCallStats(false, true);

		// 设置错误恢复策略提示（供 UI 使用）
		if (!canAutoRetry) {
			// 如果不能自动重试，将策略设置到 store 供 UI 展示
			agentStore.setPendingErrorRecovery(toolCall.id, recoveryStrategy);

			// 切换到反思阶段
			agentStore.setThinkingPhase(
				"reflecting" as ThinkingPhase,
				`分析失败原因: ${recoveryStrategy.category}`,
			);
		}

		// 如果已超过最大重试次数，不再重试
		if (retryCount >= maxRetries) {
			return { shouldRetry: false };
		}

		// 针对特定错误类型的快速处理（不需要反思）

		// 1. Python 缩进错误 - 不重试，让 LLM 重新生成
		if (error.includes("IndentationError") || error.includes("unindent")) {
			return {
				shouldRetry: false,
				reflection: {
					reason: "Python 代码缩进错误",
					suggestion:
						"代码格式有误。请重新生成代码，确保：1) 使用 \\n 表示换行；2) 每级缩进使用 4 个空格；3) 不要在 JSON 字符串中使用实际换行。",
					shouldRetry: false,
				},
			};
		}

		// 2. 语法错误 - 不重试
		if (error.includes("SyntaxError") || error.includes("语法错误")) {
			return {
				shouldRetry: false,
				reflection: {
					reason: "代码语法错误",
					suggestion: "代码存在语法错误，请检查并重新生成正确的代码。",
					shouldRetry: false,
				},
			};
		}

		// 3. 文件不存在 - 不重试
		if (
			error.includes("文件不存在") ||
			error.includes("No such file") ||
			error.includes("not found")
		) {
			return {
				shouldRetry: false,
				reflection: {
					reason: "文件路径错误或文件不存在",
					suggestion:
						"请检查文件路径是否正确。如果是临时文件，请确认文件已成功保存。",
					shouldRetry: false,
				},
			};
		}

		// 4. 权限错误 - 不重试
		if (
			error.includes("Permission denied") ||
			error.includes("权限") ||
			error.includes("不允许")
		) {
			return {
				shouldRetry: false,
				reflection: {
					reason: "权限不足",
					suggestion: "没有权限访问该资源，请使用其他方式或路径。",
					shouldRetry: false,
				},
			};
		}

		// 如果未启用反思机制，根据错误类型决定是否重试
		if (!this.config.enableReflection) {
			// 对于网络错误、超时等可重试错误，自动重试
			const retryableErrors = [
				"timeout",
				"网络",
				"network",
				"连接",
				"connection",
				"ECONNREFUSED",
				"ETIMEDOUT",
				"ENOTFOUND",
			];
			const shouldAutoRetry = retryableErrors.some((keyword) =>
				error.toLowerCase().includes(keyword.toLowerCase()),
			);
			return { shouldRetry: shouldAutoRetry };
		}

		// 启用反思机制，调用 LLM 分析失败原因
		try {
			const reflection = await this.reflectOnFailure(toolCall, error, context);

			// 触发反思回调
			if (this.config.onReflection && reflection) {
				this.config.onReflection(toolCall, reflection);
			}

			return {
				shouldRetry: reflection?.shouldRetry ?? false,
				reflection: reflection ?? undefined,
			};
		} catch (reflectionError) {
			// 反思失败，根据错误类型决定是否重试
			console.warn("[AgentLoop] 反思失败:", reflectionError);
			const retryableErrors = ["timeout", "网络", "network", "连接"];
			const shouldAutoRetry = retryableErrors.some((keyword) =>
				error.toLowerCase().includes(keyword.toLowerCase()),
			);
			return { shouldRetry: shouldAutoRetry };
		}
	}

	// 反思失败原因
	private async reflectOnFailure(
		toolCall: ToolCall,
		error: string,
		context: ToolContext,
	): Promise<ToolCallReflection | null> {
		const activeModel = settingsStore.getActiveModel();
		if (!activeModel) {
			return null;
		}

		const tool = toolRegistry.get(toolCall.type);
		const availableTools = toolRegistry
			.getAll()
			.map((t) => `- ${t.type}: ${t.description}`)
			.join("\n");

		const reflectionPrompt = `你是一个智能助手，需要分析工具调用失败的原因并提供修正建议。

## 失败的工具调用
- 工具类型: ${toolCall.type}
- 工具名称: ${toolCall.name}
- 工具描述: ${tool?.description || "无"}
- 输入参数: ${JSON.stringify(toolCall.input, null, 2)}
- 错误信息: ${error}

## 可用工具
${availableTools}

## 任务上下文
任务ID: ${context.taskId}
当前对话历史: ${this.conversationHistory
			.slice(-3)
			.map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
			.join("\n")}

## 请分析
1. 失败的根本原因是什么？（参数错误/网络问题/权限不足/工具不适用等）
2. 是否应该重试？（考虑：错误是否可恢复、是否有替代方案）
3. 如果重试，需要如何调整输入参数？
4. 是否有更合适的替代工具？

## 响应格式（JSON）
{
  "reason": "失败原因分析（详细说明）",
  "suggestion": "修正建议（如何修复）",
  "shouldRetry": true/false,
  "adjustedInput": {调整后的输入参数，如果不需要调整则为null},
  "alternativeTool": "替代工具类型（如果有），否则为null"
}

请只返回 JSON，不要包含其他文本。`;

		try {
			let response = "";
			const errorAnalysisPrompt = await getPrompt("errorAnalysis");
			await new Promise<void>((resolve, reject) => {
				invokeLlmWithCallback({
					model: activeModel,
					prompt: reflectionPrompt,
					systemPrompt: errorAnalysisPrompt,
					context: [],
					onChunk: (chunk) => {
						response += chunk;
					},
					onComplete: () => resolve(),
					onError: (err) => reject(new Error(err)),
				});
			});

			// 尝试解析 JSON 响应
			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					reason: parsed.reason || "未知原因",
					suggestion: parsed.suggestion || "无建议",
					shouldRetry: parsed.shouldRetry ?? false,
					adjustedInput: parsed.adjustedInput || undefined,
					alternativeTool: parsed.alternativeTool || undefined,
				};
			}

			// 如果无法解析 JSON，尝试从文本中提取信息
			return {
				reason: error,
				suggestion: "请检查输入参数和网络连接",
				shouldRetry:
					error.toLowerCase().includes("timeout") ||
					error.toLowerCase().includes("网络"),
				adjustedInput: undefined,
				alternativeTool: undefined,
			};
		} catch (err) {
			console.error("[AgentLoop] 反思过程出错:", err);
			return null;
		}
	}

	// 取消执行
	cancel(): void {
		this.abortController?.abort();
		agentStore.cancelTask();
	}

	// 获取状态
	getStatus(): { iteration: number; toolCalls: number; isRunning: boolean } {
		return {
			iteration: this.iterationCount,
			toolCalls: this.toolCallCount,
			isRunning: this.abortController !== null,
		};
	}
}

// ==================== 便捷函数 ====================

// 创建并运行 Agent
export async function runAgent(
	query: string,
	options?: {
		context?: string;
		taskType?: AgentTask["type"];
		config?: AgentLoopConfig;
	},
): Promise<string> {
	const loop = new AgentLoop(options?.config);
	return loop.run(query, options?.context, options?.taskType);
}

// 创建研究任务
export async function runResearchAgent(
	query: string,
	config?: AgentLoopConfig,
): Promise<string> {
	const loop = new AgentLoop({
		...config,
		maxIterations: 5,
		maxToolCalls: 10,
	});

	// 先执行本地检索
	const context = `用户想要研究: ${query}\n请先使用 kb_search_chunks 检索本地资料库，如果结果不足再使用 web_search。`;

	return loop.run(query, context, "research");
}

// 单例 Agent Loop（用于 UI 集成）
let currentAgentLoop: AgentLoop | null = null;

export function getCurrentAgentLoop(): AgentLoop | null {
	return currentAgentLoop;
}

export function createAgentLoop(config?: AgentLoopConfig): AgentLoop {
	if (currentAgentLoop) {
		currentAgentLoop.cancel();
	}
	currentAgentLoop = new AgentLoop(config);
	return currentAgentLoop;
}

export function cancelCurrentAgent(): void {
	currentAgentLoop?.cancel();
	currentAgentLoop = null;
}
