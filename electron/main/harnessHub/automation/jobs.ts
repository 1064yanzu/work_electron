/**
 * 自动化任务模型 —— 任务定义的读写，以及「下次什么时候跑」的时间计算。
 *
 * ## 为什么不用 cron 表达式
 *
 * 真实诉求是「晚上额度空闲的时候把这些活跑了」。cron 能表达它，但代价是用户
 * 要在一个输入框里写 `0 2 * * *`，写错了也没有任何反馈——一个静默不触发的
 * 定时任务比没有定时任务更糟。这里改成结构化触发器 + 执行窗口：
 *
 *   每天 02:00                        → daily
 *   工作日 23:30                       → daily + weekdays
 *   每 30 分钟，但只在 01:00–06:00 之间 → interval + window
 *
 * 表达力略窄，但每一项都能在 UI 上直接选、能回显成人话、算得出下一次的准确时刻。
 * 换来的是零依赖和可预测——一个会自己算错时间的调度器是不可排查的。
 */
import { randomUUID } from "node:crypto";
import type { DbContext } from "../../db/client";

/** 触发方式。 */
export type JobTrigger =
	/** 只能手动跑 */
	| { type: "manual" }
	/** 指定时刻跑一次，跑完自动停用 */
	| { type: "once"; at: number }
	/** 每天/每周固定时刻。weekdays 为空表示每天；0 = 周日 */
	| { type: "daily"; time: string; weekdays: number[] }
	/** 每隔 N 分钟 */
	| { type: "interval"; minutes: number };

/** 执行窗口。到点但不在窗口内时推迟到窗口开启。允许跨零点（22:00 → 06:00）。 */
export interface JobWindow {
	start: string;
	end: string;
}

/** 错过触发时刻后的处理方式。 */
export type MisfirePolicy = "skip" | "runOnce";

export interface JobRetryPolicy {
	/**
	 * 错过触发时刻（应用没开 / 机器睡着）怎么办。
	 * 默认 skip —— 开机时一次性补跑一整周的积压任务是灾难，不是贴心。
	 */
	misfire: MisfirePolicy;
	/** 退避上限（毫秒）。指数退避涨到这里就不再涨 */
	backoffCapMs: number;
	/** 同一入口连续失败多少次后考虑换入口（failover 开启时生效） */
	failoverAfter: number;
}

export const DEFAULT_RETRY_POLICY: JobRetryPolicy = {
	misfire: "skip",
	backoffCapMs: 5 * 60_000,
	failoverAfter: 2,
};

/** 执行形态。 */
export type JobExecMode = "headless" | "pty";

/** 一个自动化任务。 */
export interface AutomationJob {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	targetHarness: string;
	execMode: JobExecMode;
	cwd: string | null;
	prompt: string;
	allowWrite: boolean;
	trigger: JobTrigger;
	window: JobWindow | null;
	maxAttempts: number;
	retryPolicy: JobRetryPolicy;
	failoverEnabled: boolean;
	timeoutMs: number | null;
	nextRunAt: number | null;
	lastRunAt: number | null;
	lastStatus: string | null;
	createdAt: number;
	updatedAt: number;
}

/** 保存任务时的入参（id 为空表示新建）。 */
export interface AutomationJobInput {
	id?: string | null;
	name: string;
	description?: string | null;
	enabled?: boolean;
	targetHarness: string;
	execMode?: JobExecMode;
	cwd?: string | null;
	prompt: string;
	allowWrite?: boolean;
	trigger: JobTrigger;
	window?: JobWindow | null;
	maxAttempts?: number;
	retryPolicy?: Partial<JobRetryPolicy>;
	failoverEnabled?: boolean;
	timeoutMs?: number | null;
}

// ============================================================
// 时间计算
// ============================================================

/** 解析 "HH:MM" → 当天零点起的分钟数；非法返回 null（**不猜**）。 */
export function parseClock(value: string | null | undefined): number | null {
	if (!value) return null;
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour > 23 || minute > 59) return null;
	return hour * 60 + minute;
}

/** 当天零点起的分钟数。 */
function minutesOfDay(at: number): number {
	const d = new Date(at);
	return d.getHours() * 60 + d.getMinutes();
}

/** 把某天的「零点起分钟数」还原成时间戳。 */
function atMinutes(base: number, minutes: number, dayOffset = 0): number {
	const d = new Date(base);
	d.setDate(d.getDate() + dayOffset);
	d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
	return d.getTime();
}

