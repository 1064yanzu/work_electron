/**
 * Plan Mode Store — 规划模式状态管理
 *
 * 管理 Agent 的规划模式：先输出结构化计划，用户确认后再执行。
 * 使用项目自研 store 系统（基于 useSyncExternalStore）。
 */

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "../stores/createStore";

// ─── 类型定义 ───

/** 计划中的单个步骤 */
export interface PlanStep {
	id: string;
	title: string;
	description: string;
	/** 预计涉及的文件路径 */
	estimatedFiles?: string[];
	status: "pending" | "confirmed" | "rejected" | "executing" | "completed";
}

/** 一份完整的计划 */
export interface PlanData {
	id: string;
	/** 用户原始任务描述 */
	taskDescription: string;
	steps: PlanStep[];
	createdAt: number;
	confirmedAt?: number;
	status: "draft" | "confirmed" | "executing" | "completed" | "rejected";
}

/** 规划模式的全局状态 */
export interface PlanModeState {
	/** 是否启用规划模式 */
	enabled: boolean;
	/** 当前待确认/执行的计划 */
	currentPlan: PlanData | null;
	/** 历史计划记录 */
	planHistory: PlanData[];
	/** 当前阶段 */
	status: "idle" | "planning" | "confirming" | "executing";
}

// ─── Store 实例 ───

const initialState: PlanModeState = {
	enabled: false,
	currentPlan: null,
	planHistory: [],
	status: "idle",
};

export const planModeStore = createStore<PlanModeState>(initialState);

// ─── React Hooks ───

export const usePlanMode = createUseStore(planModeStore);
export const usePlanModeSelector = createUseStoreSelector(planModeStore);

// ─── 操作方法 ───

/** 切换规划模式开关 */
export function togglePlanMode(): void {
	planModeStore.setState((prev) => {
		const nextEnabled = !prev.enabled;
		// 关闭时清理进行中的计划
		if (!nextEnabled && prev.currentPlan?.status === "draft") {
			return {
				...prev,
				enabled: false,
				currentPlan: null,
				status: "idle",
			};
		}
		return { ...prev, enabled: nextEnabled };
	});
}

/** 设置规划模式启用状态 */
export function setPlanModeEnabled(enabled: boolean): void {
	planModeStore.setState((prev) => {
		if (prev.enabled === enabled) return prev;
		// 关闭时清理草稿计划
		if (!enabled && prev.currentPlan?.status === "draft") {
			return {
				...prev,
				enabled: false,
				currentPlan: null,
				status: "idle",
			};
		}
		return { ...prev, enabled };
	});
}

/** 设置当前计划（Agent 输出解析后调用） */
export function setPlan(plan: PlanData): void {
	planModeStore.setState((prev) => ({
		...prev,
		currentPlan: plan,
		status: "confirming",
	}));
}

/** 确认计划，准备执行 */
export function confirmPlan(): void {
	planModeStore.setState((prev) => {
		if (!prev.currentPlan || prev.currentPlan.status !== "draft") return prev;
		const confirmed: PlanData = {
			...prev.currentPlan,
			status: "confirmed",
			confirmedAt: Date.now(),
			steps: prev.currentPlan.steps.map((s) => ({
				...s,
				status: "confirmed" as const,
			})),
		};
		return {
			...prev,
			currentPlan: confirmed,
			status: "executing",
		};
	});
}

/** 拒绝计划 */
export function rejectPlan(): void {
	planModeStore.setState((prev) => {
		if (!prev.currentPlan) return prev;
		const rejected: PlanData = {
			...prev.currentPlan,
			status: "rejected",
		};
		return {
			...prev,
			currentPlan: null,
			planHistory: [rejected, ...prev.planHistory],
			status: "idle",
		};
	});
}

/** 更新某个步骤的状态 */
export function updateStepStatus(
	stepId: string,
	status: PlanStep["status"],
): void {
	planModeStore.setState((prev) => {
		if (!prev.currentPlan) return prev;
		const updatedSteps = prev.currentPlan.steps.map((s) =>
			s.id === stepId ? { ...s, status } : s,
		);
		// 检查是否所有步骤都已完成
		const allCompleted = updatedSteps.every((s) => s.status === "completed");
		const updatedPlan: PlanData = {
			...prev.currentPlan,
			steps: updatedSteps,
			status: allCompleted ? "completed" : prev.currentPlan.status,
		};
		if (allCompleted) {
			return {
				...prev,
				currentPlan: null,
				planHistory: [updatedPlan, ...prev.planHistory],
				status: "idle",
			};
		}
		return { ...prev, currentPlan: updatedPlan };
	});
}

/** 清除当前计划（不归档到历史） */
export function clearPlan(): void {
	planModeStore.setState((prev) => ({
		...prev,
		currentPlan: null,
		status: prev.enabled ? "idle" : "idle",
	}));
}

/** 将当前计划标记为执行中 */
export function startPlanExecution(): void {
	planModeStore.setState((prev) => {
		if (!prev.currentPlan || prev.currentPlan.status !== "confirmed")
			return prev;
		return {
			...prev,
			currentPlan: { ...prev.currentPlan, status: "executing" },
			status: "executing",
		};
	});
}

/** 重置整个 store（用于测试或清理） */
export function resetPlanMode(): void {
	planModeStore.setState(() => initialState);
}
