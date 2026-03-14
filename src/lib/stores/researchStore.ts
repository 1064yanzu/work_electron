// 研究状态管理 - 研究任务、步骤、资料

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";
import type {
	ResearchSource,
	ResearchState,
	ResearchStep,
	ResearchTask,
} from "./types";

const initialResearchState: ResearchState = {
	currentResearch: null,
	researchHistory: [],
};

const store = createStore<ResearchState>(initialResearchState);

// === 操作方法 ===

// 开始研究任务
function startResearch(query: string): string {
	const task: ResearchTask = {
		id: `research-${Date.now()}`,
		query,
		status: "searching",
		steps: [
			{
				id: `step-${Date.now()}`,
				type: "search",
				status: "running",
				title: "搜索相关资料",
				description: `正在搜索: ${query}`,
				timestamp: Date.now(),
			},
		],
		sources: [],
		createdAt: Date.now(),
	};

	store.setState((state) => ({
		...state,
		currentResearch: task,
	}));

	return task.id;
}

// 添加研究步骤
function addResearchStep(step: Omit<ResearchStep, "id" | "timestamp">) {
	store.setState((state) => {
		if (!state.currentResearch) return state;

		const newStep: ResearchStep = {
			...step,
			id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			timestamp: Date.now(),
		};

		return {
			...state,
			currentResearch: {
				...state.currentResearch,
				steps: [...state.currentResearch.steps, newStep],
			},
		};
	});
}

// 更新研究步骤状态
function updateResearchStep(stepId: string, updates: Partial<ResearchStep>) {
	store.setState((state) => {
		if (!state.currentResearch) return state;

		return {
			...state,
			currentResearch: {
				...state.currentResearch,
				steps: state.currentResearch.steps.map((s) =>
					s.id === stepId ? { ...s, ...updates } : s,
				),
			},
		};
	});
}

// 添加研究资料
function addResearchSource(source: Omit<ResearchSource, "id" | "timestamp">) {
	store.setState((state) => {
		if (!state.currentResearch) return state;

		const newSource: ResearchSource = {
			...source,
			id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			timestamp: Date.now(),
		};

		return {
			...state,
			currentResearch: {
				...state.currentResearch,
				sources: [...state.currentResearch.sources, newSource],
			},
		};
	});
}

// 更新研究任务状态
function updateResearchStatus(
	status: ResearchTask["status"],
	summary?: string,
) {
	store.setState((state) => {
		if (!state.currentResearch) return state;

		return {
			...state,
			currentResearch: {
				...state.currentResearch,
				status,
				summary,
				completedAt:
					status === "completed" || status === "error" ? Date.now() : undefined,
			},
		};
	});
}

// 完成研究任务
function completeResearch(summary: string) {
	store.setState((state) => {
		if (!state.currentResearch) return state;

		const completedTask: ResearchTask = {
			...state.currentResearch,
			status: "completed",
			summary,
			completedAt: Date.now(),
			steps: [
				...state.currentResearch.steps,
				{
					id: `step-complete-${Date.now()}`,
					type: "complete",
					status: "completed",
					title: "研究完成",
					description:
						summary.slice(0, 100) + (summary.length > 100 ? "..." : ""),
					timestamp: Date.now(),
				},
			],
		};

		return {
			...state,
			currentResearch: completedTask,
			researchHistory: [completedTask, ...state.researchHistory].slice(0, 10), // 保留最近10个
		};
	});
}

// 清除当前研究
function clearCurrentResearch() {
	store.setState((state) => ({
		...state,
		currentResearch: null,
	}));
}

/**
 * 项目切换时重置研究状态（由 workspaceStore.setCurrentProject 调用）
 */
function resetOnProjectChange() {
	// 研究状态目前不需要在切换项目时重置
}

// === 导出 ===

export const researchStore = {
	...store,
	startResearch,
	addResearchStep,
	updateResearchStep,
	addResearchSource,
	updateResearchStatus,
	completeResearch,
	clearCurrentResearch,
	resetOnProjectChange,
};

export const useResearchStore = createUseStore(store);
export const useResearchStoreSelector = createUseStoreSelector(store);
