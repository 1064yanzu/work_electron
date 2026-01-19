// Agent 状态管理
// 管理 Agent 任务、工具调用历史等

import { useSyncExternalStore } from "react";
import type { SkillExecution } from "./SkillExecutor";
import {
	type AgentEvent,
	type AgentTask,
	type AgentTaskStatus,
	type AgentTaskStep,
	type AgentTaskStepStatus,
	type AgentThinkingStep,
	createAgentTask,
	createDefaultProgress,
	type ErrorRecoveryStrategy,
	type TaskProgress,
	type ThinkingPhase,
	type ToolArtifact,
	type ToolCall,
} from "./types";

// Agent 状态
interface AgentState {
	// 当前活动任务
	currentTask: AgentTask | null;
	// 历史任务
	taskHistory: AgentTask[];
	// 是否正在执行
	isExecuting: boolean;
	// 当前浏览器 URL（用于集成浏览器）
	browserUrl: string | null;
	// 实时思考内容（流式输出用）
	partialThinking: string;
	// 当前思考阶段
	thinkingPhase: ThinkingPhase;
	// 思考步骤历史
	thinkingSteps: AgentThinkingStep[];
	// 任务进度
	taskProgress: TaskProgress | null;
	// 当前错误恢复策略（如果有错误需要用户决定）
	pendingErrorRecovery: {
		toolCallId: string;
		strategy: ErrorRecoveryStrategy;
	} | null;
	// 是否正在等待 LLM 响应（首个 token 返回前）
	isWaitingForLLM: boolean;
	// Skill 执行状态
	currentSkill: SkillExecution | null;
}

const initialState: AgentState = {
	currentTask: null,
	taskHistory: [],
	isExecuting: false,
	browserUrl: null,
	partialThinking: "",
	thinkingPhase: "analyzing",
	thinkingSteps: [],
	taskProgress: null,
	pendingErrorRecovery: null,
	isWaitingForLLM: false,
	currentSkill: null,
};

class AgentStore {
	private state: AgentState = initialState;
	private listeners: Set<() => void> = new Set();
	private eventListeners: Set<(event: AgentEvent) => void> = new Set();

	getState = () => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	// 订阅 Agent 事件
	onEvent = (listener: (event: AgentEvent) => void) => {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	};

	private emit() {
		this.listeners.forEach((l) => l());
	}

	private emitEvent(event: AgentEvent) {
		this.eventListeners.forEach((l) => l(event));
	}

	private setState(updater: (state: AgentState) => AgentState) {
		this.state = updater(this.state);
		this.emit();
	}

	hydrateTasks(tasks: AgentTask[]) {
		const sorted = [...tasks]
			.map((t) => ({ ...t, steps: Array.isArray(t.steps) ? t.steps : [] }))
			.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
		const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;

		this.setState((state) => ({
			...state,
			currentTask: last,
			taskHistory: sorted,
			isExecuting: false,
		}));
	}

	// ============ 任务管理 ============

	// 开始新任务
	startTask(type: AgentTask["type"], query: string, title?: string): AgentTask {
		const task = createAgentTask(type, query, title);
		task.status = "planning";

		this.setState((state) => ({
			...state,
			currentTask: task,
			isExecuting: true,
		}));

		this.emitEvent({ type: "task_started", task });
		return task;
	}

