import {
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Circle,
	ListTodo,
	Loader2,
	PauseCircle,
	XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useAgentStore } from "../../lib/agent/store";
import type { AgentTask, AgentTaskStep } from "../../lib/agent/types";
import { cn } from "../../lib/utils";

function findTaskById(
	taskId: string,
	current: AgentTask | null,
	history: AgentTask[],
): AgentTask | null {
	if (current?.id === taskId) return current;
	const t = history.find((x) => x.id === taskId);
	return t || null;
}

function StatusIcon({ status }: { status: AgentTaskStep["status"] }) {
	if (status === "running")
		return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
	if (status === "completed")
		return <CheckCircle2 className="w-4 h-4 text-green-500" />;
	if (status === "error") return <XCircle className="w-4 h-4 text-red-500" />;
	if (status === "cancelled")
		return <PauseCircle className="w-4 h-4 text-zinc-400" />;
	return <Circle className="w-4 h-4 text-zinc-300" />;
}

function statusLabel(status: AgentTaskStep["status"]): string {
	if (status === "running") return "进行中";
	if (status === "completed") return "已完成";
	if (status === "error") return "出错";
	if (status === "cancelled") return "已取消";
	return "待开始";
}

export function TaskListInline({ taskId }: { taskId: string }) {
	const [expanded, setExpanded] = useState(true);
	const { currentTask, taskHistory } = useAgentStore();

	const task = useMemo(
		() => findTaskById(taskId, currentTask, taskHistory),
		[taskId, currentTask, taskHistory],
	);
	const steps = task?.steps || [];

	const stats = useMemo(() => {
		const total = steps.length;
		const done = steps.filter((s) => s.status === "completed").length;
		const running = steps.some((s) => s.status === "running");
		const hasError = steps.some((s) => s.status === "error");
		return { total, done, running, hasError };
	}, [steps]);

	if (!task) return null;
	if (!steps || steps.length === 0) return null;

	return (
		<div className="rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/40 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/60 dark:hover:bg-zinc-900/30 transition-colors"
			>
				<div className="flex items-center gap-2 min-w-0">
					<div className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
						<ListTodo className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
					</div>
					<div className="min-w-0">
						<div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
							任务列表
						</div>
						<div className="text-[11px] text-zinc-400">
							<span className="font-medium text-zinc-600 dark:text-zinc-200">
								{stats.done}
							</span>
							<span className="mx-1">/</span>
							<span>{stats.total}</span>
							<span className="ml-1">已完成</span>
							{stats.running ? (
								<span className="ml-2 text-blue-500">进行中</span>
							) : null}
							{stats.hasError ? (
								<span className="ml-2 text-red-500">有错误</span>
							) : null}
						</div>
					</div>
				</div>
				{expanded ? (
					<ChevronDown className="w-4 h-4 text-zinc-400" />
				) : (
					<ChevronRight className="w-4 h-4 text-zinc-400" />
				)}
			</button>

			{expanded ? (
				<div className="px-3 pb-3">
					<div className="divide-y divide-black/5 dark:divide-white/5 rounded-xl bg-white/60 dark:bg-zinc-900/30 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
						{steps.map((step, idx) => (
							<div key={step.id} className="px-3 py-2.5 flex items-start gap-3">
								<div
									className={cn(
										"w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0",
										step.status === "completed"
											? "bg-green-50 text-green-600 dark:bg-green-900/20"
											: step.status === "running"
												? "bg-blue-50 text-blue-600 dark:bg-blue-900/30"
												: step.status === "error"
													? "bg-red-50 text-red-600 dark:bg-red-900/20"
													: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70",
									)}
								>
									{idx + 1}
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex items-start gap-2">
										<div className="mt-0.5">
											<StatusIcon status={step.status} />
										</div>
										<div className="min-w-0 flex-1">
											<div className="text-sm text-zinc-800 dark:text-zinc-100 break-words leading-5">
												{step.title}
											</div>
											{step.description ? (
												<div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
													{step.description}
												</div>
											) : null}
											<div className="text-[11px] text-zinc-400 mt-0.5">
												{statusLabel(step.status)}
											</div>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
