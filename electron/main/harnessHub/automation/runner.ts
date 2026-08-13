/**
 * 执行 + 重试守护 —— 自动化的核心：把一个任务真正跑起来，跑挂了自己接上去继续。
 *
 * ## 一次 run 里发生什么
 *
 * ```
 * attempt 1  →  分类结果
 *               ├─ 没有错误信号            → run 结束（succeeded）
 *               ├─ 可重试（429 / 5xx / 断连 / 卡死）→ 按类别等待，attempt 2 继续
 *               └─ 不可重试（鉴权 / 余额 / 参数错）  → run 停在 blocked，等人来看
 * ```
 *
 * ## 两条必须守住的原则
 *
 * **一、重试是续跑，不是重来。** 上游断在第 40 分钟，重跑一遍等于把前 40 分钟的
 * 工作和额度一起扔掉，而且下一次大概率还是断在同一个地方——「直到做完」永远
 * 做不完。所以重试前先找这次 attempt 落下的原生会话 id，用 `claude --resume`
 * 接回原会话；找不到才退回重发指令，并在 attempt 记录里如实标明是哪一种。
 *
 * **二、不宣称任务完成。** 这里判定的是「本轮跑完没有出现可识别的错误信号」，
 * 不是「活干完了」。run 的 succeeded 状态、UI 文案、通知措辞都必须是前者。
 * 想知道活到底干成什么样，用户得自己看输出——我们不替 agent 打包票。
 */
import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type { DbContext } from "../../db/client";
import { createLogger } from "../../logging/logger";
import { canBridgeCli, runBridgeCall } from "../bridge";
import { launchHarnessWithHandoff, closeHarnessPty } from "../ptyLauncher";
import { getQuotaState } from "../quota";
import { buildResumeCommand, supportsNativeResume } from "../resume";
import { resolveRoute } from "../router";
import { loadHarnessHubSettings } from "../settings";
import type { HarnessKind } from "../types";
import {
	classifyFailure,
	describeFailureKind,
	type FailureSignal,
} from "./errors";
import type { AutomationJob } from "./jobs";
import { advanceJobAfterRun } from "./jobs";
import { harnessRuntimeMonitor } from "./runtimeMonitor";
import { sendToLiveWebContents } from "../../utils/safeWebContentsSend";

const logger = createLogger();

/** 运行状态。 */
export type JobRunStatus =
	| "queued"
	| "running"
	/** 正在退避 / 等限额恢复 */
	| "waiting"
	/** 本轮无错误结束 —— 注意不等于「任务完成」 */
	| "succeeded"
	/** 重试预算用尽仍在失败 */
	| "failed"
	/** 遇到重试无意义的失败，等人处理 */
	| "blocked"
	| "cancelled";

export interface JobRun {
	id: string;
	jobId: string;
	status: JobRunStatus;
	trigger: string;
	attemptCount: number;
	lastFailureKind: string | null;
	lastError: string | null;
	nextAttemptAt: number | null;
	resultText: string | null;
	startedAt: number;
	finishedAt: number | null;
}

export interface JobAttempt {
	id: string;
	runId: string;
	seq: number;
	harness: string;
	mode: string;
	exitCode: number | null;
	failureKind: string | null;
	evidence: string | null;
	resumedFrom: string | null;
	bridgeCallId: string | null;
	ptyId: string | null;
	waitMs: number | null;
	output: string | null;
	startedAt: number;
	finishedAt: number | null;
}

/** pty 模式的默认超时：交互式 agent 干一件正经事可能要很久。 */
const DEFAULT_PTY_TIMEOUT_MS = 60 * 60_000;
/** pty 启动后等它「开始干活」的宽限期。这段时间内还是 idle 不算跑完。 */
const PTY_WARMUP_MS = 30_000;
/** 等待 pty 状态变化的轮询间隔。 */
const PTY_POLL_MS = 2_000;
/** 限额等待的上限：等再久也该让用户看一眼了。 */
const MAX_QUOTA_WAIT_MS = 4 * 3_600_000;
/** 落库的输出上限。 */
const MAX_OUTPUT_CHARS = 100_000;

