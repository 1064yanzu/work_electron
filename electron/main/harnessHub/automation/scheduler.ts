/**
 * 自动化调度器 —— 「到点了，该跑哪些任务」。
 *
 * 结构照 `services/AutoSyncScheduler.ts`：单例 + 固定间隔 tick + 电源感知。
 * 那套模式在 WebDAV 自动同步上已经跑了很久，没必要另起炉灶。
 *
 * ## 三件容易被忽略但会毁掉夜间任务的事
 *
 * **睡眠**。定了凌晨两点的任务，机器一点半睡了，什么都不会发生。有任务在跑时
 * 会申请 `prevent-app-suspension`，让系统别把进程挂起。这是设置项而不是默认
 * 行为的一部分——它确实费电，用户应该知情。
 *
 * **积压补跑**。应用关了三天再打开，「每天 02:00」的任务积压了三次。默认策略是
 * 跳过、只排下一次：开机瞬间并发跑三遍同一个任务不是贴心，是事故。
 *
 * **重复触发**。同一个任务上一轮还在重试中，这一轮又到点了。永远以「这个任务
 * 有没有正在跑的 run」为准，不靠时间戳推断。
 */
import { powerMonitor, powerSaveBlocker } from "electron";
import type { BrowserWindow } from "electron";
import type { DbContext } from "../../db/client";
import { createLogger } from "../../logging/logger";
import { loadHarnessHubSettings } from "../settings";
import {
	alignToWindow,
	computeNextRunAt,
	isWithinWindow,
	listDueJobs,
	updateNextRunAt,
	type AutomationJob,
} from "./jobs";
import { automationRunner, reconcileOrphanRuns } from "./runner";
import { harnessRuntimeMonitor } from "./runtimeMonitor";

const logger = createLogger();

/** 扫描间隔。任务粒度是分钟级，60s 足够且不浪费。 */
const TICK_MS = 60_000;
/** 错过多久算「积压」。超过这个时长的 misfire 按策略处理。 */
const MISFIRE_GRACE_MS = 2 * 3_600_000;

class AutomationScheduler {
	private db: DbContext | null = null;
	private timer: NodeJS.Timeout | null = null;
	private ticking = false;
	private powerBlockerId: number | null = null;

	async start(
		db: DbContext,
		getMainWindow: () => BrowserWindow | null,
	): Promise<void> {
		if (this.timer) return;
		this.db = db;
		// 起 pty / 推通知都要拿主窗口，统一交给执行器持有一份
		automationRunner.setWindowGetter(getMainWindow);

		// 上次没跑完的 run 收个尾，否则 UI 会一直显示「正在运行」
		const orphans = await reconcileOrphanRuns(db).catch(() => 0);
		if (orphans > 0) {
			logger.info({ msg: "清理了上次未完成的自动化运行", count: orphans });
		}

		// 把用户配的卡死阈值交给监测层
		const settings = await loadHarnessHubSettings(db).catch(() => null);
		if (settings?.automationStalledThresholdMs) {
			harnessRuntimeMonitor.setStallThreshold(
				settings.automationStalledThresholdMs,
			);
		}

		this.timer = setInterval(() => {
			void this.tick();
		}, TICK_MS);
		this.timer.unref?.();

		logger.info({ msg: "自动化调度器已启动" });
		// 立刻跑一次，不必等到第一个 tick
		void this.tick();
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		automationRunner.cancelAll();
		this.releasePowerBlocker();
		logger.info({ msg: "自动化调度器已停止" });
	}

