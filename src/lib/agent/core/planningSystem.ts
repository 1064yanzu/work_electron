// 动态规划系统
// 实现目标分解、子任务管理、计划动态调整

import { invokeLlmWithCallback } from "../../chat/api";
import { getPrompt } from "../../prompts";
import { settingsStore } from "../../settingsStore";
import { toolRegistry } from "../registry";
import type { ToolType } from "../types";

// ==================== 类型定义 ====================

// 计划节点类型
export type PlanNodeType =
	| "goal" // 目标节点
	| "subgoal" // 子目标节点
	| "task" // 具体任务节点
	| "action" // 原子行动节点
	| "checkpoint"; // 检查点节点

// 节点状态
export type PlanNodeStatus =
	| "pending" // 待执行
	| "ready" // 依赖已满足，可执行
	| "in_progress" // 执行中
	| "completed" // 已完成
	| "failed" // 失败
	| "blocked" // 被阻塞
	| "skipped" // 跳过
	| "replanned"; // 已重新规划

// 计划节点
export interface PlanNode {
	id: string;
	type: PlanNodeType;
	title: string;
	description?: string;
	status: PlanNodeStatus;

	// 依赖关系
	dependencies: string[]; // 依赖的节点ID
	dependents: string[]; // 依赖此节点的节点ID

	// 执行信息
	priority: number; // 优先级 1-10
	estimatedDuration?: number; // 预估耗时（毫秒）
	actualDuration?: number; // 实际耗时
	startedAt?: number;
	completedAt?: number;

	// 行动详情（仅action节点）
	action?: {
		tool: ToolType;
		input: Record<string, unknown>;
		reason: string;
	};

	// 执行结果
	result?: {
		success: boolean;
		data?: unknown;
		error?: string;
		quality?: "excellent" | "good" | "acceptable" | "poor" | "failed";
	};

	// 重规划信息
	replanInfo?: {
		originalId: string;
		reason: string;
		replannedAt: number;
	};
}

// 执行计划
export interface ExecutionPlan {
	id: string;
	goal: string;
	nodes: Map<string, PlanNode>;
	rootNodeId: string;
	currentNodeId?: string;

	// 状态
	status: "planning" | "executing" | "paused" | "completed" | "failed";
	createdAt: number;
	updatedAt: number;

	// 统计
	stats: {
		totalNodes: number;
		completedNodes: number;
		failedNodes: number;
		skippedNodes: number;
	};

	// 版本控制
	version: number;
	history: PlanVersion[];
}

// 计划版本
export interface PlanVersion {
	version: number;
	timestamp: number;
	reason: string;
	snapshot: string; // JSON序列化的节点状态
}

// 规划配置
export interface PlanningConfig {
	maxDepth: number; // 最大分解深度
	maxNodesPerLevel: number; // 每层最大节点数
	enableDynamicReplan: boolean; // 是否启用动态重规划
	replanThreshold: number; // 失败率触发重规划的阈值
	parallelExecution: boolean; // 是否允许并行执行
	maxParallelNodes: number; // 最大并行节点数
	onNodeUpdate?: (node: PlanNode) => void;
	onPlanUpdate?: (plan: ExecutionPlan) => void;
}

const DEFAULT_CONFIG: PlanningConfig = {
	maxDepth: 4,
	maxNodesPerLevel: 5,
	enableDynamicReplan: true,
	replanThreshold: 0.3,
	parallelExecution: true,
	maxParallelNodes: 3,
};

// ==================== 规划系统类 ====================

export class PlanningSystem {
	private config: PlanningConfig;
	private currentPlan: ExecutionPlan | null = null;