type RunChangeListener = (run: JobRun) => void;

interface ActiveRun {
	runId: string;
	job: AutomationJob;
	cancelled: boolean;
	/** 唤醒正在退避等待的循环 */
	wake: (() => void) | null;
	/** 中止当前正在执行的 attempt */
	abortAttempt: (() => void) | null;
}

/**
 * 自动化执行器（单例）。
 */
class AutomationRunner {
	private active = new Map<string, ActiveRun>();
	private listeners = new Set<RunChangeListener>();
	private getMainWindow: () => BrowserWindow | null = () => null;

	setWindowGetter(getter: () => BrowserWindow | null): void {
		this.getMainWindow = getter;
	}

	onRunChange(listener: RunChangeListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** 当前正在跑的 run 数（调度器据此控制并发）。 */
	activeCount(): number {
		return this.active.size;
	}

	isActive(runId: string): boolean {
		return this.active.has(runId);
	}

	/** 某个任务是否已有在跑的 run（同一任务不并发跑两遍）。 */
	hasActiveJob(jobId: string): boolean {
		for (const run of this.active.values()) {
			if (run.job.id === jobId) return true;
		}
		return false;
	}

	/**
	 * 发起一次运行。立即返回 runId，执行在后台继续。
	 */
	async startRun(
		db: DbContext,
		job: AutomationJob,
		trigger: string,
	): Promise<string> {
		const runId = randomUUID();
		const now = Date.now();
		await db.client.execute({
			sql: `INSERT INTO harness_job_runs
			        (id, job_id, status, trigger_source, attempt_count, last_failure_kind,
			         last_error, next_attempt_at, result_text, started_at, finished_at)
			      VALUES (?, ?, 'running', ?, 0, NULL, NULL, NULL, NULL, ?, NULL)`,
			args: [runId, job.id, trigger, now],
		});

		const entry: ActiveRun = {
			runId,
			job,
			cancelled: false,
			wake: null,
			abortAttempt: null,
		};
		this.active.set(runId, entry);
		await this.emit(db, runId);

		// 后台跑，不阻塞调用方（调度器 tick / IPC handler 都不该等在这里）
		void this.executeRun(db, entry).catch((error) => {
			logger.error({
				msg: "自动化运行异常终止",
				runId,
				jobId: job.id,
				error: error instanceof Error ? error.message : String(error),
			});
		});

		return runId;
	}

	/** 取消一次运行。 */
	cancel(runId: string): boolean {
		const entry = this.active.get(runId);
		if (!entry) return false;
		entry.cancelled = true;
		entry.abortAttempt?.();
		entry.wake?.();
		return true;
	}

	/** 取消全部（应用退出时）。 */
	cancelAll(): void {
		for (const runId of [...this.active.keys()]) {
			this.cancel(runId);
		}
	}

	// ---------- 执行循环 ----------

	private async executeRun(db: DbContext, entry: ActiveRun): Promise<void> {
		const { job, runId } = entry;
		let harness = job.targetHarness;
		let consecutiveFailures = 0;
		/** 上一次 attempt 结束时可续接的原生会话 id */
		let resumeId: string | null = null;
		let lastOutput = "";
		let finalStatus: JobRunStatus = "failed";
		let lastFailure: FailureSignal | null = null;

		try {
			for (let seq = 1; seq <= job.maxAttempts; seq++) {
				if (entry.cancelled) {
					finalStatus = "cancelled";
					break;
				}

				await this.updateRun(db, runId, {
					status: "running",
					attemptCount: seq,
					nextAttemptAt: null,
				});

				const attempt = await this.runAttempt(db, entry, {
					seq,
					harness,
					resumeId,
				});
				lastOutput = attempt.output || lastOutput;
				lastFailure = attempt.failure;
				resumeId = attempt.sessionExternalId ?? resumeId;

				// —— 没有错误信号：本轮到此结束 ——
				if (!attempt.failure) {
					finalStatus = entry.cancelled ? "cancelled" : "succeeded";
					break;
				}

				// —— 重试没有意义的失败：停下来等人 ——
				if (!attempt.failure.retryable) {
					finalStatus = "blocked";
					break;
				}

				if (entry.cancelled) {
					finalStatus = "cancelled";
					break;
				}

				// —— 预算用尽 ——
				if (seq >= job.maxAttempts) {
					finalStatus = "failed";
					break;
				}

				consecutiveFailures++;

				// —— 换入口 ——
				if (
					job.failoverEnabled &&
					consecutiveFailures >= job.retryPolicy.failoverAfter
				) {
					const next = await this.pickFailoverHarness(db, harness);
					if (next) {
						logger.info({
							msg: "自动化换入口继续",
							runId,
							from: harness,
							to: next,
							reason: attempt.failure.kind,
						});
						harness = next;
						consecutiveFailures = 0;
						// 换了入口，原会话 id 对新入口没有意义
						resumeId = null;
					}
				}

				// —— 等待 ——
				const waitMs = await this.computeWait(
					db,
					harness,
					attempt.failure,
					seq,
					job.retryPolicy.backoffCapMs,
				);
				await this.recordAttemptWait(db, attempt.attemptId, waitMs);
				await this.updateRun(db, runId, {
					status: "waiting",
					nextAttemptAt: Date.now() + waitMs,
					lastFailureKind: attempt.failure.kind,
					lastError: attempt.failure.evidence,
				});
				await this.sleep(entry, waitMs);
			}
		} finally {
			const finishedAt = Date.now();
			await this.updateRun(db, runId, {
				status: finalStatus,
				finishedAt,
				resultText: lastOutput.slice(0, MAX_OUTPUT_CHARS) || null,
				lastFailureKind: lastFailure?.kind ?? null,
				lastError: lastFailure?.evidence ?? null,
				nextAttemptAt: null,
			});
			await advanceJobAfterRun(db, job, finalStatus, finishedAt).catch(
				() => undefined,
			);
			this.active.delete(runId);
			await this.emit(db, runId);
			this.notifyIfNeeded(db, job, finalStatus, lastFailure).catch(
				() => undefined,
			);
		}
	}

	// ---------- 单次尝试 ----------

	private async runAttempt(
		db: DbContext,
		entry: ActiveRun,
		context: { seq: number; harness: string; resumeId: string | null },
	): Promise<{
		attemptId: string;
		failure: FailureSignal | null;
		output: string;
		sessionExternalId: string | null;
	}> {
		const { job, runId } = entry;
		const { seq, harness, resumeId } = context;
		const attemptId = randomUUID();
		const startedAt = Date.now();
		const mode = job.execMode;

		await db.client.execute({
			sql: `INSERT INTO harness_job_attempts
			        (id, run_id, seq, harness, mode, exit_code, failure_kind, evidence,
			         resumed_from, bridge_call_id, pty_id, wait_ms, output, started_at, finished_at)
			      VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, ?, NULL)`,
			args: [attemptId, runId, seq, harness, mode, resumeId, startedAt],
		});

		const result =
			mode === "pty"
				? await this.runPtyAttempt(entry, harness, resumeId)
				: await this.runHeadlessAttempt(db, entry, harness, resumeId);

		// 记下这次 attempt 期间落地的原生会话 id，下一次重试就能接着它跑
		const sessionExternalId = await findRecentSessionExternalId(
			db,
			harness,
			job.cwd,
			startedAt,
		);

		await db.client.execute({
			sql: `UPDATE harness_job_attempts
			      SET exit_code = ?, failure_kind = ?, evidence = ?, bridge_call_id = ?,
			          pty_id = ?, output = ?, finished_at = ?
			      WHERE id = ?`,
			args: [
				result.exitCode,
				result.failure?.kind ?? null,
				result.failure?.evidence ?? null,
				result.bridgeCallId,
				result.ptyId,
				result.output.slice(0, MAX_OUTPUT_CHARS) || null,
				Date.now(),
				attemptId,
			],
		});

		return {
			attemptId,
			failure: result.failure,
			output: result.output,
			sessionExternalId,
		};
	}

	/** headless：起子进程跑一遍。 */
	private async runHeadlessAttempt(
		db: DbContext,
		entry: ActiveRun,
		harness: string,
		resumeId: string | null,
	): Promise<{
		failure: FailureSignal | null;
		output: string;
		exitCode: number | null;
		bridgeCallId: string | null;
		ptyId: string | null;
	}> {
		const { job, runId } = entry;

		if (!canBridgeCli(harness)) {
			return {
				failure: {
					kind: "invalid_request",
					retryable: false,
					evidence: `${harness} 没有已验证的 headless 模式，无法在后台执行。请把任务改成「可视终端」形态，或换一个入口。`,
					httpStatus: null,
					suggestedDelayMs: 0,
				},
				output: "",
				exitCode: null,
				bridgeCallId: null,
				ptyId: null,
			};
		}

		const controller = new AbortController();
		entry.abortAttempt = () => controller.abort();

		// 能续接就续接，续接不了就重发原指令——两者在 attempt 记录里是分得清的
		const override = resumeId
			? buildHeadlessResumeArgs(harness, resumeId, job.allowWrite)
			: null;

		const settings = await loadHarnessHubSettings(db).catch(() => null);
		const timeoutMs = job.timeoutMs ?? settings?.bridgeCliTimeoutMs ?? 300_000;

		const call = await runBridgeCall(
			db,
			{
				target: harness,
				kind: "cli",
				prompt: override ? RESUME_INSTRUCTION : job.prompt,
				cwd: job.cwd ?? undefined,
				timeoutMs,
				caller: `automation:${job.id}`,
			},
			{
				allowWrite: job.allowWrite,
				jobRunId: runId,
				signal: controller.signal,
				buildArgsOverride: override ?? undefined,
			},
		);
		entry.abortAttempt = null;

		const output = call.answer || call.rawOutput || "";
		// 三个来源一起交给分类器：CLI 常把 `API Error: 429` 打在 stderr 上
		// 却以 0 退出，只看退出码或只看 answer 都会把失败当成功。
		const failure = classifyFailure({
			text: `${call.rawOutput ?? ""}\n${call.answer ?? ""}\n${call.error ?? ""}`.trim(),
			exitCode: call.exitCode ?? null,
		});

		return {
			// 分类器没判出失败但桥接层自己说失败了（比如「没有产出任何内容」），
			// 仍然要如实记成一次失败，否则会被当成「本轮无错误结束」
			failure:
				failure ??
				(call.ok
					? null
					: {
							kind: "crash",
							retryable: true,
							evidence: call.error ?? "调用失败但没有给出原因",
							httpStatus: null,
							suggestedDelayMs: 30_000,
						}),
			output,
			exitCode: call.exitCode ?? null,
			bridgeCallId: call.callId,
			ptyId: null,
		};
	}

	/** 可视终端：起 pty 跑 TUI，靠运行态监测观察它什么时候算跑完。 */
	private async runPtyAttempt(
		entry: ActiveRun,
		harness: string,
		resumeId: string | null,
	): Promise<{
		failure: FailureSignal | null;
		output: string;
		exitCode: number | null;
		bridgeCallId: string | null;
		ptyId: string | null;
	}> {
		const { job, runId } = entry;
		const cwd = job.cwd?.trim();
		if (!cwd) {
			return {
				failure: {
					kind: "invalid_request",
					retryable: false,
					evidence: "可视终端形态必须指定工作目录",
					httpStatus: null,
					suggestedDelayMs: 0,
				},
				output: "",
				exitCode: null,
				bridgeCallId: null,
				ptyId: null,
			};
		}

		// 能原生续接就续接（无损、零成本），否则起一个新的并注入原指令
		const resumeCommand = resumeId
			? buildResumeCommand(harness, resumeId)
			: null;

		let launched: Awaited<ReturnType<typeof launchHarnessWithHandoff>>;
		try {
			launched = await launchHarnessWithHandoff({
				harness: harness as HarnessKind,
				cwd,
				handoffPath: null,
				instruction: resumeCommand ? RESUME_INSTRUCTION : job.prompt,
				commandOverride: resumeCommand ?? undefined,
				tabName: `⏱ ${job.name}`,
				jobRunId: runId,
				getMainWindow: this.getMainWindow,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				failure: classifyFailure({ text: message }) ?? {
					kind: "crash",
					retryable: true,
					evidence: message,
					httpStatus: null,
					suggestedDelayMs: 30_000,
				},
				output: message,
				exitCode: null,
				bridgeCallId: null,
				ptyId: null,
			};
		}

		entry.abortAttempt = () => {
			closeHarnessPty(launched.ptyId);
		};
		const outcome = await this.waitForPty(
			entry,
			launched.runtimeId,
			job.timeoutMs ?? DEFAULT_PTY_TIMEOUT_MS,
		);
		entry.abortAttempt = null;

		// 失败时把这个 pty 关掉再重试，否则一夜下来会攒一堆报错的终端 tab；
		// 成功则留着，用户早上能回看它到底干了什么。
		if (outcome.failure) {
			closeHarnessPty(launched.ptyId);
		}

		return {
			failure: outcome.failure,
			output: outcome.tail,
			exitCode: outcome.exitCode,
			bridgeCallId: null,
			ptyId: launched.ptyId,
		};
	}

	/**
	 * 等一个 pty 跑到「这一轮结束」。
	 *
	 * 结束的判据有三个：进程退出、屏幕上出现错误信号、或者回到「等你输入」的
	 * 空闲态（TUI 干完一轮就是这个样子）。空闲判定要先过一段热身期——
	 * CLI 刚启动、指令还没进去的时候，屏幕看起来和干完活一模一样。
	 */
	private async waitForPty(
		entry: ActiveRun,
		runtimeId: string,
		timeoutMs: number,
	): Promise<{
		failure: FailureSignal | null;
		tail: string;
		exitCode: number | null;
	}> {
		const startedAt = Date.now();
		const deadline = startedAt + timeoutMs;
		let everWorked = false;

		while (Date.now() < deadline) {
			if (entry.cancelled) {
				const snapshot = harnessRuntimeMonitor.get(runtimeId);
				return {
					failure: null,
					tail: snapshot?.tail ?? "",
					exitCode: snapshot?.exitCode ?? null,
				};
			}

			await new Promise((resolve) => setTimeout(resolve, PTY_POLL_MS));
			const snapshot = harnessRuntimeMonitor.get(runtimeId);
			// 条目已被回收（保留期过了）：只能认为它结束了，没有更多信息可给
			if (!snapshot) {
				return { failure: null, tail: "", exitCode: null };
			}

			if (snapshot.state === "working") everWorked = true;

			if (snapshot.state === "error" || snapshot.state === "stalled") {
				return {
					failure: snapshot.failure ?? {
						kind: snapshot.state === "stalled" ? "stalled" : "crash",
						retryable: true,
						evidence: snapshot.tail,
						httpStatus: null,
						suggestedDelayMs: 0,
					},
					tail: snapshot.tail,
					exitCode: snapshot.exitCode,
				};
			}

			if (snapshot.state === "exited") {
				return {
					failure: snapshot.failure,
					tail: snapshot.tail,
					exitCode: snapshot.exitCode,
				};
			}

			// 回到空闲 = 这一轮干完了。热身期内的空闲不算数。
			if (
				snapshot.state === "idle" &&
				(everWorked || Date.now() - startedAt > PTY_WARMUP_MS)
			) {
				return { failure: null, tail: snapshot.tail, exitCode: null };
			}
		}

		const snapshot = harnessRuntimeMonitor.get(runtimeId);
		return {
			failure: classifyFailure({
				text: snapshot?.tail ?? "",
				timedOut: true,
			}),
			tail: snapshot?.tail ?? "",
			exitCode: null,
		};
	}

	// ---------- 等待策略 ----------

	/**
	 * 算出这次失败之后该等多久。
	 *
	 * 限额类优先用**检测到的真实恢复时间**（quota.ts 从提示文案里解析出来的），
	 * 解析不出才用退避——猜一个「大概两小时」然后提前撞回去，只会白白消耗一次
	 * 重试预算。
	 */
	private async computeWait(
		db: DbContext,
		harness: string,
		failure: FailureSignal,
		attemptSeq: number,
		backoffCapMs: number,
	): Promise<number> {
		if (failure.kind === "rate_limit") {
			const quota = await getQuotaState(db, harness).catch(() => null);
			if (quota?.resetsAt && quota.resetsAt > Date.now()) {
				return Math.min(
					quota.resetsAt - Date.now() + 30_000,
					MAX_QUOTA_WAIT_MS,
				);
			}
			return Math.min(failure.suggestedDelayMs, MAX_QUOTA_WAIT_MS);
		}
		// 卡死已经在中止时消耗掉时间了，立刻重试
		if (failure.kind === "stalled") return 0;

		const base = failure.suggestedDelayMs || 5_000;
		return Math.min(base * 2 ** (attemptSeq - 1), backoffCapMs);
	}

	/** 挑一个可以接手的入口。全都不可用时返回 null（不硬塞）。 */
	private async pickFailoverHarness(
		db: DbContext,
		current: string,
	): Promise<string | null> {
		// 用「代码改写」这条能力的路由顺序——自动化任务绝大多数是工程任务，
		// 且这个顺序是用户在设置里能自己调的，不是这里拍脑袋定的。
		const { candidates } = await resolveRoute(db, "refactor").catch(() => ({
			candidates: [],
		}));
		const next = candidates.find(
			(c) => c.available && c.harness !== current && c.kind === "cli",
		);
		return next?.harness ?? null;
	}

	/** 可被取消打断的等待。 */
	private sleep(entry: ActiveRun, ms: number): Promise<void> {
		if (ms <= 0) return Promise.resolve();
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				entry.wake = null;
				resolve();
			}, ms);
			entry.wake = () => {
				clearTimeout(timer);
				entry.wake = null;
				resolve();
			};
		});
	}

	// ---------- 落库与推送 ----------

	private async updateRun(
		db: DbContext,
		runId: string,
		patch: {
			status?: JobRunStatus;
			attemptCount?: number;
			lastFailureKind?: string | null;
			lastError?: string | null;
			nextAttemptAt?: number | null;
			resultText?: string | null;
			finishedAt?: number | null;
		},
	): Promise<void> {
		const sets: string[] = [];
		const args: (string | number | null)[] = [];
		if (patch.status !== undefined) {
			sets.push("status = ?");
			args.push(patch.status);
		}
		if (patch.attemptCount !== undefined) {
			sets.push("attempt_count = ?");
			args.push(patch.attemptCount);
		}
		if (patch.lastFailureKind !== undefined) {
			sets.push("last_failure_kind = ?");
			args.push(patch.lastFailureKind);
		}
		if (patch.lastError !== undefined) {
			sets.push("last_error = ?");
			args.push(patch.lastError?.slice(0, 4000) ?? null);
		}
		if (patch.nextAttemptAt !== undefined) {
			sets.push("next_attempt_at = ?");
			args.push(patch.nextAttemptAt);
		}
		if (patch.resultText !== undefined) {
			sets.push("result_text = ?");
			args.push(patch.resultText);
		}
		if (patch.finishedAt !== undefined) {
			sets.push("finished_at = ?");
			args.push(patch.finishedAt);
		}
		if (!sets.length) return;
		args.push(runId);
		await db.client
			.execute({
				sql: `UPDATE harness_job_runs SET ${sets.join(", ")} WHERE id = ?`,
				args,
			})
			.catch((error: unknown) => {
				logger.warn({
					msg: "更新自动化运行状态失败",
					runId,
					error: error instanceof Error ? error.message : String(error),
				});
			});
		await this.emit(db, runId);
	}

	private async emit(db: DbContext, runId: string): Promise<void> {
		if (!this.listeners.size) return;
		const run = await getRun(db, runId).catch(() => null);
		if (!run) return;
		for (const listener of this.listeners) {
			try {
				listener(run);
			} catch {
				// 监听器自己的问题不该影响执行
			}
		}
	}

	private async recordAttemptWait(
		db: DbContext,
		attemptId: string,
		waitMs: number,
	): Promise<void> {
		await db.client
			.execute({
				sql: `UPDATE harness_job_attempts SET wait_ms = ? WHERE id = ?`,
				args: [waitMs, attemptId],
			})
			.catch(() => undefined);
	}

	/** 需要人介入时给一个系统通知——夜里跑挂了，第二天得有人知道。 */
	private async notifyIfNeeded(
		db: DbContext,
		job: AutomationJob,
		status: JobRunStatus,
		failure: FailureSignal | null,
	): Promise<void> {
		if (status !== "blocked" && status !== "failed") return;
		const settings = await loadHarnessHubSettings(db).catch(() => null);
		if (settings && settings.automationNotifyOnFailure === false) return;

		const reason = failure
			? `${describeFailureKind(failure.kind)}`
			: "未知原因";
		const body =
			status === "blocked"
				? `「${job.name}」需要你处理：${reason}（重试无法解决）`
				: `「${job.name}」重试用尽仍未成功：${reason}`;

		try {
			const { Notification } = await import("electron");
			if (Notification.isSupported()) {
				new Notification({ title: "AI 自动化任务", body }).show();
			}
		} catch {
			// 通知失败不影响任务本身
		}
		try {
			sendToLiveWebContents(this.getMainWindow(), "harness-job-alert", {
				job_id: job.id,
				job_name: job.name,
				status,
				failure_kind: failure?.kind ?? null,
				message: body,
			});
		} catch {
			// 窗口已销毁
		}
	}
}

