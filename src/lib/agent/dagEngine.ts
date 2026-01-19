// DAG 执行引擎
// 支持任务拆解、节点依赖图、并发调度、取消/重试、预算控制

import { permissionStore } from "./permissionStore";
import { toolRegistry } from "./registry";
import { agentStore } from "./store";
import {
	createToolCall,
	type ToolContext,
	type ToolResult,
	type ToolType,
} from "./types";

// ==================== DAG 节点类型 ====================

export type DAGNodeKind = "llm_plan" | "tool_call" | "synthesis" | "custom";

export type DAGNodeStatus =
	| "queued" // 等待执行
	| "blocked" // 被依赖阻塞
	| "running" // 正在执行
	| "succeeded" // 执行成功
	| "failed" // 执行失败
	| "canceled"; // 已取消

// DAG 节点定义
export interface DAGNode {
	id: string;
	kind: DAGNodeKind;
	name: string;
	status: DAGNodeStatus;
	dependsOn: string[]; // 依赖的节点 ID
	input?: Record<string, unknown>;
	output?: unknown;
	error?: string;
	retryCount: number;
	maxRetries: number;
	createdAt: number;
	startedAt?: number;
	finishedAt?: number;
	toolType?: ToolType; // 如果是 tool_call 类型
	toolCallId?: string; // 关联的 ToolCall ID
}

// ==================== 预算控制 ====================

export interface ExecutionBudget {
	maxTokens?: number; // 最大 token 数
	maxToolCalls?: number; // 最大工具调用次数
	maxTimeMs?: number; // 最大执行时间（毫秒）
	maxRetries?: number; // 单节点最大重试次数
	maxConcurrency?: number; // 最大并发数
}

export interface BudgetUsage {
	tokensUsed: number;
	toolCallsUsed: number;
	timeElapsedMs: number;
	retriesUsed: number;
}

const DEFAULT_BUDGET: ExecutionBudget = {
	maxTokens: 100000,
	maxToolCalls: 20,
	maxTimeMs: 300000, // 5 分钟
	maxRetries: 3,
	maxConcurrency: 3,
};

// ==================== DAG 执行器 ====================

export interface DAGExecutorConfig {
	budget?: Partial<ExecutionBudget>;
	onNodeStart?: (node: DAGNode) => void;
	onNodeComplete?: (node: DAGNode) => void;
	onNodeError?: (node: DAGNode, error: string) => void;
	onProgress?: (completed: number, total: number) => void;
}

export class DAGExecutor {
	private nodes: Map<string, DAGNode> = new Map();
	private budget: ExecutionBudget;
	private usage: BudgetUsage = {
		tokensUsed: 0,
		toolCallsUsed: 0,
		timeElapsedMs: 0,
		retriesUsed: 0,
	};
	private startTime: number = 0;
	private abortController: AbortController | null = null;
	private config: DAGExecutorConfig;
	private taskId: string;
	private runningNodes: Set<string> = new Set();

	constructor(taskId: string, config: DAGExecutorConfig = {}) {
		this.taskId = taskId;
		this.config = config;
		this.budget = { ...DEFAULT_BUDGET, ...config.budget };
	}

	// ==================== 节点管理 ====================

	addNode(node: Omit<DAGNode, "status" | "retryCount" | "createdAt">): DAGNode {
		const fullNode: DAGNode = {
			...node,
			status: "queued",
			retryCount: 0,
			maxRetries: this.budget.maxRetries || 3,
			createdAt: Date.now(),
		};
		this.nodes.set(node.id, fullNode);
		return fullNode;
	}

	addToolCallNode(
		id: string,
		toolType: ToolType,
		name: string,
		input: Record<string, unknown>,
		dependsOn: string[] = [],
	): DAGNode {
		return this.addNode({
			id,
			kind: "tool_call",
			name,
			toolType,
			input,
			dependsOn,
			maxRetries: this.budget.maxRetries || 3,
		});
	}

	addLLMPlanNode(
		id: string,
		name: string,
		input: Record<string, unknown>,
		dependsOn: string[] = [],
	): DAGNode {
		return this.addNode({
			id,
			kind: "llm_plan",
			name,
			input,
			dependsOn,
			maxRetries: 1, // LLM 规划通常不重试
		});
	}

	addSynthesisNode(
		id: string,
		name: string,
		input: Record<string, unknown>,
		dependsOn: string[] = [],
	): DAGNode {
		return this.addNode({
			id,
			kind: "synthesis",
			name,
			input,
			dependsOn,
			maxRetries: 1,
		});
	}