	constructor(config: Partial<PlanningConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// 创建执行计划
	async createPlan(goal: string): Promise<ExecutionPlan> {
		const planId = this.generateId();

		// 初始化计划
		this.currentPlan = {
			id: planId,
			goal,
			nodes: new Map(),
			rootNodeId: "",
			status: "planning",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			stats: {
				totalNodes: 0,
				completedNodes: 0,
				failedNodes: 0,
				skippedNodes: 0,
			},
			version: 1,
			history: [],
		};

		// 创建根节点
		const rootNode = this.createNode("goal", goal, goal);
		this.currentPlan.rootNodeId = rootNode.id;
		this.currentPlan.nodes.set(rootNode.id, rootNode);

		// 分解目标
		await this.decomposeNode(rootNode.id, 0);

		// 更新状态
		this.updateStats();
		this.currentPlan.status = "executing";
		this.config.onPlanUpdate?.(this.currentPlan);

		return this.currentPlan;
	}

	// 分解节点
	private async decomposeNode(nodeId: string, depth: number): Promise<void> {
		if (depth >= this.config.maxDepth) return;

		const node = this.currentPlan!.nodes.get(nodeId);
		if (!node) return;

		const activeModel = settingsStore.getActiveModel();
		if (!activeModel) return;

		const decompositionPrompt = `分析并分解以下任务为可执行的子任务。

## 任务
${node.title}
${node.description ? `描述: ${node.description}` : ""}

## 当前深度
${depth + 1} / ${this.config.maxDepth}

## 可用工具
${this.getToolsSummary()}

## 分解规则
1. 如果任务已经是原子操作（可以直接用单个工具完成），标记为 action
2. 如果需要分解，生成 2-${this.config.maxNodesPerLevel} 个子任务
3. 明确子任务之间的依赖关系
4. 评估每个子任务的优先级

## 输出格式（JSON）
{
  "needsDecomposition": true/false,
  "subTasks": [
    {
      "type": "subgoal|task|action",
      "title": "子任务标题",
      "description": "详细描述",
      "priority": 1-10,
      "dependencies": ["前置任务索引，如 0, 1"],
      "action": {  // 仅当 type=action 时
        "tool": "工具类型",
        "input": { 参数 },
        "reason": "使用原因"
      }
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
			if (!jsonMatch) return;

			const result = JSON.parse(jsonMatch[0]);
			if (!result.needsDecomposition || !Array.isArray(result.subTasks)) return;

			// 创建子节点
			const createdNodes: PlanNode[] = [];
			for (const subTask of result.subTasks.slice(
				0,
				this.config.maxNodesPerLevel,
			)) {
				const childNode = this.createNode(
					subTask.type || "task",
					subTask.title,
					subTask.description,
					subTask.priority,
					subTask.action,
				);

				childNode.dependencies = [nodeId];
				this.currentPlan!.nodes.set(childNode.id, childNode);
				createdNodes.push(childNode);
			}

			// 设置子节点之间的依赖关系
			for (
				let i = 0;
				i < result.subTasks.length && i < createdNodes.length;
				i++
			) {
				const subTask = result.subTasks[i];
				if (Array.isArray(subTask.dependencies)) {
					for (const depIndex of subTask.dependencies) {
						if (
							typeof depIndex === "number" &&
							depIndex < createdNodes.length &&
							depIndex !== i
						) {
							createdNodes[i].dependencies.push(createdNodes[depIndex].id);
						}
					}
				}
			}

			// 更新父节点的 dependents
			node.dependents = createdNodes.map((n) => n.id);

			// 递归分解非 action 节点
			for (const childNode of createdNodes) {
				if (childNode.type !== "action") {
					await this.decomposeNode(childNode.id, depth + 1);
				}
			}
		} catch (error) {
			console.error("[PlanningSystem] 分解失败:", error);
			// 将节点降级为 action 节点
			node.type = "action";
		}
	}

	// 获取下一个可执行的节点
	getNextExecutableNodes(): PlanNode[] {
		if (!this.currentPlan) return [];

		const executable: PlanNode[] = [];

		for (const node of this.currentPlan.nodes.values()) {
			if (node.status !== "pending") continue;
			if (node.type === "goal") continue;

			// 检查依赖是否都已完成
			const allDepsCompleted = node.dependencies.every((depId) => {
				const depNode = this.currentPlan!.nodes.get(depId);
				return (
					depNode &&
					(depNode.status === "completed" ||
						depNode.status === "skipped" ||
						depNode.type === "goal")
				);
			});

			if (allDepsCompleted) {
				node.status = "ready";
				executable.push(node);
			}
		}

		// 按优先级排序
		executable.sort((a, b) => b.priority - a.priority);

		// 限制并行数
		if (this.config.parallelExecution) {
			return executable.slice(0, this.config.maxParallelNodes);
		}
		return executable.slice(0, 1);
	}

	// 更新节点状态
	updateNodeStatus(
		nodeId: string,
		status: PlanNodeStatus,
		result?: PlanNode["result"],
	): void {
		const node = this.currentPlan?.nodes.get(nodeId);
		if (!node) return;

		node.status = status;
		if (result) {
			node.result = result;
		}

		if (status === "in_progress") {
			node.startedAt = Date.now();
		} else if (status === "completed" || status === "failed") {
			node.completedAt = Date.now();
			if (node.startedAt) {
				node.actualDuration = node.completedAt - node.startedAt;
			}
		}

		this.currentPlan!.updatedAt = Date.now();
		this.updateStats();
		this.config.onNodeUpdate?.(node);
		this.config.onPlanUpdate?.(this.currentPlan!);

		// 检查是否需要重规划
		if (this.config.enableDynamicReplan && status === "failed") {
			this.checkAndReplan(nodeId);
		}
	}

	// 检查并触发重规划
	private async checkAndReplan(failedNodeId: string): Promise<void> {
		const failedNode = this.currentPlan?.nodes.get(failedNodeId);
		if (!failedNode) return;

		// 计算失败率
		const stats = this.currentPlan!.stats;
		const totalAttempted = stats.completedNodes + stats.failedNodes;
		const failureRate =
			totalAttempted > 0 ? stats.failedNodes / totalAttempted : 0;

		if (failureRate >= this.config.replanThreshold) {
			await this.replanFromNode(failedNodeId);
		}
	}

	// 从指定节点重新规划
	async replanFromNode(nodeId: string): Promise<void> {
		const node = this.currentPlan?.nodes.get(nodeId);
		if (!node) return;

		// 保存当前版本
		this.saveVersion(`重规划节点 ${node.title}`);

		const activeModel = settingsStore.getActiveModel();
		if (!activeModel) return;

		const replanPrompt = `任务执行失败，需要重新规划。

## 原始目标
${this.currentPlan!.goal}

## 失败的任务
标题: ${node.title}
描述: ${node.description || "无"}
错误: ${node.result?.error || "未知错误"}

## 已完成的任务
${
	Array.from(this.currentPlan!.nodes.values())
		.filter((n) => n.status === "completed")
		.map((n) => `- ${n.title}`)
		.join("\n") || "无"
}

## 请重新规划
1. 分析失败原因
2. 提出替代方案
3. 生成新的执行计划

## 输出格式（JSON）
{
  "analysis": "失败原因分析",
  "alternativeApproach": "替代方案",
  "newTasks": [
    {
      "type": "task|action",
      "title": "新任务标题",
      "description": "描述",
      "priority": 1-10,
      "action": { ... }
    }
  ]
}`;

		try {
			let response = "";
			const taskReplanPrompt = await getPrompt("taskReplan");
			await new Promise<void>((resolve, reject) => {
				invokeLlmWithCallback({
					model: activeModel,
					prompt: replanPrompt,
					systemPrompt: taskReplanPrompt,
					context: [],
					onChunk: (chunk) => {
						response += chunk;
					},
					onComplete: () => resolve(),
					onError: (err) => reject(new Error(err)),
				});
			});

			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (!jsonMatch) return;

			const result = JSON.parse(jsonMatch[0]);
			if (!Array.isArray(result.newTasks)) return;

			// 标记原节点为已重规划
			node.status = "replanned";
			node.replanInfo = {
				originalId: node.id,
				reason: result.analysis || "执行失败",
				replannedAt: Date.now(),
			};

			// 创建新节点
			for (const newTask of result.newTasks) {
				const newNode = this.createNode(
					newTask.type || "task",
					newTask.title,
					newTask.description,
					newTask.priority,
					newTask.action,
				);
				newNode.dependencies = node.dependencies;
				newNode.replanInfo = {
					originalId: node.id,
					reason: result.analysis,
					replannedAt: Date.now(),
				};
				this.currentPlan!.nodes.set(newNode.id, newNode);
			}

			this.updateStats();
			this.currentPlan!.version++;
			this.config.onPlanUpdate?.(this.currentPlan!);
		} catch (error) {
			console.error("[PlanningSystem] 重规划失败:", error);
		}
	}

	// 保存版本
	private saveVersion(reason: string): void {
		if (!this.currentPlan) return;

		const snapshot: Record<string, any> = {};
		for (const [id, node] of this.currentPlan.nodes) {
			snapshot[id] = { ...node };
		}

		this.currentPlan.history.push({
			version: this.currentPlan.version,
			timestamp: Date.now(),
			reason,
			snapshot: JSON.stringify(snapshot),
		});
	}

	// 回滚到指定版本
	rollbackToVersion(version: number): boolean {
		if (!this.currentPlan) return false;

		const versionEntry = this.currentPlan.history.find(
			(v) => v.version === version,
		);
		if (!versionEntry) return false;

		try {
			const snapshot = JSON.parse(versionEntry.snapshot);
			this.currentPlan.nodes.clear();

			for (const [id, nodeData] of Object.entries(snapshot)) {
				this.currentPlan.nodes.set(id, nodeData as PlanNode);
			}

			this.currentPlan.version = version;
			this.updateStats();
			this.config.onPlanUpdate?.(this.currentPlan);
			return true;
		} catch {
			return false;
		}
	}

	// 创建节点
	private createNode(
		type: PlanNodeType,
		title: string,
		description?: string,
		priority: number = 5,
		action?: PlanNode["action"],
	): PlanNode {
		return {
			id: this.generateId(),
			type,
			title,
			description,
			status: "pending",
			dependencies: [],
			dependents: [],
			priority,
			action,
		};
	}

	// 更新统计
	private updateStats(): void {
		if (!this.currentPlan) return;

		let total = 0,
			completed = 0,
			failed = 0,
			skipped = 0;

		for (const node of this.currentPlan.nodes.values()) {
			if (node.type === "goal") continue;
			total++;
			if (node.status === "completed") completed++;
			if (node.status === "failed") failed++;
			if (node.status === "skipped") skipped++;
		}

		this.currentPlan.stats = {
			totalNodes: total,
			completedNodes: completed,
			failedNodes: failed,
			skippedNodes: skipped,
		};
	}

	// 检查计划是否完成
	isPlanCompleted(): boolean {
		if (!this.currentPlan) return false;

		for (const node of this.currentPlan.nodes.values()) {
			if (node.type === "goal") continue;
			if (node.type === "action" || node.type === "task") {
				if (
					node.status !== "completed" &&
					node.status !== "skipped" &&
					node.status !== "replanned"
				) {
					return false;
				}
			}
		}
		return true;
	}

	// 获取计划进度
	getProgress(): { completed: number; total: number; percentage: number } {
		if (!this.currentPlan) {
			return { completed: 0, total: 0, percentage: 0 };
		}

		const stats = this.currentPlan.stats;
		const completed = stats.completedNodes + stats.skippedNodes;
		const percentage =
			stats.totalNodes > 0
				? Math.round((completed / stats.totalNodes) * 100)
				: 0;

		return {
			completed,
			total: stats.totalNodes,
			percentage,
		};
	}

	// 获取当前计划
	getCurrentPlan(): ExecutionPlan | null {
		return this.currentPlan;
	}

	// 获取工具摘要
	private getToolsSummary(): string {
		return toolRegistry
			.getAll()
			.map((t) => `- ${t.type}: ${t.description}`)
			.join("\n");
	}

	// 生成ID
	private generateId(): string {
		return `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
	}

	// 可视化计划（用于调试）
	visualizePlan(): string {
		if (!this.currentPlan) return "无计划";

		const lines: string[] = ["执行计划:"];
		const visited = new Set<string>();

		const visualizeNode = (nodeId: string, indent: number) => {
			if (visited.has(nodeId)) return;
			visited.add(nodeId);

			const node = this.currentPlan!.nodes.get(nodeId);
			if (!node) return;

			const prefix = "  ".repeat(indent);
			const statusIcon =
				{
					pending: "○",
					ready: "◎",
					in_progress: "●",
					completed: "✓",
					failed: "✗",
					blocked: "⊗",
					skipped: "⊘",
					replanned: "↻",
				}[node.status] || "?";

			lines.push(`${prefix}${statusIcon} [${node.type}] ${node.title}`);

			for (const childId of node.dependents) {
				visualizeNode(childId, indent + 1);
			}
		};

		visualizeNode(this.currentPlan.rootNodeId, 0);
		return lines.join("\n");
	}
}

// 单例导出
export const planningSystem = new PlanningSystem();