	// 更新任务状态
	updateTaskStatus(status: AgentTaskStatus, error?: string) {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const updatedTask: AgentTask = {
				...state.currentTask,
				status,
				error,
				updatedAt: Date.now(),
				completedAt:
					status === "completed" || status === "error" ? Date.now() : undefined,
			};

			this.emitEvent({
				type: "task_updated",
				taskId: updatedTask.id,
				updates: { status, error },
			});

			return {
				...state,
				currentTask: updatedTask,
				isExecuting: status === "planning" || status === "executing",
			};
		});
	}

	// 完成任务
	completeTask(result: string) {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const updatedSteps = (state.currentTask.steps || []).map((step) =>
				step.status === "pending" || step.status === "running"
					? { ...step, status: "completed" as AgentTaskStepStatus }
					: step,
			);

			const completedTask: AgentTask = {
				...state.currentTask,
				status: "completed",
				result,
				steps: updatedSteps,
				updatedAt: Date.now(),
				completedAt: Date.now(),
			};

			this.emitEvent({
				type: "task_completed",
				taskId: completedTask.id,
				result,
			});

			return {
				...state,
				currentTask: completedTask,
				taskHistory: [completedTask, ...state.taskHistory].slice(0, 20), // 保留最近 20 个
				isExecuting: false,
			};
		});
	}

	// 任务出错
	failTask(error: string) {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const updatedSteps = (state.currentTask.steps || []).map((step) =>
				step.status === "completed" || step.status === "error"
					? step
					: { ...step, status: "error" as AgentTaskStepStatus },
			);

			const failedTask: AgentTask = {
				...state.currentTask,
				status: "error",
				error,
				steps: updatedSteps,
				updatedAt: Date.now(),
				completedAt: Date.now(),
			};

			this.emitEvent({
				type: "task_error",
				taskId: failedTask.id,
				error,
			});

			return {
				...state,
				currentTask: failedTask,
				taskHistory: [failedTask, ...state.taskHistory].slice(0, 20),
				isExecuting: false,
			};
		});
	}

	// 取消任务
	cancelTask() {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const updatedSteps = (state.currentTask.steps || []).map((step) =>
				step.status === "completed" || step.status === "cancelled"
					? step
					: { ...step, status: "cancelled" as AgentTaskStepStatus },
			);

			const cancelledTask: AgentTask = {
				...state.currentTask,
				status: "cancelled",
				steps: updatedSteps,
				updatedAt: Date.now(),
				completedAt: Date.now(),
			};

			return {
				...state,
				currentTask: cancelledTask,
				taskHistory: [cancelledTask, ...state.taskHistory].slice(0, 20),
				isExecuting: false,
			};
		});
	}

	// 暂停任务
	pauseTask() {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const pausedTask: AgentTask = {
				...state.currentTask,
				status: "waiting",
				updatedAt: Date.now(),
			};

			return {
				...state,
				currentTask: pausedTask,
				isExecuting: false,
			};
		});
	}

	// 恢复任务
	resumeTask() {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const resumedTask: AgentTask = {
				...state.currentTask,
				status: "executing",
				updatedAt: Date.now(),
			};

			return {
				...state,
				currentTask: resumedTask,
				isExecuting: true,
			};
		});
	}

	// 设置思考内容（完整替换）
	setThinking(thinking: string) {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const prevThinking = (state.currentTask.metadata as any)?.thinking as
				| string
				| undefined;
			if (typeof thinking === "string" && thinking === prevThinking)
				return state;

			return {
				...state,
				partialThinking: "", // 清空部分思考
				currentTask: {
					...state.currentTask,
					metadata: {
						...state.currentTask.metadata,
						thinking,
					},
				},
			};
		});

		const taskId = this.state.currentTask?.id;
		if (taskId && typeof thinking === "string" && thinking.trim().length > 0) {
			this.emitEvent({
				type: "thought",
				taskId,
				thought: {
					id: `thought-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					type: "thinking",
					content: thinking,
					timestamp: Date.now(),
				},
			});
		}
	}

	// 追加部分思考内容（流式输出用）
	appendThinking(chunk: string) {
		this.setState((state) => {
			if (!state.currentTask) return state;
			return {
				...state,
				partialThinking: state.partialThinking + chunk,
			};
		});
	}

	// 清空部分思考内容
	clearPartialThinking() {
		this.setState((state) => ({
			...state,
			partialThinking: "",
		}));
	}

	// 设置任务步骤列表
	setTaskSteps(steps: AgentTaskStep[]) {
		let taskId: string | null = null;
		let normalizedSteps: AgentTaskStep[] | null = null;
		this.setState((state) => {
			if (!state.currentTask) return state;

			taskId = state.currentTask.id;

			const normalized: AgentTaskStep[] = steps.map((step, idx) => ({
				...step,
				id: step.id || `step-${state.currentTask!.id}-${idx}`,
				status: (step.status || "pending") as AgentTaskStepStatus,
			}));

			normalizedSteps = normalized;

			return {
				...state,
				currentTask: {
					...state.currentTask,
					steps: normalized,
					updatedAt: Date.now(),
				},
			};
		});

		if (taskId && normalizedSteps) {
			this.emitEvent({
				type: "task_updated",
				taskId,
				updates: { steps: normalizedSteps },
			});
		}
	}

	// 更新特定步骤
	updateTaskStep(stepId: string, updates: Partial<AgentTaskStep>) {
		this.setState((state) => {
			if (!state.currentTask) return state;
			const steps = state.currentTask.steps || [];
			const updatedSteps = steps.map((step) =>
				step.id === stepId ? { ...step, ...updates } : step,
			);

			return {
				...state,
				currentTask: {
					...state.currentTask,
					steps: updatedSteps,
					updatedAt: Date.now(),
				},
			};
		});
	}

	// 根据 kind 更新步骤状态
	updateTaskStepByKind(
		kind: AgentTaskStep["kind"],
		status: AgentTaskStepStatus,
	) {
		this.setState((state) => {
			if (!state.currentTask) return state;
			const steps = state.currentTask.steps || [];
			let changed = false;
			const updatedSteps = steps.map((step) => {
				if (step.kind === kind) {
					changed = true;
					return { ...step, status };
				}
				return step;
			});
			if (!changed) return state;

			return {
				...state,
				currentTask: {
					...state.currentTask,
					steps: updatedSteps,
					updatedAt: Date.now(),
				},
			};
		});
	}

	// 将下一个 pending 步骤设为 running（若当前无 running）
	startNextPendingStep() {
		this.setState((state) => {
			if (!state.currentTask) return state;
			const steps = state.currentTask.steps || [];
			if (steps.some((s) => s.status === "running")) return state;
			const idx = steps.findIndex((s) => s.status === "pending");
			if (idx === -1) return state;
			const updatedSteps = steps.map((step, i) =>
				i === idx
					? { ...step, status: "running" as AgentTaskStepStatus }
					: step,
			);

			return {
				...state,
				currentTask: {
					...state.currentTask,
					steps: updatedSteps,
					updatedAt: Date.now(),
				},
			};
		});
	}

	// 清除当前任务
	clearCurrentTask() {
		this.setState((state) => ({
			...state,
			currentTask: null,
			isExecuting: false,
		}));
	}

	// ============ 工具调用管理 ============

	// 添加工具调用
	addToolCall(toolCall: ToolCall) {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const updatedTask: AgentTask = {
				...state.currentTask,
				toolCalls: [...state.currentTask.toolCalls, toolCall],
				updatedAt: Date.now(),
			};

			this.emitEvent({
				type: "tool_started",
				taskId: updatedTask.id,
				toolCall,
			});

			return {
				...state,
				currentTask: updatedTask,
			};
		});
	}

	// 更新工具调用
	updateToolCall(toolCallId: string, updates: Partial<ToolCall>) {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const updatedTask: AgentTask = {
				...state.currentTask,
				toolCalls: state.currentTask.toolCalls.map((tc) =>
					tc.id === toolCallId ? { ...tc, ...updates } : tc,
				),
				updatedAt: Date.now(),
			};

			if (updates.status === "completed") {
				this.emitEvent({
					type: "tool_completed",
					taskId: updatedTask.id,
					toolCallId,
					result: { success: true, data: updates.output },
				});
			} else if (updates.status === "error") {
				this.emitEvent({
					type: "tool_error",
					taskId: updatedTask.id,
					toolCallId,
					error: updates.error || "未知错误",
				});
			}

			return {
				...state,
				currentTask: updatedTask,
			};
		});
	}

	// ============ Artifact 管理 ============

	// 添加 Artifact
	addArtifact(artifact: ToolArtifact) {
		this.setState((state) => {
			if (!state.currentTask) return state;

			const updatedTask: AgentTask = {
				...state.currentTask,
				artifacts: [...state.currentTask.artifacts, artifact],
				updatedAt: Date.now(),
			};

			this.emitEvent({
				type: "artifact_added",
				taskId: updatedTask.id,
				artifact,
			});

			return {
				...state,
				currentTask: updatedTask,
			};
		});
	}

	// 批量添加 Artifacts
	addArtifacts(artifacts: ToolArtifact[]) {
		artifacts.forEach((artifact) => this.addArtifact(artifact));
	}

	// ============ 浏览器集成 ============

	// 设置浏览器 URL
	setBrowserUrl(url: string | null) {
		this.setState((state) => ({
			...state,
			browserUrl: url,
		}));
	}

	// ============ 历史管理 ============

	// 获取历史任务
	getTaskHistory(): AgentTask[] {
		return this.state.taskHistory;
	}

	// 清除历史
	clearHistory() {
		this.setState((state) => ({
			...state,
			taskHistory: [],
		}));
	}

	// 从历史恢复任务（只读查看）
	viewHistoryTask(taskId: string) {
		const task = this.state.taskHistory.find((t) => t.id === taskId);
		if (task) {
			this.setState((state) => ({
				...state,
				currentTask: task,
				isExecuting: false,
			}));
		}
	}

	// ============ 思考阶段管理 ============

	// 设置思考阶段
	setThinkingPhase(phase: ThinkingPhase, content?: string) {
		const taskId = this.state.currentTask?.id;

		this.setState((state) => {
			if (!state.currentTask) return state;

			// 创建新的思考步骤
			const newStep: AgentThinkingStep = {
				id: `think-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				phase,
				content: content || "",
				timestamp: Date.now(),
			};

			// 更新上一个步骤的持续时间
			const updatedSteps = [...state.thinkingSteps];
			if (updatedSteps.length > 0) {
				const lastStep = updatedSteps[updatedSteps.length - 1];
				lastStep.duration = Date.now() - lastStep.timestamp;
			}
			updatedSteps.push(newStep);

			// 更新进度状态
			const newProgress = state.taskProgress
				? { ...state.taskProgress }
				: createDefaultProgress();

			// 设置当前阶段和阶段状态
			newProgress.currentPhase = phase;
			newProgress.phaseStatus = {
				...newProgress.phaseStatus,
				[phase]: "running",
			};

			// 根据阶段计算大致进度
			const phaseProgressMap: Record<ThinkingPhase, number> = {
				analyzing: 10,
				planning: 25,
				executing: 50,
				reflecting: 80,
				concluding: 95,
			};
			newProgress.overallProgress = phaseProgressMap[phase];

			return {
				...state,
				thinkingPhase: phase,
				thinkingSteps: updatedSteps,
				taskProgress: newProgress,
			};
		});

		if (taskId) {
			this.emitEvent({
				type: "thinking_phase_changed",
				taskId,
				phase,
				content,
			});
		}
	}

	// 更新思考内容（不改变阶段）
	updateThinkingContent(content: string) {
		this.setState((state) => {
			if (state.thinkingSteps.length === 0) return state;

			const updatedSteps = [...state.thinkingSteps];
			const lastStep = updatedSteps[updatedSteps.length - 1];
			lastStep.content = content;

			return {
				...state,
				thinkingSteps: updatedSteps,
			};
		});
	}

	// 获取思考步骤
	getThinkingSteps(): AgentThinkingStep[] {
		return this.state.thinkingSteps;
	}

	// 清空思考步骤
	clearThinkingSteps() {
		this.setState((state) => ({
			...state,
			thinkingSteps: [],
			thinkingPhase: "analyzing",
		}));
	}

	// ============ 进度管理 ============

	// 初始化进度
	initProgress() {
		this.setState((state) => ({
			...state,
			taskProgress: createDefaultProgress(),
		}));
	}

	// 更新进度
	updateProgress(updates: Partial<TaskProgress>) {
		const taskId = this.state.currentTask?.id;

		this.setState((state) => {
			if (!state.taskProgress) return state;

			const newProgress: TaskProgress = {
				...state.taskProgress,
				...updates,
			};

			return {
				...state,
				taskProgress: newProgress,
			};
		});

		if (taskId && this.state.taskProgress) {
			this.emitEvent({
				type: "progress_updated",
				taskId,
				progress: this.state.taskProgress,
			});
		}
	}

	// 更新工具调用统计
	updateToolCallStats(completed: boolean, failed: boolean = false) {
		this.setState((state) => {
			if (!state.taskProgress) return state;

			const stats = { ...state.taskProgress.toolCallStats };
			stats.total++;
			if (completed) stats.completed++;
			if (failed) stats.failed++;

			return {
				...state,
				taskProgress: {
					...state.taskProgress,
					toolCallStats: stats,
				},
			};
		});
	}

	// 设置当前操作描述
	setCurrentOperation(operation: string) {
		this.setState((state) => {
			if (!state.taskProgress) return state;

			return {
				...state,
				taskProgress: {
					...state.taskProgress,
					currentOperation: operation,
				},
			};
		});
	}

	// 完成阶段
	completePhase(phase: ThinkingPhase) {
		this.setState((state) => {
			if (!state.taskProgress) return state;

			return {
				...state,
				taskProgress: {
					...state.taskProgress,
					phaseStatus: {
						...state.taskProgress.phaseStatus,
						[phase]: "completed",
					},
				},
			};
		});
	}

	// ============ 错误恢复管理 ============

	// 设置待处理的错误恢复
	setPendingErrorRecovery(toolCallId: string, strategy: ErrorRecoveryStrategy) {
		const taskId = this.state.currentTask?.id;

		this.setState((state) => ({
			...state,
			pendingErrorRecovery: { toolCallId, strategy },
		}));

		if (taskId) {
			this.emitEvent({
				type: "error_recovery",
				taskId,
				toolCallId,
				strategy,
			});
		}
	}

	// 清除待处理的错误恢复
	clearPendingErrorRecovery() {
		this.setState((state) => ({
			...state,
			pendingErrorRecovery: null,
		}));
	}

	// 获取待处理的错误恢复
	getPendingErrorRecovery() {
		return this.state.pendingErrorRecovery;
	}

	// ============ LLM 等待状态管理 ============

	// 设置是否正在等待 LLM 响应
	setWaitingForLLM(waiting: boolean) {
		this.setState((state) => ({
			...state,
			isWaitingForLLM: waiting,
		}));
	}

	// ============ Skill 执行状态管理 ============

	// 设置 Skill 执行状态
	setSkillExecution(skill: SkillExecution | null) {
		this.setState((state) => ({
			...state,
			currentSkill: skill,
		}));
	}
}

