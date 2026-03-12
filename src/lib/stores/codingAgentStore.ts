/**
 * 编码 Agent 状态管理
 * 管理编码模式（Code/Plan/Ask）和后端选择（Claude Code/Codex）
 */

import { useSyncExternalStore } from "react";

// 编码模式
export type CodingMode = "code" | "plan" | "ask";

// 编码后端
export type CodingBackend = "claude-code" | "codex";

// Plan 模式中的步骤
export interface PlanStep {
	id: string;
	title: string;
	description: string;
	status: "pending" | "running" | "completed" | "skipped";
}

interface CodingAgentState {
	/** 当前编码模式 */
	codingMode: CodingMode;
	/** 当前后端 */
	codingBackend: CodingBackend;
	/** Plan 模式下的待确认计划 */
	pendingPlan: PlanStep[] | null;
	/** Plan 是否已被用户确认 */
	planApproved: boolean;
}

const STORAGE_KEY = "ipo-coding-agent-state";

function loadState(): CodingAgentState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				codingMode: parsed.codingMode || "code",
				codingBackend: parsed.codingBackend || "claude-code",
				pendingPlan: null,
				planApproved: false,
			};
		}
	} catch {
		// ignore
	}
	return {
		codingMode: "code",
		codingBackend: "claude-code",
		pendingPlan: null,
		planApproved: false,
	};
}

class CodingAgentStore {
	private state: CodingAgentState = loadState();
	private listeners = new Set<() => void>();

	getState = (): CodingAgentState => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		for (const listener of this.listeners) listener();
	}

	private persist() {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					codingMode: this.state.codingMode,
					codingBackend: this.state.codingBackend,
				}),
			);
		} catch {
			// ignore
		}
	}

	setCodingMode = (mode: CodingMode) => {
		if (this.state.codingMode === mode) return;
		this.state = {
			...this.state,
			codingMode: mode,
			pendingPlan: null,
			planApproved: false,
		};
		this.persist();
		this.emit();
	};

	setCodingBackend = (backend: CodingBackend) => {
		if (this.state.codingBackend === backend) return;
		this.state = { ...this.state, codingBackend: backend };
		this.persist();
		this.emit();
	};

	setPendingPlan = (plan: PlanStep[] | null) => {
		this.state = { ...this.state, pendingPlan: plan, planApproved: false };
		this.emit();
	};

	approvePlan = () => {
		this.state = { ...this.state, planApproved: true };
		this.emit();
	};

	rejectPlan = () => {
		this.state = { ...this.state, pendingPlan: null, planApproved: false };
		this.emit();
	};
}

export const codingAgentStore = new CodingAgentStore();

/** 选择器 hook */
export function useCodingAgentSelector<T>(
	selector: (state: CodingAgentState) => T,
): T {
	return useSyncExternalStore(
		codingAgentStore.subscribe,
		() => selector(codingAgentStore.getState()),
		() => selector(codingAgentStore.getState()),
	);
}