// ============================================================
// 续接
// ============================================================

/** 重试时给目标 agent 的话。不重述任务本身——原会话里已经有了。 */
const RESUME_INSTRUCTION =
	"上一轮执行被中断了（网络或服务端错误）。请检查当前进度，从中断处继续完成之前的任务，不要从头重做。";

/**
 * 构造 headless 续接的命令行参数。
 *
 * **只对实测验证过的入口开放。** `resume.ts` 验证的是交互式 `claude --resume`，
 * headless 组合另算——对没验证过的 CLI 乐观假设它支持，结果是重试全部以
 * 参数错误告终，比老老实实重发指令糟糕得多。返回 null 即表示「这个入口的
 * headless 重试请退回重发原指令」。
 *
 * 待办（见 docs/harness-automation-施工文档.md）：实测 `claude -p --resume <id>`
 * 后再决定是否为 codex 等入口补上。
 */
function buildHeadlessResumeArgs(
	harness: string,
	resumeId: string,
	allowWrite: boolean,
):
	| ((context: {
			prompt: string;
			allowWrite: boolean;
			cwd: string | null;
	  }) => string[])
	| null {
	if (harness !== "claude-code") return null;
	return ({ prompt }) => [
		"-p",
		prompt,
		"--resume",
		resumeId,
		"--output-format",
		"text",
		"--allowedTools",
		allowWrite
			? "Read Grep Glob WebFetch Edit Write Bash"
			: "Read Grep Glob WebFetch",
	];
}

