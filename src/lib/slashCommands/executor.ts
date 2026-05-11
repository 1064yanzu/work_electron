/**
 * Claude Code 风格斜杠命令 —— Executor（T2.1）。
 *
 * 职责：
 * 1. 作为整个命令系统的**唯一**入口：`executeSlashCommand(id, option?)`；
 * 2. availability 短路：`hidden` / `disabled` 时**不产生任何副作用**（Property 5）；
 * 3. 触发时锁定 `submittedAt.sessionId`，即使中途用户切换会话，副作用仍打回触发时会话；
 * 4. 并发守卫：同一命令 id 不允许同时飞多个 execute（通过 `inFlightIds`）；
 * 5. 30s 超时：`Promise.race([inner, timeout(30_000)])` 保证不挂死；
 * 6. `try/catch` 兜底：任何同步/异步异常都走 `toast.error(…)` + `console.error`，
 *    **不冒泡到 React 渲染树**（Property 9.2.R14.9）；
 * 7. 所有面板切换 / 状态切换类命令由各自 execute 决定 toast 策略，本执行器不代劳。
 *
 * 非目标：
 * - 不处理 `kind==='submenu'` 的子菜单展开（由 UI 层负责），只接受已选中的 option；
 * - 不处理 loading 阶段的 Toast（本职责下放给 `builtin/` 中需要 loading 的命令）；
 *   对于面板切换类等**不需要 loading 的命令**，executor 只看 `ExecuteOutcome`。
 */

import { commandRegistry } from "./registry";
import { buildCommandContext } from "./context";
import { useSlashCommandContext } from "./reactContext";
import { SLASH_MESSAGES } from "./messages";
import { notify } from "./toast";
import type {
	CommandContext,
	ExecuteOutcome,
	SlashCommandSubOption,
} from "./types";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 单次命令执行的最大耗时（ms）。 */
const EXECUTE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// 并发守卫：同一命令 id 同时只允许一次 execute 在飞
// ---------------------------------------------------------------------------

const inFlightIds: Set<string> = new Set();

// ---------------------------------------------------------------------------
// 最近使用 LRU：记录最近 8 个被执行成功的命令 id；空 filter 时由 UI 上浮
// ---------------------------------------------------------------------------

/** LRU 容量。 */
const RECENT_LIMIT = 8;
/** 最新在前，旧的在后。 */
const recentCommandIds: string[] = [];

function trackRecentCommand(id: string): void {
	const existing = recentCommandIds.indexOf(id);
	if (existing >= 0) recentCommandIds.splice(existing, 1);
	recentCommandIds.unshift(id);
	if (recentCommandIds.length > RECENT_LIMIT) {
		recentCommandIds.length = RECENT_LIMIT;
	}
}

/**
 * 取最近使用的命令 id 列表（最新在前），副本返回，调用方可安全读写。
 *
 * UI 在 filter 为空时可以把 list 里的 id 按此顺序前置展示。
 */
export function getRecentCommandIds(): string[] {
	return recentCommandIds.slice();
}

// ---------------------------------------------------------------------------
// 辅助：格式化异常
// ---------------------------------------------------------------------------

function formatError(err: unknown): string {
	if (err instanceof Error) return err.message;
	try {
		return String(err);
	} catch {
		return "未知错误";
	}
}

// ---------------------------------------------------------------------------
// 辅助：30 秒超时包装
// ---------------------------------------------------------------------------

/**
 * 把任意 Promise 与一个计时器赛跑；任一侧先完成即返回结果。
 *
 * 注意：这里**不**提供 abort 能力，原 inner Promise 在超时后仍会继续运行直到它自己
 * 结束；executor 只保证"用户看到的结果不再被挂住"。
 */
function withTimeout<T>(inner: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`命令执行超时（>${Math.floor(timeoutMs / 1000)} 秒）`));
		}, timeoutMs);

		inner.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(reason) => {
				clearTimeout(timer);
				reject(reason);
			},
		);
	});
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 执行一条斜杠命令。
 *
 * @param id    命令 id（不含前导 `/`）。
 * @param option 子菜单选中项；`kind="action"` 命令传 `undefined`。
 * @param overrides 上下文覆写（主要供测试与 UI 桥接）。
 * @returns 结构化 {@link ExecuteOutcome}；即便失败也**不会**抛错，由本函数负责所有反馈。
 */