	getNode(id: string): DAGNode | undefined {
		return this.nodes.get(id);
	}

	getAllNodes(): DAGNode[] {
		return Array.from(this.nodes.values());
	}

	// ==================== 依赖检查 ====================

	private canExecute(node: DAGNode): boolean {
		if (node.status !== "queued" && node.status !== "blocked") {
			return false;
		}

		// 检查所有依赖是否已完成
		for (const depId of node.dependsOn) {
			const dep = this.nodes.get(depId);
			if (!dep || dep.status !== "succeeded") {
				return false;
			}
		}

		return true;
	}

	private getReadyNodes(): DAGNode[] {
		return Array.from(this.nodes.values()).filter((node) =>
			this.canExecute(node),
		);
	}

	private updateBlockedNodes(): void {
		for (const node of this.nodes.values()) {
			if (node.status === "queued") {
				// 检查是否有依赖失败或取消
				const hasFailedDep = node.dependsOn.some((depId) => {
					const dep = this.nodes.get(depId);
					return dep && (dep.status === "failed" || dep.status === "canceled");
				});

				if (hasFailedDep) {
					node.status = "canceled";
					node.error = "Dependency failed or canceled";
				} else if (!this.canExecute(node)) {
					node.status = "blocked";
				}
			}
		}
	}

	// ==================== 预算检查 ====================

	private checkBudget(): { ok: boolean; reason?: string } {
		const elapsed = Date.now() - this.startTime;

		if (this.budget.maxTimeMs && elapsed > this.budget.maxTimeMs) {
			return {
				ok: false,
				reason: `Time budget exceeded: ${elapsed}ms > ${this.budget.maxTimeMs}ms`,
			};
		}

		if (
			this.budget.maxToolCalls &&
			this.usage.toolCallsUsed >= this.budget.maxToolCalls
		) {
			return {
				ok: false,
				reason: `Tool call budget exceeded: ${this.usage.toolCallsUsed} >= ${this.budget.maxToolCalls}`,
			};
		}

		if (
			this.budget.maxTokens &&
			this.usage.tokensUsed >= this.budget.maxTokens
		) {
			return {
				ok: false,
				reason: `Token budget exceeded: ${this.usage.tokensUsed} >= ${this.budget.maxTokens}`,
			};
		}

		return { ok: true };
	}

	// ==================== 节点执行 ====================

	private async executeNode(
		node: DAGNode,
		context: ToolContext,
	): Promise<void> {
		node.status = "running";
		node.startedAt = Date.now();
		this.runningNodes.add(node.id);
		this.config.onNodeStart?.(node);

		try {
			let result: unknown;

			switch (node.kind) {
				case "tool_call":
					result = await this.executeToolCallNode(node, context);
					break;
				case "llm_plan":
					result = await this.executeLLMPlanNode(node, context);
					break;
				case "synthesis":
					result = await this.executeSynthesisNode(node, context);
					break;
				case "custom":
					result = await this.executeCustomNode(node, context);
					break;
			}

			node.status = "succeeded";
			node.output = result;
			node.finishedAt = Date.now();
			this.config.onNodeComplete?.(node);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			// 检查是否可以重试
			if (node.retryCount < node.maxRetries) {
				node.retryCount++;
				node.status = "queued";
				this.usage.retriesUsed++;
				console.log(
					`[DAG] Node ${node.id} failed, retrying (${node.retryCount}/${node.maxRetries}): ${errorMsg}`,
				);
			} else {
				node.status = "failed";
				node.error = errorMsg;
				node.finishedAt = Date.now();
				this.config.onNodeError?.(node, errorMsg);
			}
		} finally {
			this.runningNodes.delete(node.id);
		}
	}