/** 时刻是否落在执行窗口内。窗口为空 = 不限制。 */
export function isWithinWindow(window: JobWindow | null, at: number): boolean {
	if (!window) return true;
	const start = parseClock(window.start);
	const end = parseClock(window.end);
	if (start === null || end === null) return true;
	const now = minutesOfDay(at);
	// 跨零点窗口（22:00 → 06:00）：落在 [start, 24:00) 或 [0, end) 都算在内
	if (start > end) return now >= start || now < end;
	return now >= start && now < end;
}

/**
 * 把一个候选时刻按执行窗口顺延。
 *
 * 语义是「不早于 candidate，且落在窗口内的最近时刻」。窗口没配就原样返回。
 */
export function alignToWindow(
	window: JobWindow | null,
	candidate: number,
): number {
	if (!window) return candidate;
	const start = parseClock(window.start);
	const end = parseClock(window.end);
	if (start === null || end === null) return candidate;
	if (isWithinWindow(window, candidate)) return candidate;
	// 不在窗口内：推到下一次窗口开启
	const todayStart = atMinutes(candidate, start);
	return todayStart > candidate ? todayStart : atMinutes(candidate, start, 1);
}

/**
 * 计算下一次触发时刻。
 *
 * @param from 从哪个时刻之后算起（通常是「现在」或上一次的触发时刻）
 * @returns null 表示不再自动触发（manual，或 once 已经过去了）
 */
export function computeNextRunAt(
	trigger: JobTrigger,
	window: JobWindow | null,
	from: number,
): number | null {
	switch (trigger.type) {
		case "manual":
			return null;

		case "once":
			// once 不做窗口对齐：用户指定了确切时刻，再被窗口推走就不是「一次性」了
			return trigger.at > from ? trigger.at : null;

		case "interval": {
			const minutes = Math.max(1, Math.round(trigger.minutes));
			return alignToWindow(window, from + minutes * 60_000);
		}

		case "daily": {
			const clock = parseClock(trigger.time);
			if (clock === null) return null;
			const weekdays = trigger.weekdays?.filter(
				(d) => Number.isInteger(d) && d >= 0 && d <= 6,
			);
			// 从今天起往后找 8 天，第一个「时刻晚于 from 且星期匹配」的即是
			for (let offset = 0; offset <= 7; offset++) {
				const candidate = atMinutes(from, clock, offset);
				if (candidate <= from) continue;
				if (weekdays?.length) {
					const day = new Date(candidate).getDay();
					if (!weekdays.includes(day)) continue;
				}
				return candidate;
			}
			return null;
		}

		default:
			return null;
	}
}

/** 把触发器渲染成一句人话（UI 与日志共用，避免两处各写各的）。 */
export function describeTrigger(
	trigger: JobTrigger,
	window: JobWindow | null,
): string {
	const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
	let base: string;
	switch (trigger.type) {
		case "manual":
			base = "仅手动触发";
			break;
		case "once":
			base = `${new Date(trigger.at).toLocaleString("zh-CN")} 执行一次`;
			break;
		case "daily":
			base = trigger.weekdays?.length
				? `每${trigger.weekdays.map((d) => WEEK[d] ?? "").join("、")} ${trigger.time}`
				: `每天 ${trigger.time}`;
			break;
		case "interval":
			base = `每 ${trigger.minutes} 分钟`;
			break;
		default:
			base = "未知触发方式";
	}
	if (window && parseClock(window.start) !== null) {
		base += `（仅 ${window.start}–${window.end} 之间）`;
	}
	return base;
}

// ============================================================
// 序列化
// ============================================================

function parseTrigger(raw: unknown): JobTrigger {
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		const type = (parsed as { type?: string })?.type;
		if (type === "once") {
			const at = Number((parsed as { at?: unknown }).at);
			if (Number.isFinite(at)) return { type: "once", at };
		}
		if (type === "daily") {
			const p = parsed as { time?: unknown; weekdays?: unknown };
			const time = String(p.time ?? "");
			if (parseClock(time) !== null) {
				return {
					type: "daily",
					time,
					weekdays: Array.isArray(p.weekdays)
						? p.weekdays.map(Number).filter((d) => d >= 0 && d <= 6)
						: [],
				};
			}
		}
		if (type === "interval") {
			const minutes = Number((parsed as { minutes?: unknown }).minutes);
			if (Number.isFinite(minutes) && minutes >= 1) {
				return { type: "interval", minutes: Math.round(minutes) };
			}
		}
	} catch {
		// 落到 manual
	}
	// 解析不出来一律降级为「仅手动」：一个含义不明的触发器绝不能被猜成
	// 「每分钟跑一次」，那会在无人值守时反复烧额度。
	return { type: "manual" };
}

