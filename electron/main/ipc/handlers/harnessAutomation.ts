/**
 * AI Harness 自动化的 IPC Handlers。
 *
 * 三组能力：
 * - **运行态监测**：现在有哪些 AI 在跑、各自什么状态、能不能中止
 * - **任务**：定时任务的增删改查、立即运行、取消
 * - **运行记录**：每次运行与每次尝试的明细（失败类别、证据原文、等待时长）
 *
 * 事件推送：`harness-runtime-changed`（执行体状态变化，节流 1s）、
 * `harness-job-run-changed`（运行状态变化）、`harness-job-alert`（需人工介入）。
 *
 * 契约见 `docs/api/harness-hub.md`。
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type {
	HarnessJobAttemptRow,
	HarnessJobRow,
	HarnessJobRunRow,
	HarnessRuntimeRow,
	IPCSchema,
} from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	deleteJob,
	describeTrigger,
	getJob,
	listJobs,
	saveJob,
	setJobEnabled,
	type AutomationJob,
} from "../../harnessHub/automation/jobs";
import {
	automationRunner,
	getRun,
	listAttempts,
	listRuns,
	type JobAttempt,
	type JobRun,
} from "../../harnessHub/automation/runner";
import { automationScheduler } from "../../harnessHub/automation/scheduler";
import {
	harnessRuntimeMonitor,
	type RuntimeEntry,
} from "../../harnessHub/automation/runtimeMonitor";
import { createLogger } from "../../logging/logger";
import { sendToLiveWebContents } from "../../utils/safeWebContentsSend";

const logger = createLogger();

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

// ============================================================
// 行映射
// ============================================================

function toRuntimeRow(entry: RuntimeEntry): HarnessRuntimeRow {
	return {
		id: entry.id,
		kind: entry.kind,
		harness: entry.harness,
		label: entry.label,
		cwd: entry.cwd,
		state: entry.state,
		failure: entry.failure
			? {
					kind: entry.failure.kind,
					retryable: entry.failure.retryable,
					evidence: entry.failure.evidence,
					http_status: entry.failure.httpStatus,
					suggested_delay_ms: entry.failure.suggestedDelayMs,
				}
			: null,
		job_run_id: entry.jobRunId,
		pty_id: entry.ptyId,
		bridge_call_id: entry.bridgeCallId,
		started_at: entry.startedAt,
		last_output_at: entry.lastOutputAt,
		updated_at: entry.updatedAt,
		exited_at: entry.exitedAt,
		exit_code: entry.exitCode,
		tail: entry.tail,
	};
}

function toJobRow(job: AutomationJob): HarnessJobRow {
	return {
		id: job.id,
		name: job.name,
		description: job.description,
		enabled: job.enabled,
		target_harness: job.targetHarness,
		exec_mode: job.execMode,
		cwd: job.cwd,
		prompt: job.prompt,
		allow_write: job.allowWrite,
		trigger: job.trigger,
		window: job.window,
		max_attempts: job.maxAttempts,
		retry_policy: {
			misfire: job.retryPolicy.misfire,
			backoff_cap_ms: job.retryPolicy.backoffCapMs,
			failover_after: job.retryPolicy.failoverAfter,
		},
		failover_enabled: job.failoverEnabled,
		timeout_ms: job.timeoutMs,
		next_run_at: job.nextRunAt,
		last_run_at: job.lastRunAt,
		last_status: job.lastStatus,
		created_at: job.createdAt,
		updated_at: job.updatedAt,
		// 触发方式的人话在主进程渲染一次，前后端不会出现两套措辞
		trigger_label: describeTrigger(job.trigger, job.window),
	};
}

function toRunRow(run: JobRun): HarnessJobRunRow {
	return {
		id: run.id,
		job_id: run.jobId,
		status: run.status,
		trigger: run.trigger,
		attempt_count: run.attemptCount,
		last_failure_kind:
			(run.lastFailureKind as HarnessJobRunRow["last_failure_kind"]) ?? null,
		last_error: run.lastError,
		next_attempt_at: run.nextAttemptAt,
		result_text: run.resultText,
		started_at: run.startedAt,
		finished_at: run.finishedAt,
	};
}

function toAttemptRow(attempt: JobAttempt): HarnessJobAttemptRow {
	return {
		id: attempt.id,
		run_id: attempt.runId,
		seq: attempt.seq,
		harness: attempt.harness,
		mode: attempt.mode,
		exit_code: attempt.exitCode,
		failure_kind:
			(attempt.failureKind as HarnessJobAttemptRow["failure_kind"]) ?? null,
		evidence: attempt.evidence,
		resumed_from: attempt.resumedFrom,
		bridge_call_id: attempt.bridgeCallId,
		pty_id: attempt.ptyId,
		wait_ms: attempt.waitMs,
		output: attempt.output,
		started_at: attempt.startedAt,
		finished_at: attempt.finishedAt,
	};
}

// ============================================================
// Handlers
// ============================================================

export function createHarnessAutomationHandlers(
	db: DbContext,
	getMainWindow: () => BrowserWindow | null,
) {
	// 事件转发：监测层与执行器只管产出变化，往哪推是这一层的事
	harnessRuntimeMonitor.onChange((entries) => {
		try {
			sendToLiveWebContents(getMainWindow(), "harness-runtime-changed", {
				runtimes: entries.map(toRuntimeRow),
			});
		} catch {
			// 窗口已销毁
		}
	});
	automationRunner.onRunChange((run) => {
		try {
			sendToLiveWebContents(getMainWindow(), "harness-job-run-changed", {
				run: toRunRow(run),
			});
		} catch {
			// 窗口已销毁
		}
	});

	const harness_runtime_list: Handler<"harness_runtime_list"> = async () => ({
		runtimes: harnessRuntimeMonitor.list().map(toRuntimeRow),
	});

	const harness_runtime_abort: Handler<"harness_runtime_abort"> = async (
		_event,
		input,
	) => ({
		ok: harnessRuntimeMonitor.abort(input.runtime_id),
	});

	const harness_job_list: Handler<"harness_job_list"> = async () => ({
		jobs: (await listJobs(db)).map(toJobRow),
	});

	const harness_job_save: Handler<"harness_job_save"> = async (
		_event,
		input,
	) => {
		const job = await saveJob(db, {
			id: input.id ?? null,
			name: input.name,
			description: input.description ?? null,
			enabled: input.enabled,
			targetHarness: input.target_harness,
			execMode: input.exec_mode,
			cwd: input.cwd ?? null,
			prompt: input.prompt,
			allowWrite: input.allow_write,
			trigger: input.trigger,
			window: input.window ?? null,
			maxAttempts: input.max_attempts,
			retryPolicy: input.retry_policy
				? {
						misfire: input.retry_policy.misfire,
						backoffCapMs: input.retry_policy.backoff_cap_ms,
						failoverAfter: input.retry_policy.failover_after,
					}
				: undefined,
			failoverEnabled: input.failover_enabled,
			timeoutMs: input.timeout_ms ?? null,
		});
		return { job: toJobRow(job) };
	};

	const harness_job_delete: Handler<"harness_job_delete"> = async (
		_event,
		input,
	) => {
		// 正在跑的先停掉：任务定义都没了，还留一个子进程在改文件是很糟的事
		for (const run of await listRuns(db, { jobId: input.job_id, limit: 20 })) {
			if (automationRunner.isActive(run.id)) automationRunner.cancel(run.id);
		}
		await deleteJob(db, input.job_id);
		return { ok: true };
	};

	const harness_job_set_enabled: Handler<"harness_job_set_enabled"> = async (
		_event,
		input,
	) => {
		const job = await setJobEnabled(db, input.job_id, input.enabled);
		return { job: job ? toJobRow(job) : null };
	};

	const harness_job_run_now: Handler<"harness_job_run_now"> = async (
		_event,
		input,
	) => {
		const job = await getJob(db, input.job_id);
		if (!job) return { run_id: null, error: "任务不存在" };
		if (automationRunner.hasActiveJob(job.id)) {
			return { run_id: null, error: "这个任务已经在运行中了" };
		}
		const runId = await automationScheduler.runNow(job);
		if (!runId) {
			// runNow 只在三种情况下返回 null：调度器没起来、这个任务已在跑、
			// 并发位满了。前两种在上面已经排掉，剩下的就是并发。
			return {
				run_id: null,
				error: "同时运行的任务已达上限，等前面的跑完再试",
			};
		}
		logger.info({ msg: "手动触发自动化任务", jobId: job.id, runId });
		return { run_id: runId, error: null };
	};

	const harness_job_cancel: Handler<"harness_job_cancel"> = async (
		_event,
		input,
	) => ({
		ok: automationRunner.cancel(input.run_id),
	});

	const harness_job_runs_list: Handler<"harness_job_runs_list"> = async (
		_event,
		input,
	) => ({
		runs: (
			await listRuns(db, { jobId: input.job_id ?? null, limit: input.limit })
		).map(toRunRow),
	});

	const harness_job_run_get: Handler<"harness_job_run_get"> = async (
		_event,
		input,
	) => {
		const run = await getRun(db, input.run_id);
		const attempts = run ? await listAttempts(db, input.run_id) : [];
		return {
			run: run ? toRunRow(run) : null,
			attempts: attempts.map(toAttemptRow),
		};
	};

	return {
		harness_runtime_list,
		harness_runtime_abort,
		harness_job_list,
		harness_job_save,
		harness_job_delete,
		harness_job_set_enabled,
		harness_job_run_now,
		harness_job_cancel,
		harness_job_runs_list,
		harness_job_run_get,
	};
}

/** 启动调度器（app-lifecycle 在 idle 阶段调用）。 */
export async function startHarnessAutomation(
	db: DbContext,
	getMainWindow: () => BrowserWindow | null,
): Promise<void> {
	await automationScheduler.start(db, getMainWindow);
}

/** 停止调度器与全部运行（应用退出时调用）。 */
export function stopHarnessAutomation(): void {
	automationScheduler.stop();
	harnessRuntimeMonitor.dispose();
}