	private async executeToolCallNode(
		node: DAGNode,
		context: ToolContext,
	): Promise<ToolResult> {
		if (!node.toolType || !node.input) {
			throw new Error("Tool call node missing toolType or input");
		}

		this.usage.toolCallsUsed++;

		// 收集依赖节点的输出作为上下文
		const depOutputs: Record<string, unknown> = {};
		for (const depId of node.dependsOn) {
			const dep = this.nodes.get(depId);
			if (dep?.output) {
				depOutputs[depId] = dep.output;
			}
		}

		// 合并输入
		const input = { ...node.input, _dependencyOutputs: depOutputs };

		// 权限检查
		const tool = toolRegistry.get(node.toolType);
		const toolName = tool?.name || node.toolType;

		const permResult = await permissionStore.requestPermission(
			node.id,
			toolName,
			node.toolType,
			input,
		);

		if (permResult.decision === "denied") {
			throw new Error(
				`Permission denied: ${permResult.reason || permResult.decidedBy}`,
			);
		}

		// 创建 ToolCall 并添加到 store
		const toolCall = createToolCall(
			node.toolType,
			toolName,
			input as Record<string, unknown>,
		);
		toolCall.status = "running";
		toolCall.startedAt = Date.now();
		node.toolCallId = toolCall.id;
		agentStore.addToolCall(toolCall);

		// 执行工具
		const result = await toolRegistry.execute(
			node.toolType,
			input as Record<string, unknown>,
			{
				...context,
				onProgress: (progress, message) => {
					agentStore.updateToolCall(toolCall.id, {
						metadata: { progress, message },
					});
				},
			},
		);

		// 更新 ToolCall 状态
		toolCall.completedAt = Date.now();
		toolCall.duration = toolCall.completedAt - toolCall.startedAt;
		toolCall.status = result.success ? "completed" : "error";
		toolCall.output = result.data;
		toolCall.error = result.error;

		agentStore.updateToolCall(toolCall.id, {
			status: toolCall.status,
			output: toolCall.output,
			error: toolCall.error,
			completedAt: toolCall.completedAt,
			duration: toolCall.duration,
		});

		// 添加 artifacts
		if (result.artifacts) {
			agentStore.addArtifacts(result.artifacts);
		}

		if (!result.success) {
			throw new Error(result.error || "Tool execution failed");
		}

		return result;
	}

	private async executeLLMPlanNode(
		node: DAGNode,
		_context: ToolContext,
	): Promise<unknown> {
		// LLM 规划节点 - 由外部实现
		// 这里只是占位，实际实现需要调用 LLM
		console.log(`[DAG] Executing LLM plan node: ${node.name}`);
		return node.input;
	}

	private async executeSynthesisNode(
		node: DAGNode,
		_context: ToolContext,
	): Promise<unknown> {
		// 综合节点 - 合并依赖节点的输出
		const outputs: Record<string, unknown> = {};
		for (const depId of node.dependsOn) {
			const dep = this.nodes.get(depId);
			if (dep?.output) {
				outputs[depId] = dep.output;
			}
		}
		console.log(
			`[DAG] Executing synthesis node: ${node.name}, merging ${Object.keys(outputs).length} outputs`,
		);
		return { merged: outputs, ...node.input };
	}

	private async executeCustomNode(
		node: DAGNode,
		_context: ToolContext,
	): Promise<unknown> {
		// 自定义节点 - 由外部实现
		console.log(`[DAG] Executing custom node: ${node.name}`);
		return node.input;
	}

	// ==================== 主执行循环 ====================

