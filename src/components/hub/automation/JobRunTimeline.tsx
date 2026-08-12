/**
 * JobRunTimeline —— 一个任务的运行历史。
 *
 * 这里是「昨晚到底发生了什么」的答案所在：每次运行展开后能看到每一次尝试的
 * 失败类别、判定证据的**原文**、等了多久、以及关键的一条——
 * 这次是接着上次的会话续跑的，还是重新发起的。
 *
 * 证据原文必须原样展示。分类结果是程序判的，可能判错；把原文摆出来，
 * 用户才有机会发现「这根本不是限额，是我的 prompt 里写了 usage limit 这个词」。
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, CornerDownRight, Loader2 } from "lucide-react";
import {
	getAutomationRun,
	listAutomationRuns,
	type HarnessJobAttemptRow,
	type HarnessJobRunRow,
} from "../../../lib/api/harnessAutomation";
import { cn } from "../../../lib/utils";
import { formatStamp } from "../hubUtils";
import {
	FAILURE_KIND_META,
	RUN_STATUS_META,
	formatElapsed,
	formatWait,
} from "./automationUtils";

export function JobRunTimeline({ jobId }: { jobId: string }) {
	const [runs, setRuns] = useState<HarnessJobRunRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

	const reload = useCallback(async () => {
		try {
			setRuns(await listAutomationRuns({ job_id: jobId, limit: 20 }));
		} finally {
			setLoading(false);
		}
	}, [jobId]);

	useEffect(() => {
		void reload();
	}, [reload]);

	if (loading) {
		return (
			<div className="flex items-center gap-1.5 text-[11px] text-text-light">
				<Loader2 className="w-3 h-3 animate-spin" />
				读取运行记录…
			</div>
		);
	}

	if (!runs.length) {
		return (
			<p className="text-[11px] text-text-light">这个任务还没有运行过。</p>
		);
	}

	return (
		<div className="space-y-1">
			{runs.map((run) => (
				<RunRow
					key={run.id}
					run={run}
					expanded={expandedRunId === run.id}
					onToggle={() =>
						setExpandedRunId((prev) => (prev === run.id ? null : run.id))
					}
				/>
			))}
		</div>
	);
}

function RunRow({
	run,
	expanded,
	onToggle,
}: {
	run: HarnessJobRunRow;
	expanded: boolean;
	onToggle: () => void;
}) {
	const [attempts, setAttempts] = useState<HarnessJobAttemptRow[] | null>(null);
	const meta = RUN_STATUS_META[run.status];

	useEffect(() => {
		if (!expanded || attempts) return;
		void getAutomationRun(run.id)
			.then((detail) => setAttempts(detail.attempts))
			.catch(() => setAttempts([]));
	}, [expanded, attempts, run.id]);

	return (
		<div>
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-warm-200/50 dark:hover:bg-cream-800/30 transition duration-150 text-left"
			>
				<ChevronRight
					className={cn(
						"w-3 h-3 text-text-light shrink-0 transition duration-150",
						expanded && "rotate-90",
					)}
					strokeWidth={1.8}
				/>
				<span className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.dot)} />
				<span className="text-[11px] text-text-muted shrink-0">
					{formatStamp(run.started_at)}
				</span>
				<span className={cn("text-[11px] shrink-0", meta.text)}>
					{meta.label}
				</span>
				<span className="text-[11px] text-text-light truncate">
					{run.attempt_count > 1 && `${run.attempt_count} 次尝试 · `}
					{formatElapsed(run.started_at, run.finished_at)}
					{run.trigger === "manual" ? " · 手动" : " · 定时"}
				</span>
			</button>

			{expanded && (
				<div className="pl-6 pr-1 pb-2 space-y-1.5">
					{/* 状态的确切含义写在这儿——尤其是「无错误结束」不等于「任务完成」 */}
					<p className="text-[11px] text-text-light leading-relaxed">
						{meta.hint}
					</p>

					{attempts === null ? (
						<div className="flex items-center gap-1.5 text-[11px] text-text-light">
							<Loader2 className="w-3 h-3 animate-spin" />
							读取尝试明细…
						</div>
					) : (
						attempts.map((attempt) => (
							<AttemptRow key={attempt.id} attempt={attempt} />
						))
					)}

					{run.result_text && (
						<div className="mt-2">
							<span className="block text-[11px] text-text-light mb-1">
								最后一次的产出
							</span>
							<pre className="text-[11px] leading-relaxed text-text-muted font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto scrollbar-hide rounded-lg bg-surface/60 px-2.5 py-2">
								{run.result_text.slice(0, 4000)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function AttemptRow({ attempt }: { attempt: HarnessJobAttemptRow }) {
	const failureMeta = attempt.failure_kind
		? FAILURE_KIND_META[attempt.failure_kind]
		: null;

	return (
		<div className="rounded-lg border border-border/60 px-2.5 py-2">
			<div className="flex items-center gap-1.5 flex-wrap">
				<span className="text-[11px] text-text-muted">第 {attempt.seq} 次</span>
				<span className="text-[11px] text-text-light">{attempt.harness}</span>
				{/* 续跑与重发是完全不同的两件事，必须让用户分得清 */}
				{attempt.resumed_from ? (
					<span className="flex items-center gap-0.5 text-[11px] text-info">
						<CornerDownRight className="w-2.5 h-2.5" strokeWidth={2} />
						续接上次会话
					</span>
				) : (
					<span className="text-[11px] text-text-light">重新发起</span>
				)}
				{attempt.exit_code !== null && (
					<span className="text-[11px] text-text-light">
						退出码 {attempt.exit_code}
					</span>
				)}
				{attempt.wait_ms !== null && attempt.wait_ms > 0 && (
					<span className="text-[11px] text-warning">
						之后等待 {formatWait(attempt.wait_ms)}
					</span>
				)}
			</div>

			{failureMeta && (
				<div className="mt-1.5">
					<div className="flex items-center gap-1.5">
						<span className="text-[11px] font-medium text-error">
							{failureMeta.label}
						</span>
						<span className="text-[11px] text-text-light">
							{failureMeta.advice}
						</span>
					</div>
					{attempt.evidence && (
						<pre className="mt-1 text-[11px] leading-relaxed text-text-muted font-mono whitespace-pre-wrap break-all max-h-24 overflow-y-auto scrollbar-hide">
							{attempt.evidence}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