/**
 * 找这次 attempt 期间落地的原生会话 id。
 *
 * 数据来自 ingest watcher 实时摄取的 `harness_sessions`——不去猜路径、
 * 不自己扫目录，摄取层已经是这件事的唯一负责人。
 */
async function findRecentSessionExternalId(
	db: DbContext,
	harness: string,
	cwd: string | null,
	since: number,
): Promise<string | null> {
	if (!supportsNativeResume(harness)) return null;
	try {
		const res = await db.client.execute({
			sql: `SELECT external_id FROM harness_sessions
			      WHERE harness = ? AND updated_at >= ?
			        AND (? IS NULL OR cwd = ?)
			      ORDER BY updated_at DESC LIMIT 1`,
			args: [harness, since, cwd, cwd],
		});
		const row = res.rows[0] as Record<string, unknown> | undefined;
		const id = row?.external_id ? String(row.external_id) : "";
		return id || null;
	} catch {
		return null;
	}
}

// ============================================================
// 查询
// ============================================================

function rowToRun(row: Record<string, unknown>): JobRun {
	return {
		id: String(row.id ?? ""),
		jobId: String(row.job_id ?? ""),
		status: String(row.status ?? "queued") as JobRunStatus,
		trigger: String(row.trigger_source ?? ""),
		attemptCount: Number(row.attempt_count ?? 0),
		lastFailureKind: (row.last_failure_kind as string) ?? null,
		lastError: (row.last_error as string) ?? null,
		nextAttemptAt: row.next_attempt_at ? Number(row.next_attempt_at) : null,
		resultText: (row.result_text as string) ?? null,
		startedAt: Number(row.started_at ?? 0),
		finishedAt: row.finished_at ? Number(row.finished_at) : null,
	};
}