	/**
	 * 立即手动跑一个任务。
	 *
	 * 绕过触发器、时间窗与总开关（用户是显式点的按钮），但**不绕过并发上限**——
	 * 那个上限存在的理由与是谁触发的无关：几个 agent 同时抢 CPU 和额度不会更快。
	 *
	 * @returns runId；被并发上限挡下或已在运行时返回 null
	 */
	async runNow(job: AutomationJob): Promise<string | null> {
		if (!this.db) return null;
		if (automationRunner.hasActiveJob(job.id)) return null;

		const settings = await loadHarnessHubSettings(this.db).catch(() => null);
		const maxConcurrent = Math.max(1, settings?.automationMaxConcurrent ?? 2);
		if (automationRunner.activeCount() >= maxConcurrent) return null;

		const runId = await automationRunner.startRun(this.db, job, "manual");
		this.syncPowerBlocker(settings?.automationPreventSleep !== false);
		return runId;
	}

	private async tick(): Promise<void> {
		if (this.ticking || !this.db) return;
		this.ticking = true;
		const db = this.db;
		try {
			const settings = await loadHarnessHubSettings(db).catch(() => null);
			if (settings && settings.automationEnabled === false) {
				this.syncPowerBlocker(false);
				return;
			}
			const maxConcurrent = Math.max(1, settings?.automationMaxConcurrent ?? 2);

			const now = Date.now();
			const due = await listDueJobs(db, now);

			for (const job of due) {
				if (automationRunner.activeCount() >= maxConcurrent) break;
				// 同一个任务上一轮可能还在重试，不能叠着跑
				if (automationRunner.hasActiveJob(job.id)) continue;

				const scheduledAt = job.nextRunAt ?? now;

				// 1. 积压：错过太久的按策略处理
				if (now - scheduledAt > MISFIRE_GRACE_MS) {
					if (job.retryPolicy.misfire === "skip") {
						const next = computeNextRunAt(job.trigger, job.window, now);
						await updateNextRunAt(db, job.id, next);
						logger.info({
							msg: "跳过积压的自动化任务",
							jobId: job.id,
							name: job.name,
							missedAt: scheduledAt,
							nextRunAt: next,
						});
						continue;
					}
					// runOnce：照常往下跑一次，下面会重排下一次
				}

				// 2. 执行窗口：到点了但不在窗口内，推到窗口开启
				if (!isWithinWindow(job.window, now)) {
					const next = alignToWindow(job.window, now);
					await updateNextRunAt(db, job.id, next);
					continue;
				}

				// 3. 电池：定时触发在电池供电时默认跳过（手动运行不受影响）。
				//    夜间任务动辄跑几十分钟，不插电跑完多半意味着第二天没电开机。
				if (
					settings?.automationSkipOnBattery !== false &&
					powerMonitor.onBatteryPower
				) {
					const next = computeNextRunAt(job.trigger, job.window, now);
					await updateNextRunAt(db, job.id, next);
					logger.info({
						msg: "电池供电，跳过本次定时任务",
						jobId: job.id,
						name: job.name,
					});
					continue;
				}

				await automationRunner.startRun(db, job, "scheduled");
			}

			this.syncPowerBlocker(
				automationRunner.activeCount() > 0 &&
					settings?.automationPreventSleep !== false,
			);
		} catch (error) {
			logger.warn({
				msg: "自动化调度 tick 失败",
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			this.ticking = false;
		}
	}

	// ---------- 防休眠 ----------

	private syncPowerBlocker(shouldBlock: boolean): void {
		if (shouldBlock) {
			if (this.powerBlockerId !== null) return;
			try {
				this.powerBlockerId = powerSaveBlocker.start("prevent-app-suspension");
				logger.info({ msg: "自动化运行中，已阻止系统挂起应用" });
			} catch (error) {
				logger.warn({
					msg: "申请防休眠失败",
					error: error instanceof Error ? error.message : String(error),
				});
			}
			return;
		}
		this.releasePowerBlocker();
	}

	private releasePowerBlocker(): void {
		if (this.powerBlockerId === null) return;
		try {
			if (powerSaveBlocker.isStarted(this.powerBlockerId)) {
				powerSaveBlocker.stop(this.powerBlockerId);
			}
		} catch {
			// 已经被系统释放
		}
		this.powerBlockerId = null;
	}
}

export const automationScheduler = new AutomationScheduler();
