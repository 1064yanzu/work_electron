/**
 * usePetEventBridge — 宠物窗口的 Agent 事件桥（v3）
 *
 * 升级要点：
 * - 通知 FIFO 队列（最长 3 条）：连发不丢失，前一条结束自动播下一条
 * - progress.stepLabel debounce 120ms：避免快速 tool_call_start 抖动
 * - sessionStats: 连续完成激励 / 连续报错安抚
 * - approval-waiting: 30s 未消化升级为 reminder
 * - 当天首见问候：通过 localStorage 比较日期
 * - pet-trigger-reminder IPC 接入点（番茄钟 / 外部驱动）
 * - 勿扰时段：在 dndStart-dndEnd 内 done/task/progress 静默，仅 reminder/error 出气泡
 * - dwellPreset 系数（× 0.7 / 1 / 1.5）通过外部 hook 传入
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { invoke } from "../lib/tauriCompat";
import { listen, type UnlistenFn } from "../lib/tauriEventCompat";
import { selectLine } from "../lib/mascot/personality";
import { mascotManager } from "../lib/mascotStore";

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

export interface PetProgress {
	current: number;
	stepLabel: string;
}

export type PetReminderKind = "schedule" | "pomodoro" | "approval-waiting";

export interface PetReminder {
	id: string;
	kind: PetReminderKind;
	title: string;
	detail?: string;
}

export interface PetNotificationItem {
	id: string;
	type: "done" | "error" | "approval";
	message: string;
	/** 拼在 opener 之前的小前缀（"小庆祝" / "安抚"） */
	prefix?: string;
	createdAt: number;
}

export interface SessionStats {
	consecutiveDone: number;
	consecutiveError: number;
	lastSeenDate: string; // YYYY-MM-DD
}

export interface PetEventState {
	petState: PetState;
	currentTask: PetTask | null;
	progress: PetProgress | null;
	notification: PetNotificationItem | null;
	notificationQueue: PetNotificationItem[];
	unreadCount: number;
	reminder: PetReminder | null;
	sessionStats: SessionStats;
	pendingApprovalSince: number | null;
}

const SEEN_DATE_KEY = "mascotLastSeenDate";
const APPROVAL_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;
const QUEUE_MAX = 3;

type PetEventAction =
	| { type: "AGENT_START"; task: PetTask }
	| { type: "AGENT_PROGRESS"; runId: string; stepLabel: string }
	| {
			type: "AGENT_DONE";
			runId: string;
			message?: string;
			personalityId: "efficiency" | "cloud" | "leisure";
	  }
	| {
			type: "AGENT_ERROR";
			runId: string;
			error: string;
			personalityId: "efficiency" | "cloud" | "leisure";
	  }
	| { type: "AGENT_APPROVAL"; runId: string; message: string }
	| { type: "SET_STATE"; state: PetState }
	| { type: "DISMISS_NOTIFICATION" }
	| { type: "CONSUME_NEXT_NOTIFICATION" }
	| { type: "MARK_READ" }
	| { type: "SHOW_REMINDER"; reminder: PetReminder }
	| { type: "DISMISS_REMINDER" }
	| { type: "IDLE_TIMEOUT" }
	| {
			type: "BUMP_LAST_SEEN";
			date: string;
	  }
	| { type: "CLEAR_PENDING_APPROVAL" };

function humanizeToolName(name: string): string {
	const map: Record<string, string> = {
		Read: "读文件",
		Write: "写文件",
		Edit: "改文件",
		Bash: "跑命令",
		Glob: "找文件",
		Grep: "搜代码",
		WebFetch: "查网页",
		WebSearch: "搜资料",
		Task: "调用子任务",
	};
	return map[name] ?? name;
}