function rowToAttempt(row: Record<string, unknown>): JobAttempt {
	return {
		id: String(row.id ?? ""),
		runId: String(row.run_id ?? ""),
		seq: Number(row.seq ?? 0),
		harness: String(row.harness ?? ""),
		mode: String(row.mode ?? ""),
		exitCode: row.exit_code === null ? null : Number(row.exit_code),
		failureKind: (row.failure_kind as string) ?? null,
		evidence: (row.evidence as string) ?? null,
		resumedFrom: (row.resumed_from as string) ?? null,
		bridgeCallId: (row.bridge_call_id as string) ?? null,
		ptyId: (row.pty_id as string) ?? null,
		waitMs: row.wait_ms === null ? null : Number(row.wait_ms),
		output: (row.output as string) ?? null,
		startedAt: Number(row.started_at ?? 0),
		finishedAt: row.finished_at ? Number(row.finished_at) : null,
	};
}

export async function getRun(
	db: DbContext,
	runId: string,
): Promise<JobRun | null> {
	const res = await db.client.execute({
		sql: `SELECT * FROM harness_job_runs WHERE id = ?`,
		args: [runId],
	});
	const row = res.rows[0] as Record<string, unknown> | undefined;
	return row ? rowToRun(row) : null;
}

export async function listRuns(
	db: DbContext,
	options: { jobId?: string | null; limit?: number } = {},
): Promise<JobRun[]> {
	const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
	const res = options.jobId
		? await db.client.execute({
				sql: `SELECT * FROM harness_job_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?`,
				args: [options.jobId, limit],
			})
		: await db.client.execute({
				sql: `SELECT * FROM harness_job_runs ORDER BY started_at DESC LIMIT ?`,
				args: [limit],
			});
	return res.rows.map((r) => rowToRun(r as Record<string, unknown>));
}

export async function listAttempts(
	db: DbContext,
	runId: string,
): Promise<JobAttempt[]> {
	const res = await db.client.execute({
		sql: `SELECT * FROM harness_job_attempts WHERE run_id = ? ORDER BY seq ASC`,
		args: [runId],
	});
	return res.rows.map((r) => rowToAttempt(r as Record<string, unknown>));
}

/**
 * 启动时收拾上次没跑完的 run。
 *
 * 应用被强杀 / 崩溃时，running 与 waiting 的行会留在库里。它们对应的进程
 * 早就没了，不标掉的话 UI 会一直显示「正在运行」——一个永远不动的进度条
 * 比明确的失败更让人困惑。
 */
export async function reconcileOrphanRuns(db: DbContext): Promise<number> {
	const res = await db.client.execute({
		sql: `UPDATE harness_job_runs
		      SET status = 'failed',
		          last_error = COALESCE(last_error, '应用退出导致本次运行中断'),
		          finished_at = ?
		      WHERE status IN ('running', 'waiting', 'queued')`,
		args: [Date.now()],
	});
	return Number(res.rowsAffected ?? 0);
}

export const automationRunner = new AutomationRunner();