function parseRetryPolicy(raw: unknown): JobRetryPolicy {
	try {
		const parsed = (
			typeof raw === "string" ? JSON.parse(raw) : (raw ?? {})
		) as Partial<JobRetryPolicy>;
		return {
			misfire: parsed.misfire === "runOnce" ? "runOnce" : "skip",
			backoffCapMs:
				Number.isFinite(parsed.backoffCapMs) && Number(parsed.backoffCapMs) > 0
					? Math.round(Number(parsed.backoffCapMs))
					: DEFAULT_RETRY_POLICY.backoffCapMs,
			failoverAfter:
				Number.isFinite(parsed.failoverAfter) &&
				Number(parsed.failoverAfter) > 0
					? Math.round(Number(parsed.failoverAfter))
					: DEFAULT_RETRY_POLICY.failoverAfter,
		};
	} catch {
		return { ...DEFAULT_RETRY_POLICY };
	}
}

function rowToJob(row: Record<string, unknown>): AutomationJob {
	const windowStart = (row.window_start as string) || "";
	const windowEnd = (row.window_end as string) || "";
	return {
		id: String(row.id ?? ""),
		name: String(row.name ?? ""),
		description: (row.description as string) ?? null,
		enabled: Number(row.enabled ?? 0) === 1,
		targetHarness: String(row.target_harness ?? ""),
		execMode: row.exec_mode === "pty" ? "pty" : "headless",
		cwd: (row.cwd as string) ?? null,
		prompt: String(row.prompt ?? ""),
		allowWrite: Number(row.allow_write ?? 0) === 1,
		trigger: parseTrigger(row.trigger_json),
		window:
			windowStart && windowEnd ? { start: windowStart, end: windowEnd } : null,
		maxAttempts: Number(row.max_attempts ?? 5) || 5,
		retryPolicy: parseRetryPolicy(row.retry_policy_json),
		failoverEnabled: Number(row.failover_enabled ?? 0) === 1,
		timeoutMs: row.timeout_ms ? Number(row.timeout_ms) : null,
		nextRunAt: row.next_run_at ? Number(row.next_run_at) : null,
		lastRunAt: row.last_run_at ? Number(row.last_run_at) : null,
		lastStatus: (row.last_status as string) ?? null,
		createdAt: Number(row.created_at ?? 0),
		updatedAt: Number(row.updated_at ?? 0),
	};
}

// ============================================================
// CRUD
// ============================================================

export async function listJobs(db: DbContext): Promise<AutomationJob[]> {
	const res = await db.client.execute(
		`SELECT * FROM harness_jobs ORDER BY enabled DESC, next_run_at IS NULL, next_run_at ASC, updated_at DESC`,
	);
	return res.rows.map((r) => rowToJob(r as Record<string, unknown>));
}

export async function getJob(
	db: DbContext,
	id: string,
): Promise<AutomationJob | null> {
	const res = await db.client.execute({
		sql: `SELECT * FROM harness_jobs WHERE id = ?`,
		args: [id],
	});
	const row = res.rows[0] as Record<string, unknown> | undefined;
	return row ? rowToJob(row) : null;
}

/** 到点该跑的任务。 */
export async function listDueJobs(
	db: DbContext,
	now: number,
): Promise<AutomationJob[]> {
	const res = await db.client.execute({
		sql: `SELECT * FROM harness_jobs
		      WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
		      ORDER BY next_run_at ASC`,
		args: [now],
	});
	return res.rows.map((r) => rowToJob(r as Record<string, unknown>));
}

