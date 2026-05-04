/**
 * usePetEventBridge — 宠物窗口的 Agent 事件桥
 *
 * 监听 main 进程转发的 agent-sdk-event，
 * 派生 currentTask / progress / petState。
 */

import { useEffect, useReducer, useRef } from "react";
import { listen, type UnlistenFn } from "../lib/tauriEventCompat";

// 与 AgentSdkEventPayload 对齐的简化类型
interface AgentSdkEventPayload {
	runId?: string;
	type: string;
	events?: Array<{
		type: string;
		content?: string;
		name?: string;
		[key: string]: unknown;
	}>;
	result?: Record<string, unknown>;
	error?: string;
	request?: Record<string, unknown>;
}

export type PetState =
	| "idle"
	| "hovering"
	| "dragging"
	| "thinking"
	| "done"
	| "error"
	| "sleepy";

export interface PetTask {
	title: string;
	runId: string;
	startedAt: number;
}

export interface PetEventState {
	petState: PetState;
	currentTask: PetTask | null;
	notification: { type: "done" | "error" | "approval"; message: string } | null;
}

type PetEventAction =
	| { type: "AGENT_START"; task: PetTask }
	| { type: "AGENT_PROGRESS"; runId: string }
	| { type: "AGENT_DONE"; runId: string; message?: string }
	| { type: "AGENT_ERROR"; runId: string; error: string }
	| { type: "AGENT_APPROVAL"; runId: string; message: string }
	| { type: "SET_STATE"; state: PetState }
	| { type: "DISMISS_NOTIFICATION" }
	| { type: "IDLE_TIMEOUT" };

const IDLE_TIMEOUT_MS = 60_000;

function petEventReducer(
	state: PetEventState,
	action: PetEventAction,
): PetEventState {
	switch (action.type) {
		case "AGENT_START":
			return {
				...state,
				petState: "thinking",
				currentTask: action.task,
				notification: null,
			};

		case "AGENT_PROGRESS":
			if (state.currentTask?.runId !== action.runId) return state;
			return { ...state, petState: "thinking" };

		case "AGENT_DONE":
			if (state.currentTask?.runId !== action.runId) return state;
			return {
				...state,
				petState: "done",
				currentTask: null,
				notification: {
					type: "done",
					message: action.message ?? "任务完成",
				},
			};

		case "AGENT_ERROR":
			if (state.currentTask?.runId !== action.runId) return state;
			return {
				...state,
				petState: "error",
				currentTask: null,
				notification: {
					type: "error",
					message: action.error || "任务出错",
				},
			};

		case "AGENT_APPROVAL":
			return {
				...state,
				petState: "error",
				notification: {
					type: "approval",
					message: action.message || "需要审批",
				},
			};

		case "SET_STATE":
			return { ...state, petState: action.state };

		case "DISMISS_NOTIFICATION":
			return {
				...state,
				notification: null,
				petState: state.currentTask ? "thinking" : "idle",
			};

		case "IDLE_TIMEOUT":
			if (state.petState === "idle") {
				return { ...state, petState: "sleepy" };
			}
			return state;

		default:
			return state;
	}
}

const INITIAL_STATE: PetEventState = {
	petState: "idle",
	currentTask: null,
	notification: null,
};

export function usePetEventBridge(): PetEventState {
	const [state, dispatch] = useReducer(petEventReducer, INITIAL_STATE);
	const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 重置空闲计时器
	const resetIdleTimer = () => {
		if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
		idleTimerRef.current = setTimeout(() => {
			dispatch({ type: "IDLE_TIMEOUT" });
		}, IDLE_TIMEOUT_MS);
	};

	useEffect(() => {
		let unlisten: UnlistenFn | null = null;

		const setup = async () => {
			unlisten = await listen<AgentSdkEventPayload>(
				"agent-sdk-event",
				(event) => {
					const payload = event.payload;
					const runId = String(payload.runId || "").trim();
					if (!runId) return;

					resetIdleTimer();

					if (payload.type === "transformed") {
						// 首次收到 transformed 视为任务开始
						dispatch({
							type: "AGENT_START",
							task: {
								title: extractTaskTitle(payload.events),
								runId,
								startedAt: Date.now(),
							},
						});
						return;
					}

					if (payload.type === "done") {
						const resultText =
							typeof (payload.result as Record<string, unknown>)?.result ===
							"string"
								? String((payload.result as Record<string, unknown>).result)
								: "任务完成";
						dispatch({ type: "AGENT_DONE", runId, message: resultText });
						return;
					}

					if (payload.type === "error") {
						dispatch({
							type: "AGENT_ERROR",
							runId,
							error: payload.error || "未知错误",
						});
						return;
					}

					if (payload.type === "interaction_request") {
						dispatch({
							type: "AGENT_APPROVAL",
							runId,
							message: "Agent 请求审批",
						});
						return;
					}
				},
			);
		};

		void setup();

		// 初始空闲计时器
		resetIdleTimer();

		return () => {
			unlisten?.();
			if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
		};
	}, []);

	return state;
}

/** 从事件流中提取第一条 user prompt 作为任务标题 */
function extractTaskTitle(
	events?: Array<{ type: string; content?: string; [key: string]: unknown }>,
): string {
	if (!events) return "任务进行中";
	for (const ev of events) {
		if (
			ev.type === "text_delta" &&
			typeof ev.content === "string" &&
			ev.content.trim()
		) {
			const text = ev.content.trim();
			return text.length > 40 ? `${text.slice(0, 40)}…` : text;
		}
	}
	return "任务进行中";
}
