/**
 * RuntimePanel —— 运行监视。
 *
 * 回答一个此前 Hub 回答不了的问题：**现在有哪些 AI 在跑，各自是什么状态。**
 *
 * 之前唯一能看的是「会话文件还在不在写」，而一个报了 API Error 僵在那儿的
 * claude 和一个安静思考中的 claude，从文件视角看一模一样。这里显示的是运行态
 * 监测的真实判定：在干活 / 在等你输入 / 报错了（附原文）/ 太久没动静了。
 *
 * 面板上不出现任何推测性文案。判不出状态就显示最后一次确定的事实，
 * 出错就把命中的原文原样贴出来让用户自己判断是不是误判。
 */
import { useEffect, useState } from "react";
import {
	AlertTriangle,
	Ban,
	CircleSlash,
	RefreshCw,
	Terminal,
} from "lucide-react";
import {
	abortHarnessRuntime,
	type HarnessRuntimeRow,
} from "../../lib/api/harnessAutomation";
import { cn } from "../../lib/utils";
import { toast } from "../ui/Toast";
import {
	FAILURE_KIND_META,
	RUNTIME_STATE_META,
	formatElapsed,
} from "./automation/automationUtils";
import { useHarnessRuntimes } from "./automation/useHarnessRuntimes";

/** 结束态的条目在监测层保留 5 分钟，这里也按同一口径展示。 */
const isFinished = (state: string) => state === "exited";

export function RuntimePanel({
	onOpenTerminal,
}: {
	/** 点「查看终端」时的跳转（把 TerminalPanel 打开并切到那个 tab） */
	onOpenTerminal?: (ptyId: string) => void;
}) {
	const { runtimes, loading, reload } = useHarnessRuntimes();
	// 让「已运行 N 分钟」自己走起来，不必等下一次事件推送
	const [, forceTick] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => forceTick((n) => n + 1), 10_000);
		return () => clearInterval(timer);
	}, []);

	const handleAbort = async (runtime: HarnessRuntimeRow) => {
		const ok = await abortHarnessRuntime(runtime.id);
		if (ok) {
			toast.success(`已中止 ${runtime.label}`);
			void reload();
		} else {
			toast.error("这个执行体不支持中止，或它已经结束了");
		}
	};

	const active = runtimes.filter((r) => !isFinished(r.state));
	const finished = runtimes.filter((r) => isFinished(r.state));

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full text-[11.5px] text-text-light">
				正在读取运行状态…
			</div>
		);
	}

	if (!runtimes.length) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
				<CircleSlash className="w-5 h-5 text-text-light" strokeWidth={1.5} />
				<p className="text-[12px] text-text-muted">当前没有正在运行的 AI</p>
				<p className="text-[10.5px] text-text-light leading-relaxed">
					从 Hub 接力启动的 CLI、后台桥接调用、自动化任务都会出现在这里，
					并实时显示它们是在干活、在等输入，还是报错卡住了。
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0">
			<div className="flex items-center justify-between px-5 pt-3.5 pb-2 shrink-0">
				<span className="text-[10.5px] text-text-light">
					{active.length} 个正在运行
					{finished.length > 0 && ` · ${finished.length} 个刚结束`}
				</span>
				<button
					type="button"
					onClick={() => void reload()}
					className="p-1 rounded text-text-light hover:text-text-secondary transition duration-150"
					title="刷新"
				>
					<RefreshCw className="w-3 h-3" strokeWidth={1.6} />
				</button>
			</div>

			<div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4 space-y-2">
				{[...active, ...finished].map((runtime) => (
					<RuntimeCard
						key={runtime.id}
						runtime={runtime}
						onAbort={() => void handleAbort(runtime)}
						onOpenTerminal={onOpenTerminal}
					/>
				))}
			</div>
		</div>
	);
}

function RuntimeCard({
	runtime,
	onAbort,
	onOpenTerminal,
}: {
	runtime: HarnessRuntimeRow;
	onAbort: () => void;
	onOpenTerminal?: (ptyId: string) => void;
}) {
	const meta = RUNTIME_STATE_META[runtime.state];
	const failureMeta = runtime.failure
		? FAILURE_KIND_META[runtime.failure.kind]
		: null;
	const finished = isFinished(runtime.state);

	return (
		<div
			className={cn(
				"rounded-xl border px-3.5 py-3 transition duration-150",
				finished
					? "border-border/50 bg-surface/40 opacity-70"
					: "border-border bg-surface",
			)}
		>
			<div className="flex items-start gap-2.5">
				<span
					className={cn(
						"w-1.5 h-1.5 rounded-full mt-1 shrink-0",
						meta.dot,
						runtime.state === "working" && "animate-pulse",
					)}
				/>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="text-[12px] font-medium text-text-secondary truncate">
							{runtime.label}
						</span>
						<span className={cn("text-[11px] shrink-0", meta.text)}>
							{meta.label}
						</span>
					</div>
					<div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-light">
						<span>{formatElapsed(runtime.started_at, runtime.exited_at)}</span>
						{runtime.job_run_id && <span>· 自动化任务</span>}
						{runtime.exit_code !== null && (
							<span>· 退出码 {runtime.exit_code}</span>
						)}
					</div>
				</div>

				<div className="flex items-center gap-0.5 shrink-0">
					{runtime.pty_id && onOpenTerminal && (
						<button
							type="button"
							onClick={() => onOpenTerminal(runtime.pty_id as string)}
							title="查看终端"
							className="p-1.5 rounded-lg text-text-light hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40 transition duration-150"
						>
							<Terminal className="w-3.5 h-3.5" strokeWidth={1.6} />
						</button>
					)}
					{!finished && (
						<button
							type="button"
							onClick={onAbort}
							title="中止"
							className="p-1.5 rounded-lg text-text-light hover:text-error hover:bg-error-muted transition duration-150"
						>
							<Ban className="w-3.5 h-3.5" strokeWidth={1.6} />
						</button>
					)}
				</div>
			</div>

			{/* 失败详情：原文照贴，用户能自己判断是不是误判 */}
			{runtime.failure && failureMeta && (
				<div className="mt-2.5 rounded-lg bg-error-muted px-2.5 py-2">
					<div className="flex items-center gap-1.5">
						<AlertTriangle
							className="w-3 h-3 text-error shrink-0"
							strokeWidth={1.8}
						/>
						<span className="text-[10.5px] font-medium text-error">
							{failureMeta.label}
						</span>
						<span className="text-[9.5px] text-text-light">
							{failureMeta.retryable ? "可自动重试" : "重试无效"}
						</span>
					</div>
					<pre className="mt-1.5 text-[9.5px] leading-relaxed text-text-muted font-mono whitespace-pre-wrap break-all max-h-20 overflow-y-auto scrollbar-hide">
						{runtime.failure.evidence}
					</pre>
				</div>
			)}

			{/* 输出尾巴：让人一眼看出它现在在干嘛 */}
			{!runtime.failure && runtime.tail.trim() && (
				<pre className="mt-2 text-[9.5px] leading-relaxed text-text-light font-mono whitespace-pre-wrap break-all max-h-16 overflow-hidden">
					{runtime.tail.trim().split("\n").slice(-3).join("\n")}
				</pre>
			)}
		</div>
	);
}
