/**
 * AI Harness 自动化的前端 API 封装。
 *
 * 后端契约见 `docs/api/harness-hub.md`；实现在
 * `electron/main/ipc/handlers/harnessAutomation.ts`。
 */
import type {
	HarnessFailureKind,
	HarnessJobAttemptRow,
	HarnessJobInputRow,
	HarnessJobRow,
	HarnessJobRunRow,
	HarnessJobRunStatus,
	HarnessJobTriggerRow,
	HarnessJobWindowRow,
	HarnessRuntimeRow,
	HarnessRuntimeState,
} from "../../../electron/shared/ipc-schema";
import { safeInvoke } from "../tauriBridge";

export type {
	HarnessFailureKind,
	HarnessJobAttemptRow,
	HarnessJobInputRow,
	HarnessJobRow,
	HarnessJobRunRow,
	HarnessJobRunStatus,
	HarnessJobTriggerRow,
	HarnessJobWindowRow,
	HarnessRuntimeRow,
	HarnessRuntimeState,
};

// ==================
// 运行态监测
// ==================

/** 当前所有执行体（含刚结束的，保留 5 分钟）。 */
export async function listHarnessRuntimes(): Promise<HarnessRuntimeRow[]> {
	const res = await safeInvoke<{ runtimes: HarnessRuntimeRow[] }>(
		"harness_runtime_list",
		{},
	);
	return res.runtimes ?? [];
}

/** 中止一个执行体。 */
export async function abortHarnessRuntime(runtimeId: string): Promise<boolean> {
	const res = await safeInvoke<{ ok: boolean }>("harness_runtime_abort", {
		runtime_id: runtimeId,
	});
	return res.ok === true;
}

// ==================
// 任务
// ==================

export async function listAutomationJobs(): Promise<HarnessJobRow[]> {
	const res = await safeInvoke<{ jobs: HarnessJobRow[] }>(
		"harness_job_list",
		{},
	);
	return res.jobs ?? [];
}

export async function saveAutomationJob(
	input: HarnessJobInputRow,
): Promise<HarnessJobRow> {
	const res = await safeInvoke<{ job: HarnessJobRow }>(
		"harness_job_save",
		input,
	);
	return res.job;
}

export async function deleteAutomationJob(jobId: string): Promise<boolean> {
	const res = await safeInvoke<{ ok: boolean }>("harness_job_delete", {
		job_id: jobId,
	});
	return res.ok === true;
}

export async function setAutomationJobEnabled(
	jobId: string,
	enabled: boolean,
): Promise<HarnessJobRow | null> {
	const res = await safeInvoke<{ job: HarnessJobRow | null }>(
		"harness_job_set_enabled",
		{ job_id: jobId, enabled },
	);
	return res.job ?? null;
}

/** 立即跑一次。失败时 `error` 会说明原因（如「已经在运行中了」）。 */
export async function runAutomationJobNow(
	jobId: string,
): Promise<{ run_id: string | null; error: string | null }> {
	return await safeInvoke("harness_job_run_now", { job_id: jobId });
}

export async function cancelAutomationRun(runId: string): Promise<boolean> {
	const res = await safeInvoke<{ ok: boolean }>("harness_job_cancel", {
		run_id: runId,
	});
	return res.ok === true;
}

// ==================
// 运行记录
// ==================

export async function listAutomationRuns(input: {
	job_id?: string | null;
	limit?: number;
}): Promise<HarnessJobRunRow[]> {
	const res = await safeInvoke<{ runs: HarnessJobRunRow[] }>(
		"harness_job_runs_list",
		input,
	);
	return res.runs ?? [];
}

/** 单次运行详情，含每次尝试的失败原因与等待时长。 */
export async function getAutomationRun(runId: string): Promise<{
	run: HarnessJobRunRow | null;
	attempts: HarnessJobAttemptRow[];
}> {
	return await safeInvoke("harness_job_run_get", { run_id: runId });
}