	async execute(): Promise<{
		success: boolean;
		results: Map<string, unknown>;
		error?: string;
	}> {
		this.startTime = Date.now();
		this.abortController = new AbortController();

		const context: ToolContext = {
			taskId: this.taskId,
			abortSignal: this.abortController.signal,
		};

		const results = new Map<string, unknown>();

		try {
			while (true) {
				// 检查是否被取消
				if (this.abortController.signal.aborted) {
					this.cancelAllPending();
					return { success: false, results, error: "Execution canceled" };
				}

				// 检查预算
				const budgetCheck = this.checkBudget();
				if (!budgetCheck.ok) {
					this.cancelAllPending();
					return { success: false, results, error: budgetCheck.reason };
				}

				// 更新阻塞状态
				this.updateBlockedNodes();

				// 获取可执行的节点
				const readyNodes = this.getReadyNodes();

				// 检查是否完成
				const allNodes = this.getAllNodes();
				const completedCount = allNodes.filter(
					(n) =>
						n.status === "succeeded" ||
						n.status === "failed" ||
						n.status === "canceled",
				).length;

				this.config.onProgress?.(completedCount, allNodes.length);

				if (readyNodes.length === 0 && this.runningNodes.size === 0) {
					// 没有可执行的节点且没有正在运行的节点
					const hasFailures = allNodes.some((n) => n.status === "failed");
					const hasPending = allNodes.some(
						(n) => n.status === "queued" || n.status === "blocked",
					);

					if (hasPending) {
						// 有节点被阻塞但无法继续（循环依赖或依赖失败）
						return {
							success: false,
							results,
							error: "Deadlock or dependency failure detected",
						};
					}

					// 收集结果
					for (const node of allNodes) {
						if (node.output !== undefined) {
							results.set(node.id, node.output);
						}
					}

					return { success: !hasFailures, results };
				}

				// 并发执行就绪节点（受限于 maxConcurrency）
				const maxConcurrent = this.budget.maxConcurrency || 3;
				const availableSlots = maxConcurrent - this.runningNodes.size;
				const nodesToExecute = readyNodes.slice(0, availableSlots);

				if (nodesToExecute.length > 0) {
					// 并发启动节点
					const promises = nodesToExecute.map((node) =>
						this.executeNode(node, context),
					);

					// 等待至少一个完成
					await Promise.race(promises);
				} else if (this.runningNodes.size > 0) {
					// 等待正在运行的节点
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.cancelAllPending();
			return { success: false, results, error: errorMsg };
		}
	}

	// ==================== 取消控制 ====================

	cancel(): void {
		this.abortController?.abort();
		this.cancelAllPending();
	}

	private cancelAllPending(): void {
		for (const node of this.nodes.values()) {
			if (node.status === "queued" || node.status === "blocked") {
				node.status = "canceled";
				node.error = "Execution canceled";
				node.finishedAt = Date.now();
			}
		}
	}

	// ==================== 状态查询 ====================

	getStatus(): {
		total: number;
		queued: number;
		blocked: number;
		running: number;
		succeeded: number;
		failed: number;
		canceled: number;
		usage: BudgetUsage;
	} {
		const nodes = this.getAllNodes();
		return {
			total: nodes.length,
			queued: nodes.filter((n) => n.status === "queued").length,
			blocked: nodes.filter((n) => n.status === "blocked").length,
			running: nodes.filter((n) => n.status === "running").length,
			succeeded: nodes.filter((n) => n.status === "succeeded").length,
			failed: nodes.filter((n) => n.status === "failed").length,
			canceled: nodes.filter((n) => n.status === "canceled").length,
			usage: { ...this.usage, timeElapsedMs: Date.now() - this.startTime },
		};
	}

	isComplete(): boolean {
		return this.getAllNodes().every(
			(n) =>
				n.status === "succeeded" ||
				n.status === "failed" ||
				n.status === "canceled",
		);
	}

	hasFailures(): boolean {
		return this.getAllNodes().some((n) => n.status === "failed");
	}
}

// ==================== 辅助函数 ====================

// 创建简单的线性 DAG（节点按顺序依赖）
export function createLinearDAG(
	taskId: string,
	steps: Array<{
		id: string;
		kind: DAGNodeKind;
		name: string;
		toolType?: ToolType;
		input?: Record<string, unknown>;
	}>,
	config?: DAGExecutorConfig,
): DAGExecutor {
	const executor = new DAGExecutor(taskId, config);

	let prevId: string | undefined;
	for (const step of steps) {
		executor.addNode({
			id: step.id,
			kind: step.kind,
			name: step.name,
			toolType: step.toolType,
			input: step.input,
			dependsOn: prevId ? [prevId] : [],
			maxRetries: 3,
		});
		prevId = step.id;
	}

	return executor;
}

// 创建并行 DAG（所有节点并行执行，最后汇总）
export function createParallelDAG(
	taskId: string,
	parallelSteps: Array<{
		id: string;
		kind: DAGNodeKind;
		name: string;
		toolType?: ToolType;
		input?: Record<string, unknown>;
	}>,
	synthesisStep?: {
		id: string;
		name: string;
		input?: Record<string, unknown>;
	},
	config?: DAGExecutorConfig,
): DAGExecutor {
	const executor = new DAGExecutor(taskId, config);

	// 添加并行节点
	const parallelIds: string[] = [];
	for (const step of parallelSteps) {
		executor.addNode({
			id: step.id,
			kind: step.kind,
			name: step.name,
			toolType: step.toolType,
			input: step.input,
			dependsOn: [],
			maxRetries: 3,
		});
		parallelIds.push(step.id);
	}

	// 添加汇总节点
	if (synthesisStep) {
		executor.addSynthesisNode(
			synthesisStep.id,
			synthesisStep.name,
			synthesisStep.input || {},
			parallelIds,
		);
	}

	return executor;
}
