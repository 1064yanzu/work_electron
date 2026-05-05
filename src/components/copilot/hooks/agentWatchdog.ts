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