/** 新建或更新一个任务，返回落库后的完整对象。 */
export async function saveJob(
	db: DbContext,
	input: AutomationJobInput,
): Promise<AutomationJob> {
	const now = Date.now();
	const id = input.id?.trim() || randomUUID();
	const existing = input.id ? await getJob(db, id) : null;

	const trigger = input.trigger ?? { type: "manual" };
	const window = input.window?.start && input.window?.end ? input.window : null;
	const retryPolicy: JobRetryPolicy = {
		...DEFAULT_RETRY_POLICY,
		...existing?.retryPolicy,
		...input.retryPolicy,
	};
	const enabled = input.enabled ?? existing?.enabled ?? true;

	// 触发器或窗口变了就重算下次时刻；否则沿用已有的，
	// 免得每次改个名字都把「今晚 02:00」推到明天。
	const triggerChanged =
		!existing ||
		JSON.stringify(existing.trigger) !== JSON.stringify(trigger) ||
		JSON.stringify(existing.window) !== JSON.stringify(window) ||
		existing.enabled !== enabled;
	const nextRunAt = !enabled
		? null
		: triggerChanged
			? computeNextRunAt(trigger, window, now)
			: existing.nextRunAt;

	await db.client.execute({
		sql: `INSERT INTO harness_jobs
		        (id, name, description, enabled, target_harness, exec_mode, cwd, prompt,
		         allow_write, trigger_json, window_start, window_end, max_attempts,
		         retry_policy_json, failover_enabled, timeout_ms, next_run_at,
		         last_run_at, last_status, created_at, updated_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		      ON CONFLICT(id) DO UPDATE SET
		        name = excluded.name,
		        description = excluded.description,
		        enabled = excluded.enabled,
		        target_harness = excluded.target_harness,
		        exec_mode = excluded.exec_mode,
		        cwd = excluded.cwd,
		        prompt = excluded.prompt,
		        allow_write = excluded.allow_write,
		        trigger_json = excluded.trigger_json,
		        window_start = excluded.window_start,
		        window_end = excluded.window_end,
		        max_attempts = excluded.max_attempts,
		        retry_policy_json = excluded.retry_policy_json,
		        failover_enabled = excluded.failover_enabled,
		        timeout_ms = excluded.timeout_ms,
		        next_run_at = excluded.next_run_at,
		        updated_at = excluded.updated_at`,
		args: [
			id,
			input.name.trim() || "未命名任务",
			input.description?.trim() || null,
			enabled ? 1 : 0,
			input.targetHarness,
			input.execMode === "pty" ? "pty" : "headless",
			input.cwd?.trim() || null,
			input.prompt,
			input.allowWrite ? 1 : 0,
			JSON.stringify(trigger),
			window?.start ?? null,
			window?.end ?? null,
			Math.max(1, Math.min(50, Math.round(input.maxAttempts ?? 5))),
			JSON.stringify(retryPolicy),
			input.failoverEnabled ? 1 : 0,
			input.timeoutMs && input.timeoutMs > 0
				? Math.round(input.timeoutMs)
				: null,
			nextRunAt,
			existing?.lastRunAt ?? null,
			existing?.lastStatus ?? null,
			existing?.createdAt ?? now,
			now,
		],
	});

	const saved = await getJob(db, id);
	if (!saved) throw new Error("保存任务后读取失败");
	return saved;
}

export async function deleteJob(db: DbContext, id: string): Promise<void> {
	await db.client.execute({
		sql: `DELETE FROM harness_jobs WHERE id = ?`,
		args: [id],
	});
}

/** 启用/停用。停用时清掉 next_run_at，启用时重算。 */
export async function setJobEnabled(
	db: DbContext,
	id: string,
	enabled: boolean,
): Promise<AutomationJob | null> {
	const job = await getJob(db, id);
	if (!job) return null;
	const now = Date.now();
	const nextRunAt = enabled
		? computeNextRunAt(job.trigger, job.window, now)
		: null;
	await db.client.execute({
		sql: `UPDATE harness_jobs SET enabled = ?, next_run_at = ?, updated_at = ? WHERE id = ?`,
		args: [enabled ? 1 : 0, nextRunAt, now, id],
	});
	return await getJob(db, id);
}

/** 一次运行结束后推进任务状态（记录结果并排下一次）。 */
export async function advanceJobAfterRun(
	db: DbContext,
	job: AutomationJob,
	status: string,
	finishedAt: number,
): Promise<void> {
	// once 类型跑过就不再自动触发，同时自动停用——留着一个永远不会再触发的
	// 启用态任务，只会让列表越来越难看懂。
	const isOnce = job.trigger.type === "once";
	const nextRunAt = isOnce
		? null
		: computeNextRunAt(job.trigger, job.window, finishedAt);
	await db.client.execute({
		sql: `UPDATE harness_jobs
		      SET last_run_at = ?, last_status = ?, next_run_at = ?, enabled = ?, updated_at = ?
		      WHERE id = ?`,
		args: [
			finishedAt,
			status,
			nextRunAt,
			isOnce ? 0 : job.enabled ? 1 : 0,
			finishedAt,
			job.id,
		],
	});
}

/** 只更新下一次触发时刻（misfire 跳过、窗口顺延等场景）。 */
export async function updateNextRunAt(
	db: DbContext,
	id: string,
	nextRunAt: number | null,
): Promise<void> {
	await db.client.execute({
		sql: `UPDATE harness_jobs SET next_run_at = ?, updated_at = ? WHERE id = ?`,
		args: [nextRunAt, Date.now(), id],
	});
}