function todayDate(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function pickPrefix(
	personalityId: "efficiency" | "cloud" | "leisure",
	key: "encouragement" | "consolation",
): string {
	return selectLine(personalityId, key);
}

function newNotification(
	type: "done" | "error" | "approval",
	message: string,
	prefix?: string,
): PetNotificationItem {
	return {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		type,
		message,
		prefix,
		createdAt: Date.now(),
	};
}

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
				progress: { current: 0, stepLabel: "准备中" },
			};

		case "AGENT_PROGRESS":
			if (state.currentTask?.runId !== action.runId) return state;
			return {
				...state,
				petState: "thinking",
				progress: {
					current: (state.progress?.current ?? 0) + 1,
					stepLabel: action.stepLabel,
				},
			};

		case "AGENT_DONE": {
			if (state.currentTask?.runId !== action.runId) return state;
			const consecutiveDone = state.sessionStats.consecutiveDone + 1;
			const prefix =
				consecutiveDone >= 3
					? pickPrefix(action.personalityId, "encouragement")
					: undefined;
			const item = newNotification(
				"done",
				action.message ?? "任务完成",
				prefix,
			);
			const queueAfter = enqueue(state.notificationQueue, state.notification);
			return {
				...state,
				petState: "done",
				currentTask: null,
				progress: null,
				notification: item,
				notificationQueue: queueAfter,
				unreadCount: state.unreadCount + 1,
				sessionStats: {
					...state.sessionStats,
					consecutiveDone,
					consecutiveError: 0,
				},
			};
		}

		case "AGENT_ERROR": {
			if (state.currentTask?.runId !== action.runId) return state;
			const consecutiveError = state.sessionStats.consecutiveError + 1;
			const prefix =
				consecutiveError >= 2
					? pickPrefix(action.personalityId, "consolation")
					: undefined;
			const item = newNotification("error", action.error || "任务出错", prefix);
			const queueAfter = enqueue(state.notificationQueue, state.notification);
			return {
				...state,
				petState: "error",
				currentTask: null,
				progress: null,
				notification: item,
				notificationQueue: queueAfter,
				unreadCount: state.unreadCount + 1,
				sessionStats: {
					...state.sessionStats,
					consecutiveDone: 0,
					consecutiveError,
				},
			};
		}

		case "AGENT_APPROVAL": {
			const item = newNotification("approval", action.message || "需要审批");
			const queueAfter = enqueue(state.notificationQueue, state.notification);
			return {
				...state,
				petState: "error",
				notification: item,
				notificationQueue: queueAfter,
				unreadCount: state.unreadCount + 1,
				pendingApprovalSince: Date.now(),
			};
		}

		case "SET_STATE":
			return { ...state, petState: action.state };

		case "DISMISS_NOTIFICATION": {
			// 用户主动 dismiss → 立刻进下一条
			const next = state.notificationQueue[0] ?? null;
			const rest = next ? state.notificationQueue.slice(1) : [];
			return {
				...state,
				notification: next,
				notificationQueue: rest,
				unreadCount: next ? state.unreadCount : 0,
				petState: state.currentTask
					? "thinking"
					: next
						? state.petState
						: "idle",
			};
		}

		case "CONSUME_NEXT_NOTIFICATION": {
			// dwell timer 结束后 PetApp 主动取下一条
			const next = state.notificationQueue[0] ?? null;
			const rest = next ? state.notificationQueue.slice(1) : [];
			return {
				...state,
				notification: next,
				notificationQueue: rest,
				petState: state.currentTask
					? "thinking"
					: next
						? state.petState
						: "idle",
			};
		}

		case "MARK_READ":
			return { ...state, unreadCount: 0 };

		case "SHOW_REMINDER":
			return { ...state, reminder: action.reminder };

		case "DISMISS_REMINDER":
			return { ...state, reminder: null, pendingApprovalSince: null };

		case "IDLE_TIMEOUT":
			if (state.petState === "idle") {
				return { ...state, petState: "sleepy" };
			}
			return state;

		case "BUMP_LAST_SEEN":
			return {
				...state,
				sessionStats: { ...state.sessionStats, lastSeenDate: action.date },
			};

		case "CLEAR_PENDING_APPROVAL":
			return { ...state, pendingApprovalSince: null };

		default:
			return state;
	}
}

/** 把当前正在显示的通知（如果有）作为"前一条"塞进队列；最多保留 QUEUE_MAX 条 */
function enqueue(
	queue: PetNotificationItem[],
	current: PetNotificationItem | null,
): PetNotificationItem[] {
	if (!current) return queue;
	// 注意：reducer 里 next === current 时不应入队（避免循环）；这里调用者已确保 current 是被替换掉的"前一条"
	const next = [...queue, current];
	return next.length > QUEUE_MAX ? next.slice(next.length - QUEUE_MAX) : next;
}

const INITIAL_STATE: PetEventState = {
	petState: "idle",
	currentTask: null,
	progress: null,
	notification: null,
	notificationQueue: [],
	unreadCount: 0,
	reminder: null,
	sessionStats: {
		consecutiveDone: 0,
		consecutiveError: 0,
		lastSeenDate:
			(typeof window !== "undefined" &&
				window.localStorage?.getItem(SEEN_DATE_KEY)) ||
			"",
	},
	pendingApprovalSince: null,
};

export interface PetEventBridge extends PetEventState {
	markRead: () => void;
	dismissNotification: () => void;
	consumeNextNotification: () => void;
	dismissReminder: () => void;
	/** 当前 dwell 系数（设置面板提供，默认 1） */
	dwellMultiplier: number;
	/** 是否处于勿扰时段 */
	isDoNotDisturb: boolean;
}

