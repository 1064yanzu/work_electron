/**
 * Agent watchdog 相关常量与纯辅助。
 *
 * - IDLE_FINALIZE：流式完全无事件超过 180s 且 agent 已经停止运行时主动收口
 * - STALLED_EXECUTION：agent 仍在执行但完全无事件超过 300s 视为卡死
 * - STALL_NOTE：收口时附加到正文末尾的提示
 *
 * 设计原则（对齐 Claude Code CLI）：
 * 1. Watchdog 只是"完全无任何事件"时的兜底，不应该掐死正在 thinking / 跑长命令的 agent
 * 2. 任何 stream_event / tool_use / stderr / system_notice 都应该 reset 计时器
 *    （这部分由调用方负责更新 lastActivityAt）
 * 3. 阈值要足够大：extended thinking 可能 60s，长 build 可能 5 分钟
 *
 * 这些常量原本散在 useAgentHandler 顶部，抽出后便于调参 + 复用到其他 agent runner
 */

/** 默认空闲收口时长（agent 已停止运行 + 完全无事件） */
export const AGENT_WATCHDOG_IDLE_FINALIZE_MS_DEFAULT = 180_000;

/** 默认卡死判定时长（agent 仍在执行但完全无事件） */
export const AGENT_WATCHDOG_STALLED_EXECUTION_MS_DEFAULT = 300_000;

/**
 * 兼容旧导出名（保持现有调用点编译通过）。
 * 这两个值会在运行时根据 chatSettings.lenientWatchdog 切换为更大的阈值或 Infinity。
 */
export const AGENT_WATCHDOG_IDLE_FINALIZE_MS =
	AGENT_WATCHDOG_IDLE_FINALIZE_MS_DEFAULT;
export const AGENT_WATCHDOG_STALLED_EXECUTION_MS =
	AGENT_WATCHDOG_STALLED_EXECUTION_MS_DEFAULT;

export const AGENT_WATCHDOG_STALL_NOTE =
	"> Agent 长时间未返回结束信号，已根据当前输出自动收口，并中止后台挂起运行。";

export type AgentWatchdogThresholds = {
	idleFinalizeMs: number;
	stalledExecutionMs: number;
};

/**
 * 计算 watchdog 阈值。lenient=true 时进一步放宽（idle 600s / stall 30 分钟），
 * 用于"长任务模式"：跑 build / migration / 大批量 ingest。
 */
export function resolveAgentWatchdogThresholds(opts?: {
	lenient?: boolean;
	idleFinalizeMsOverride?: number;
	stalledExecutionMsOverride?: number;
}): AgentWatchdogThresholds {
	const lenient = !!opts?.lenient;
	const idle =
		opts?.idleFinalizeMsOverride ??
		(lenient ? 600_000 : AGENT_WATCHDOG_IDLE_FINALIZE_MS_DEFAULT);
	const stall =
		opts?.stalledExecutionMsOverride ??
		(lenient ? 1_800_000 : AGENT_WATCHDOG_STALLED_EXECUTION_MS_DEFAULT);
	return {
		idleFinalizeMs: idle,
		stalledExecutionMs: stall,
	};
}

/**
 * 把 stall note 追加到正文末尾，同一 note 不重复 append。
 * 空正文也会得到 note 本体。
 */
export function appendStallFinalizeNote(text: string): string {
	const trimmed = String(text || "").trim();
	if (!trimmed) return AGENT_WATCHDOG_STALL_NOTE;
	if (trimmed.includes(AGENT_WATCHDOG_STALL_NOTE)) return trimmed;
	return `${trimmed}\n\n${AGENT_WATCHDOG_STALL_NOTE}`;
}

// ============================================================================
// Watchdog 判定 + 计时器
//
// 原来这两件事和 1200 行的 handleAgentModeMessage 闭包缠在一起：判定逻辑读
// agentStore / streamBuilder / 局部 let，没法单独看懂也没法单独验证。
// 这里把「判定」做成纯函数、「计时」做成小工厂，调用方只需提供一个 probe。
// ============================================================================

/** 一次 watchdog 轮询所需的全部输入。由调用方从各自的运行时状态里采集。 */
export type AgentWatchdogSnapshot = {
	/** 距上一次收到任何 agent 事件的毫秒数 */
	silenceMs: number;
	/** agent 是否仍在执行（isExecuting / 等待 LLM / task 处于 planning|executing / skill 未结束） */
	stillRunning: boolean;
	/** 是否有 running|pending 状态的工具调用（有就说明不是真卡死，只是在等工具） */
	hasRunningTools: boolean;
	/** 当前已累积的正文是否非空（全空时收口没有意义） */
	hasText: boolean;
};

export type AgentWatchdogAction =
	| "wait"
	| "finalize_inactivity"
	| "finalize_stall";

/**
 * Watchdog 判定（纯函数）。
 *
 * 判定顺序即优先级，不能随意调换：
 * 1. 静默时长没到 idle 阈值 → 一律等待；
 * 2. 有工具在跑 → 等待（长命令是正常现象，不能掐）；
 * 3. 正文还是空的 → 等待（没内容可收口）；
 * 4. agent 仍在执行 → 要等到更宽松的 stall 阈值才判定卡死；
 * 5. 其余情况 → agent 已停但没发结束信号，按静默收口。
 */
export function decideAgentWatchdogAction(
	snapshot: AgentWatchdogSnapshot,
	thresholds: AgentWatchdogThresholds,
): AgentWatchdogAction {
	const { silenceMs, stillRunning, hasRunningTools, hasText } = snapshot;

	if (silenceMs < thresholds.idleFinalizeMs) return "wait";
	if (hasRunningTools) return "wait";
	if (!hasText) return "wait";

	if (stillRunning) {
		if (silenceMs < thresholds.stalledExecutionMs) return "wait";
		return "finalize_stall";
	}

	return "finalize_inactivity";
}

/** watchdog 轮询间隔 */
export const AGENT_WATCHDOG_POLL_INTERVAL_MS = 3000;

export interface AgentWatchdogHandle {
	/** 幂等：已在运行时不会重复起定时器 */
	start: () => void;
	/** 幂等：未运行时调用无副作用。必须在所有收口路径 / 异常路径上调用 */
	clear: () => void;
}

/**
 * 创建 watchdog 计时器。
 *
 * @param probe 返回本轮判定所需快照；返回 null 表示「本轮跳过」
 *              （例如已经收口过、或流式消息还没建起来）
 * @param onFinalize 判定为需要收口时调用，source 用于日志与区分收口方式
 */
export function createAgentWatchdog(options: {
	thresholds: AgentWatchdogThresholds;
	probe: () => AgentWatchdogSnapshot | null;
	onFinalize: (action: "finalize_inactivity" | "finalize_stall") => void;
	intervalMs?: number;
}): AgentWatchdogHandle {
	const { thresholds, probe, onFinalize } = options;
	const intervalMs = options.intervalMs ?? AGENT_WATCHDOG_POLL_INTERVAL_MS;
	let timer: number | null = null;

	return {
		start() {
			if (timer !== null) return;
			timer = window.setInterval(() => {
				const snapshot = probe();
				if (!snapshot) return;
				const action = decideAgentWatchdogAction(snapshot, thresholds);
				if (action === "wait") return;
				onFinalize(action);
			}, intervalMs);
		},
		clear() {
			if (timer === null) return;
			clearInterval(timer);
			timer = null;
		},
	};
}
