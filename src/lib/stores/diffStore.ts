// Diff 状态管理 - 管理 Agent 文件操作的 diff 数据
// 当 Agent 执行 Edit/Write 工具时，生成并存储 diff 信息

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";

// 单个文件的 Diff 信息
export interface FileDiff {
	id: string;
	filePath: string;
	oldContent: string;
	newContent: string;
	status: "pending" | "accepted" | "rejected";
	timestamp: number;
	toolCallId: string; // 关联的工具调用 ID
	taskId?: string; // 关联的 Agent 任务 ID
	toolName?: string; // 工具名称（Write / Edit）
	language?: string; // 文件语言（用于语法高亮）
	oldFileExisted?: boolean; // 用于区分“新建文件”和“覆盖空文件”
}

// Diff Store 状态
interface DiffState {
	// 所有 diff 记录（id -> FileDiff）
	diffs: Record<string, FileDiff>;
	// 当前激活的 diff ID（用于中间面板展示）
	activeDiffId: string | null;
	// 当前 Agent 任务的 diff 汇总是否展开
	summaryExpanded: boolean;
}

const initialState: DiffState = {
	diffs: {},
	activeDiffId: null,
	summaryExpanded: true,
};

const store = createStore<DiffState>(initialState);

// === 操作方法 ===

// 添加一个 diff 记录
function addDiff(diff: FileDiff) {
	store.setState((state) => ({
		...state,
		diffs: {
			...state.diffs,
			[diff.id]: diff,
		},
	}));
}

// 更新 diff 状态（接受/拒绝）
function updateDiffStatus(diffId: string, status: FileDiff["status"]) {
	store.setState((state) => {
		const existing = state.diffs[diffId];
		if (!existing) return state;
		return {
			...state,
			diffs: {
				...state.diffs,
				[diffId]: { ...existing, status },
			},
		};
	});
}

// 设置当前激活的 diff
function setActiveDiff(diffId: string | null) {
	store.setState((state) => ({
		...state,
		activeDiffId: diffId,
	}));
}

// 接受所有待处理的 diff
function acceptAll() {
	store.setState((state) => {
		const updated: Record<string, FileDiff> = {};
		for (const [id, diff] of Object.entries(state.diffs)) {
			updated[id] =
				diff.status === "pending" ? { ...diff, status: "accepted" } : diff;
		}
		return { ...state, diffs: updated };
	});
}

// 拒绝所有待处理的 diff
function rejectAll() {
	store.setState((state) => {
		const updated: Record<string, FileDiff> = {};
		for (const [id, diff] of Object.entries(state.diffs)) {
			updated[id] =
				diff.status === "pending" ? { ...diff, status: "rejected" } : diff;
		}
		return { ...state, diffs: updated };
	});
}

// 切换汇总面板展开状态
function toggleSummary() {
	store.setState((state) => ({
		...state,
		summaryExpanded: !state.summaryExpanded,
	}));
}

// 清除所有 diff（任务结束后调用）
function clearDiffs() {
	store.setState(() => initialState);
}

// 根据工具调用 ID 获取 diff
function getDiffByToolCallId(toolCallId: string): FileDiff | undefined {
	const state = store.getState();
	return Object.values(state.diffs).find((d) => d.toolCallId === toolCallId);
}

// 获取所有 diff 的统计信息
function getDiffStats(): {
	total: number;
	pending: number;
	accepted: number;
	rejected: number;
} {
	const state = store.getState();
	const diffs = Object.values(state.diffs);
	return {
		total: diffs.length,
		pending: diffs.filter((d) => d.status === "pending").length,
		accepted: diffs.filter((d) => d.status === "accepted").length,
		rejected: diffs.filter((d) => d.status === "rejected").length,
	};
}

// === 导出 ===

export const diffStore = {
	...store,
	addDiff,
	updateDiffStatus,
	setActiveDiff,
	acceptAll,
	rejectAll,
	toggleSummary,
	clearDiffs,
	getDiffByToolCallId,
	getDiffStats,
};

export const useDiffStore = createUseStore(store);
export const useDiffStoreSelector = createUseStoreSelector(store);
export const useDiffSelector = useDiffStoreSelector;