interface DndState {
	dwellMultiplier: number;
	isDoNotDisturb: boolean;
}

function parseTime(s: string | null): number | null {
	if (!s) return null;
	const m = s.match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
	const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
	return h * 60 + mm;
}

function nowMinutes(): number {
	const d = new Date();
	return d.getHours() * 60 + d.getMinutes();
}

function inDndWindow(start: number | null, end: number | null): boolean {
	if (start === null || end === null) return false;
	const now = nowMinutes();
	if (start === end) return false;
	if (start < end) {
		// 同一天：22:00-23:00
		return now >= start && now < end;
	}
	// 跨夜：22:00-08:00
	return now >= start || now < end;
}

export function usePetEventBridge(): PetEventBridge {
	const [state, dispatch] = useReducer(petEventReducer, INITIAL_STATE);
	const [dnd, setDnd] = useState<DndState>({
		dwellMultiplier: 1,
		isDoNotDisturb: false,
	});
	const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const approvalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const progressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const pendingProgressRef = useRef<{
		runId: string;
		stepLabel: string;
	} | null>(null);
	const dndStartRef = useRef<number | null>(null);
	const dndEndRef = useRef<number | null>(null);

	const resetIdleTimer = useCallback(() => {
		if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
		idleTimerRef.current = setTimeout(() => {
			dispatch({ type: "IDLE_TIMEOUT" });
		}, IDLE_TIMEOUT_MS);
	}, []);

	// 取当前 personality id（off → efficiency 兜底；自定义桌宠也回退到 efficiency 话术）
	const getPersonalityId = useCallback(():
		| "efficiency"
		| "cloud"
		| "leisure" => {
		const id = mascotManager.getId();
		if (id === "efficiency" || id === "cloud" || id === "leisure") {
			return id;
		}
		return "efficiency";
	}, []);

	// 启动时拉取 dwell / dnd 设置；监听 pet-settings-changed 实时更新
	useEffect(() => {
		const applyState = (state: {
			dwellPreset?: string;
			dndStart?: string | null;
			dndEnd?: string | null;
		}) => {
			if (state.dwellPreset) {
				const mult =
					state.dwellPreset === "short"
						? 0.7
						: state.dwellPreset === "long"
							? 1.5
							: 1;
				setDnd((prev) => ({ ...prev, dwellMultiplier: mult }));
			}
			if (state.dndStart !== undefined || state.dndEnd !== undefined) {
				dndStartRef.current = parseTime(state.dndStart ?? null);
				dndEndRef.current = parseTime(state.dndEnd ?? null);
				setDnd((prev) => ({
					...prev,
					isDoNotDisturb: inDndWindow(dndStartRef.current, dndEndRef.current),
				}));
			}
		};

		void invoke<{
			dwellPreset: string;
			dndStart: string | null;
			dndEnd: string | null;
		}>("pet_window_get_state")
			.then(applyState)
			.catch(() => {});

		let unlisten: UnlistenFn | null = null;
		void (async () => {
			try {
				unlisten = await listen<{ patch: Record<string, unknown> }>(
					"pet-settings-changed",
					(event) => {
						applyState(event.payload?.patch ?? {});
					},
				);
			} catch {
				// noop
			}
		})();

		// 每分钟刷一次 dnd 标记
		const interval = setInterval(() => {
			setDnd((prev) => ({
				...prev,
				isDoNotDisturb: inDndWindow(dndStartRef.current, dndEndRef.current),
			}));
		}, 60_000);

		return () => {
			unlisten?.();
			clearInterval(interval);
		};
	}, []);

	// 当天首见问候
	useEffect(() => {
		const today = todayDate();
		const last =
			(typeof window !== "undefined" &&
				window.localStorage?.getItem(SEEN_DATE_KEY)) ||
			"";
		if (last !== today) {
			window.localStorage?.setItem(SEEN_DATE_KEY, today);
			dispatch({ type: "BUMP_LAST_SEEN", date: today });
			// 用 reminder 通道做一次温暖提醒
			const id = getPersonalityId();
			const greet = selectLine(id, "greetFirstTimeToday");
			dispatch({
				type: "SHOW_REMINDER",
				reminder: {
					id: `greet-${today}`,
					kind: "schedule",
					title: greet,
					detail: undefined,
				},
			});
		}
	}, [getPersonalityId]);

	// approval 30s 升级
	useEffect(() => {
		if (state.pendingApprovalSince === null) {
			if (approvalTimerRef.current) {
				clearTimeout(approvalTimerRef.current);
				approvalTimerRef.current = null;
			}
			return;
		}
		if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current);
		const remaining =
			APPROVAL_TIMEOUT_MS - (Date.now() - state.pendingApprovalSince);
		approvalTimerRef.current = setTimeout(
			() => {
				// 仍然没有人处理（notification 没被 dismiss）→ 升级到 reminder
				dispatch({
					type: "SHOW_REMINDER",
					reminder: {
						id: `approval-${Date.now()}`,
						kind: "approval-waiting",
						title: "Agent 等了你 30 秒了",
						detail: "需要你的决定才能继续。",
					},
				});
				dispatch({ type: "CLEAR_PENDING_APPROVAL" });
			},
			Math.max(0, remaining),
		);
		return () => {
			if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current);
		};
	}, [state.pendingApprovalSince]);

	// 接收 pet-trigger-reminder（番茄钟 / 外部驱动）
	useEffect(() => {
		let unlisten: UnlistenFn | null = null;
		void (async () => {
			try {
				unlisten = await listen<{
					kind: PetReminderKind;
					title: string;
					detail?: string;
					id?: string;
				}>("pet-trigger-reminder", (event) => {
					const p = event.payload;
					if (!p?.title) return;
					dispatch({
						type: "SHOW_REMINDER",
						reminder: {
							id: p.id ?? `ext-${Date.now()}`,
							kind: p.kind ?? "schedule",
							title: p.title,
							detail: p.detail,
						},
					});
				});
			} catch {
				// noop
			}
		})();
		return () => {
			unlisten?.();
		};
	}, []);

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
						const events = payload.events ?? [];
						const hasUserPrompt = events.some(
							(e) =>
								e.type === "text_delta" &&
								typeof e.content === "string" &&
								e.content.trim(),
						);
						if (hasUserPrompt) {
							dispatch({
								type: "AGENT_START",
								task: {
									title: extractTaskTitle(events),
									runId,
									startedAt: Date.now(),
								},
							});
						}
						// tool 调用 progress（debounce 120ms 取最后一次）
						for (const ev of events) {
							if (
								ev.type === "tool_call_start" &&
								typeof ev.name === "string"
							) {
								pendingProgressRef.current = {
									runId,
									stepLabel: humanizeToolName(ev.name),
								};
								if (progressDebounceRef.current) {
									clearTimeout(progressDebounceRef.current);
								}
								progressDebounceRef.current = setTimeout(() => {
									const p = pendingProgressRef.current;
									if (!p) return;
									dispatch({
										type: "AGENT_PROGRESS",
										runId: p.runId,
										stepLabel: p.stepLabel,
									});
									pendingProgressRef.current = null;
								}, 120);
							}
						}
						return;
					}

					if (payload.type === "done") {
						// 勿扰时段：done 静默
						if (inDndWindow(dndStartRef.current, dndEndRef.current)) {
							// 仍然要清掉 currentTask 状态，但不进通知 / 不抢气泡
							// 直接给一个内部 SET_STATE 回 idle
							dispatch({ type: "SET_STATE", state: "idle" });
							return;
						}
						const resultText =
							typeof (payload.result as Record<string, unknown>)?.result ===
							"string"
								? String((payload.result as Record<string, unknown>).result)
								: "任务完成";
						dispatch({
							type: "AGENT_DONE",
							runId,
							message: resultText,
							personalityId: getPersonalityId(),
						});
						return;
					}

					if (payload.type === "error") {
						dispatch({
							type: "AGENT_ERROR",
							runId,
							error: payload.error || "未知错误",
							personalityId: getPersonalityId(),
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
		resetIdleTimer();

		return () => {
			unlisten?.();
			if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
			if (progressDebounceRef.current)
				clearTimeout(progressDebounceRef.current);
		};
	}, [resetIdleTimer, getPersonalityId]);

	const markRead = useCallback(() => dispatch({ type: "MARK_READ" }), []);
	const dismissNotification = useCallback(
		() => dispatch({ type: "DISMISS_NOTIFICATION" }),
		[],
	);
	const consumeNextNotification = useCallback(
		() => dispatch({ type: "CONSUME_NEXT_NOTIFICATION" }),
		[],
	);
	const dismissReminder = useCallback(
		() => dispatch({ type: "DISMISS_REMINDER" }),
		[],
	);

	return {
		...state,
		markRead,
		dismissNotification,
		consumeNextNotification,
		dismissReminder,
		dwellMultiplier: dnd.dwellMultiplier,
		isDoNotDisturb: dnd.isDoNotDisturb,
	};
}

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