// 单例导出
export const agentStore = new AgentStore();

// React Hook
export function useAgentStore() {
	const state = useSyncExternalStore(
		agentStore.subscribe,
		agentStore.getState,
		agentStore.getState,
	);

	return {
		...state,
		startTask: agentStore.startTask.bind(agentStore),
		updateTaskStatus: agentStore.updateTaskStatus.bind(agentStore),
		completeTask: agentStore.completeTask.bind(agentStore),
		failTask: agentStore.failTask.bind(agentStore),
		cancelTask: agentStore.cancelTask.bind(agentStore),
		pauseTask: agentStore.pauseTask.bind(agentStore),
		resumeTask: agentStore.resumeTask.bind(agentStore),
		setThinking: agentStore.setThinking.bind(agentStore),
		appendThinking: agentStore.appendThinking.bind(agentStore),
		clearPartialThinking: agentStore.clearPartialThinking.bind(agentStore),
		clearCurrentTask: agentStore.clearCurrentTask.bind(agentStore),
		addToolCall: agentStore.addToolCall.bind(agentStore),
		updateToolCall: agentStore.updateToolCall.bind(agentStore),
		addArtifact: agentStore.addArtifact.bind(agentStore),
		addArtifacts: agentStore.addArtifacts.bind(agentStore),
		setBrowserUrl: agentStore.setBrowserUrl.bind(agentStore),
		getTaskHistory: agentStore.getTaskHistory.bind(agentStore),
		clearHistory: agentStore.clearHistory.bind(agentStore),
		viewHistoryTask: agentStore.viewHistoryTask.bind(agentStore),
		onEvent: agentStore.onEvent.bind(agentStore),
		setTaskSteps: agentStore.setTaskSteps.bind(agentStore),
		updateTaskStep: agentStore.updateTaskStep.bind(agentStore),
		updateTaskStepByKind: agentStore.updateTaskStepByKind.bind(agentStore),
		startNextPendingStep: agentStore.startNextPendingStep.bind(agentStore),
		// 思考阶段管理
		setThinkingPhase: agentStore.setThinkingPhase.bind(agentStore),
		updateThinkingContent: agentStore.updateThinkingContent.bind(agentStore),
		getThinkingSteps: agentStore.getThinkingSteps.bind(agentStore),
		clearThinkingSteps: agentStore.clearThinkingSteps.bind(agentStore),
		// 进度管理
		initProgress: agentStore.initProgress.bind(agentStore),
		updateProgress: agentStore.updateProgress.bind(agentStore),
		updateToolCallStats: agentStore.updateToolCallStats.bind(agentStore),
		setCurrentOperation: agentStore.setCurrentOperation.bind(agentStore),
		completePhase: agentStore.completePhase.bind(agentStore),
		// 错误恢复管理
		setPendingErrorRecovery:
			agentStore.setPendingErrorRecovery.bind(agentStore),
		clearPendingErrorRecovery:
			agentStore.clearPendingErrorRecovery.bind(agentStore),
		getPendingErrorRecovery:
			agentStore.getPendingErrorRecovery.bind(agentStore),
		// LLM 等待状态管理
		setWaitingForLLM: agentStore.setWaitingForLLM.bind(agentStore),
	};
}
