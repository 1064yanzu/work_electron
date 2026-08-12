/**
 * AutomationPanel —— 定时任务列表。
 *
 * 解决的是「晚上额度空闲的时候把这些活跑了」这个诉求：任务到点自己起，
 * 中途撞上 429 / 5xx / 断连会自己等、自己接着上次的进度续跑，不用人守着。
 *
 * 列表上每个任务显示三件事实：下次什么时候跑、上一次是什么结果、现在有没有在跑。
 * 不显示「预计耗时」「成功率」这类需要猜的数字。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CalendarClock, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
	cancelAutomationRun,
	deleteAutomationJob,
	listAutomationJobs,
	listAutomationRuns,
	runAutomationJobNow,
	setAutomationJobEnabled,
	type HarnessJobRow,
	type HarnessJobRunRow,
} from "../../../lib/api/harnessAutomation";
import { useIpcListen } from "../../../hooks/useIpcListen";
import { cn } from "../../../lib/utils";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { toast } from "../../ui/Toast";
import { shortCwd } from "../hubUtils";
import {
	EXEC_MODE_LABEL,
	RUN_STATUS_META,
	formatSchedule,
} from "./automationUtils";
import { JobEditorDrawer } from "./JobEditorDrawer";
import { JobRunTimeline } from "./JobRunTimeline";

export function AutomationPanel({
	harnesses,
	defaultCwd,
}: {
	/** 可选的目标入口（只传本机真实可用的，不列不存在的东西） */
	harnesses: { id: string; label: string; kind: "cli" | "web" | "app" }[];
	defaultCwd: string | null;
}) {
	const [jobs, setJobs] = useState<HarnessJobRow[]>([]);
	const [runs, setRuns] = useState<HarnessJobRunRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<HarnessJobRow | "new" | null>(null);
	const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

	const reload = useCallback(async () => {
		try {
			const [nextJobs, nextRuns] = await Promise.all([
				listAutomationJobs(),
				listAutomationRuns({ limit: 100 }),
			]);
			setJobs(nextJobs);
			setRuns(nextRuns);
		} catch (error) {
			toast.error(
				`读取自动化任务失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	// 运行状态变化实时反映到列表，不必等用户手动刷新
	useIpcListen<{ run: HarnessJobRunRow }>(
		"harness-job-run-changed",
		(payload) => {
			if (!payload?.run) return;
			setRuns((prev) => {
				const next = prev.filter((r) => r.id !== payload.run.id);
				return [payload.run, ...next].sort(
					(a, b) => b.started_at - a.started_at,
				);
			});
			// 运行结束时任务的 next_run_at / last_status 也变了，重拉一次
			if (
				payload.run.status !== "running" &&
				payload.run.status !== "waiting"
			) {
				void listAutomationJobs()
					.then(setJobs)
					.catch(() => undefined);
			}
		},
	);

	// 需要人工介入时除了系统通知，应用内也给一条——用户可能正开着窗口，
	// 系统通知反而容易被忽略掉
	useIpcListen<{ message: string; status: string }>(
		"harness-job-alert",
		(payload) => {
			if (!payload?.message) return;
			toast.error(payload.message);
			void reload();
		},
	);

	/** 每个任务当前正在进行的 run（running / waiting / queued）。 */
	const activeRunByJob = useMemo(() => {
		const map = new Map<string, HarnessJobRunRow>();
		for (const run of runs) {
			if (
				run.status === "running" ||
				run.status === "waiting" ||
				run.status === "queued"
			) {
				if (!map.has(run.job_id)) map.set(run.job_id, run);
			}
		}
		return map;
	}, [runs]);

	const handleRunNow = async (job: HarnessJobRow) => {
		const result = await runAutomationJobNow(job.id);
		if (result.error) {
			toast.error(result.error);
			return;
		}
		toast.success(`「${job.name}」已开始运行`);
		void reload();
	};

	const handleDelete = async (job: HarnessJobRow) => {
		const ok = await confirmDialog.show({
			title: "删除这个自动化任务？",
			message: `「${job.name}」及其全部运行记录都会被删除。正在进行的运行会被取消。`,
			confirmText: "删除",
			type: "danger",
		});
		if (!ok) return;
		await deleteAutomationJob(job.id);
		void reload();
	};

	const handleToggle = async (job: HarnessJobRow) => {
		await setAutomationJobEnabled(job.id, !job.enabled);
		void reload();
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full text-[11.5px] text-text-light">
				正在读取自动化任务…
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0">
			<div className="flex items-center justify-between px-5 pt-3.5 pb-2.5 shrink-0">
				<span className="text-[10.5px] text-text-light">
					{jobs.length ? `${jobs.length} 个任务` : "还没有自动化任务"}
				</span>
				<button
					type="button"
					onClick={() => setEditing("new")}
					className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-terracotta hover:bg-terracotta/[0.1] transition duration-200"
				>
					<Plus className="w-3 h-3" strokeWidth={2} />
					新建任务
				</button>
			</div>

			{!jobs.length ? (
				<div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
					<CalendarClock
						className="w-5 h-5 text-text-light"
						strokeWidth={1.5}
					/>
					<p className="text-[12px] text-text-muted">
						让 AI 在你不在的时候把活干了
					</p>
					<p className="text-[10.5px] text-text-light leading-relaxed">
						定一个时间（比如每天凌晨两点），到点自动起一个 CLI 跑你写好的指令。
						中途遇到限流、上游 5xx、连接中断，会按类别等待并
						<b className="font-medium">接着上次的进度续跑</b>，而不是从头重来。
					</p>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4 space-y-2">
					{jobs.map((job) => (
						<JobCard
							key={job.id}
							job={job}
							activeRun={activeRunByJob.get(job.id) ?? null}
							expanded={expandedJobId === job.id}
							onToggleExpand={() =>
								setExpandedJobId((prev) => (prev === job.id ? null : job.id))
							}
							onRunNow={() => void handleRunNow(job)}
							onCancel={async () => {
								const run = activeRunByJob.get(job.id);
								if (!run) return;
								await cancelAutomationRun(run.id);
								void reload();
							}}
							onEdit={() => setEditing(job)}
							onDelete={() => void handleDelete(job)}
							onToggleEnabled={() => void handleToggle(job)}
						/>
					))}
				</div>
			)}

			{editing && (
				<JobEditorDrawer
					job={editing === "new" ? null : editing}
					harnesses={harnesses}
					defaultCwd={defaultCwd}
					onClose={() => setEditing(null)}
					onSaved={() => {
						setEditing(null);
						void reload();
					}}
				/>
			)}
		</div>
	);
}

function JobCard({
	job,
	activeRun,
	expanded,
	onToggleExpand,
	onRunNow,
	onCancel,
	onEdit,
	onDelete,
	onToggleEnabled,
}: {
	job: HarnessJobRow;
	activeRun: HarnessJobRunRow | null;
	expanded: boolean;
	onToggleExpand: () => void;
	onRunNow: () => void;
	onCancel: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onToggleEnabled: () => void;
}) {
	const lastStatusMeta = job.last_status
		? RUN_STATUS_META[job.last_status as keyof typeof RUN_STATUS_META]
		: null;
	const runMeta = activeRun ? RUN_STATUS_META[activeRun.status] : null;

	return (
		<div
			className={cn(
				"rounded-xl border transition duration-200",
				job.enabled
					? "border-border bg-surface"
					: "border-border/50 bg-surface/40",
			)}
		>
			<div className="px-3.5 py-3">
				<div className="flex items-start gap-2.5">
					{/* 启用开关做成一个状态点，点一下切换——比一个独立的 Switch 更省空间 */}
					<button
						type="button"
						onClick={onToggleEnabled}
						title={job.enabled ? "点击停用" : "点击启用"}
						className="mt-[5px] shrink-0"
					>
						<span
							className={cn(
								"block w-1.5 h-1.5 rounded-full transition duration-200",
								runMeta
									? runMeta.dot
									: job.enabled
										? "bg-terracotta"
										: "bg-text-light",
								activeRun?.status === "running" && "animate-pulse",
							)}
						/>
					</button>

					<button
						type="button"
						onClick={onToggleExpand}
						className="min-w-0 flex-1 text-left"
					>
						<div className="flex items-center gap-2">
							<span
								className={cn(
									"text-[12px] font-medium truncate",
									job.enabled ? "text-text-secondary" : "text-text-light",
								)}
							>
								{job.name}
							</span>
							{runMeta && (
								<span className={cn("text-[10px] shrink-0", runMeta.text)}>
									{runMeta.label}
									{activeRun && activeRun.attempt_count > 1 && (
										<> · 第 {activeRun.attempt_count} 次尝试</>
									)}
								</span>
							)}
						</div>
						<div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-light">
							<span>{job.target_harness}</span>
							<span>· {EXEC_MODE_LABEL[job.exec_mode] ?? job.exec_mode}</span>
							{job.cwd && <span>· {shortCwd(job.cwd)}</span>}
							{job.allow_write && (
								<span className="text-warning">· 可改文件</span>
							)}
						</div>
						<div className="flex items-center gap-1.5 mt-1 text-[10px]">
							<span className="text-text-muted">{job.trigger_label}</span>
							{job.enabled && (
								<span className="text-text-light">
									· 下次 {formatSchedule(job.next_run_at)}
								</span>
							)}
							{!activeRun && lastStatusMeta && (
								<span className={cn("ml-auto", lastStatusMeta.text)}>
									上次 {lastStatusMeta.label}
								</span>
							)}
						</div>
					</button>

					<div className="flex items-center gap-0.5 shrink-0">
						{activeRun ? (
							<button
								type="button"
								onClick={onCancel}
								title="取消本次运行"
								className="p-1.5 rounded-lg text-text-light hover:text-error hover:bg-error-muted transition duration-200"
							>
								<Ban className="w-3.5 h-3.5" strokeWidth={1.6} />
							</button>
						) : (
							<button
								type="button"
								onClick={onRunNow}
								title="立即运行一次"
								className="p-1.5 rounded-lg text-text-light hover:text-terracotta hover:bg-terracotta/[0.1] transition duration-200"
							>
								<Play className="w-3.5 h-3.5" strokeWidth={1.6} />
							</button>
						)}
						<button
							type="button"
							onClick={onEdit}
							title="编辑"
							className="p-1.5 rounded-lg text-text-light hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40 transition duration-200"
						>
							<Pencil className="w-3.5 h-3.5" strokeWidth={1.6} />
						</button>
						<button
							type="button"
							onClick={onDelete}
							title="删除"
							className="p-1.5 rounded-lg text-text-light hover:text-error hover:bg-error-muted transition duration-200"
						>
							<Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
						</button>
					</div>
				</div>

				{/* 等待重试时把「还要等多久」明确写出来——不然看着像卡住了 */}
				{activeRun?.status === "waiting" && activeRun.next_attempt_at && (
					<p className="mt-2 text-[10px] text-warning">
						上一次失败（
						{activeRun.last_failure_kind ?? "原因未知"}），
						{formatSchedule(activeRun.next_attempt_at)} 自动重试
					</p>
				)}
			</div>

			{expanded && (
				<div className="border-t border-border/60 px-3.5 py-3">
					<JobRunTimeline jobId={job.id} />
				</div>
			)}
		</div>
	);
}