export async function executeSlashCommand(
	id: string,
	option?: SlashCommandSubOption,
	overrides?: { invokeSelectModel?: (modelId: string) => void },
): Promise<ExecuteOutcome> {
	// 1) 基础校验 —— 命令存在
	const def = commandRegistry.byId(id);
	if (def === null) {
		console.error(`[slashCommands] 未知命令 id: ${id}`);
		notify.error(SLASH_MESSAGES.toast.generic.failed(`未知命令 ${id}`));
		return { kind: "failed", message: `未知命令 ${id}` };
	}

	// 2) 装配 ctx 并做 availability 短路
	const ctx: CommandContext = buildCommandContext(overrides);

	let availability: ReturnType<typeof def.availability>;
	try {
		availability = def.availability(ctx);
	} catch (err) {
		console.error(
			`[slashCommands] 命令 "${id}" 的 availability() 抛出异常，按 disabled 处理。`,
			err,
		);
		return {
			kind: "failed",
			message: formatError(err),
			cause: err,
		};
	}

	if (availability.state !== "available") {
		// hidden/disabled：无声失败，不产生任何副作用
		return {
			kind: "failed",
			message:
				availability.state === "disabled"
					? availability.reason
					: `命令 ${id} 当前不可用`,
		};
	}

	// 3) 并发守卫
	if (inFlightIds.has(id)) {
		notify.info(`命令 /${id} 正在执行中，请稍候…`);
		return { kind: "failed", message: `命令 /${id} 正在执行中` };
	}

	// 4) 闭包锁定触发时会话（Property 19）
	const submittedAt = {
		sessionId: ctx.activeSession?.id ?? null,
	} as const;

	inFlightIds.add(id);
	try {
		if (typeof def.execute !== "function") {
			// submenu 命令必须带 execute；没有就把当作实现缺陷曝光
			throw new Error(`命令 "${id}" 未实现 execute`);
		}

		// 5) 运行（带 30s 超时）
		const outcome = await withTimeout(
			Promise.resolve().then(() => def.execute!(ctx, option)),
			EXECUTE_TIMEOUT_MS,
		);

		// 6) 成功态反馈（仅当命令显式返回 toast 时才展示）
		if (outcome.kind === "ok") {
			trackRecentCommand(id);
			if (outcome.toast) {
				if (outcome.toast.type === "success") {
					notify.success(outcome.toast.message);
				} else {
					notify.info(outcome.toast.message);
				}
			}
		}

		// 7) 失败态反馈
		if (outcome.kind === "failed") {
			console.error(
				`[slashCommands] 命令 /${id} 执行失败（触发 session=${submittedAt.sessionId ?? "null"}）:`,
				outcome.cause ?? outcome.message,
			);
			if (outcome.retryable) {
				notify.errorWithRetry(outcome.message, async () => {
					await executeSlashCommand(id, option, overrides);
				});
			} else {
				notify.error(outcome.message);
			}
		}

		return outcome;
	} catch (err) {
		const message = formatError(err);
		console.error(
			`[slashCommands] 命令 /${id} 抛出未受控异常（触发 session=${submittedAt.sessionId ?? "null"}）:`,
			err,
		);
		notify.error(SLASH_MESSAGES.toast.generic.failed(message));
		return {
			kind: "failed",
			message,
			cause: err,
		};
	} finally {
		inFlightIds.delete(id);
	}
}

// ---------------------------------------------------------------------------
// React 便捷 Hook：把 ChatInput 的 `onModelSelect` 自动桥接到 executor
// ---------------------------------------------------------------------------

/**
 * 返回一个已绑定当前 UI 桥接值的 `executeSlashCommand` 变体；
 * 用法：
 * ```tsx
 * const run = useExecuteSlashCommand();
 * run("compact");
 * ```
 *
 * 注意：不要把本 Hook 的返回值放进 `useEffect` 依赖数组里，因为它每次渲染都是新
 * 引用；真正需要追踪的变量是 `invokeSelectModel`，调用方自行处理。
 */
export function useExecuteSlashCommand() {
	const bridge = useSlashCommandContext();
	return (id: string, option?: SlashCommandSubOption) =>
		executeSlashCommand(id, option, {
			invokeSelectModel: bridge.invokeSelectModel,
		});
}

// ---------------------------------------------------------------------------
// 测试专用
// ---------------------------------------------------------------------------

/** @internal 仅供测试重置 inFlight 状态。 */
export function __resetExecutorForTests(): void {
	inFlightIds.clear();
	recentCommandIds.length = 0;
}
