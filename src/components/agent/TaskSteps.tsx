import {
	CheckCircle2,
	Circle,
	Loader2,
	PauseCircle,
	XCircle,
} from "lucide-react";
import type { AgentTaskStep } from "../../lib/agent/types";
import { cn } from "../../lib/utils";

const statusLabel: Record<AgentTaskStep["status"], string> = {
	pending: "待开始",
	running: "进行中",
	completed: "已完成",
	error: "出错",
	cancelled: "已取消",
};

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

export function TaskSteps({ steps }: { steps?: AgentTaskStep[] }) {
	if (!steps || steps.length === 0) return null;

	return (
		<div className="rounded-xl bg-white/60 dark:bg-zinc-900/40 ring-1 ring-black/5 dark:ring-white/10">
			<div className="px-3 py-2.5 border-b border-black/5 dark:border-white/5">
				<div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
					任务清单
				</div>
				<div className="text-[11px] text-zinc-400">
					逐步执行，每完成一项自动更新状态
				</div>
			</div>
			<div className="divide-y divide-black/5 dark:divide-white/5">
				{steps.map((step, idx) => (
					<div key={step.id} className="px-3 py-2.5 flex items-start gap-3">
						<div
							className={cn(
								"w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0",
								step.status === "completed"
									? "bg-green-50 text-green-600 dark:bg-green-900/20"
									: step.status === "running"
										? "bg-blue-50 text-blue-600 dark:bg-blue-900/30"
										: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70",
							)}
						>
							{idx + 1}
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<StatusIcon status={step.status} />
								<div className="text-sm text-zinc-800 dark:text-zinc-100 break-words leading-5">
									{step.title}
								</div>
							</div>
							{step.description ? (
								<div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
									{step.description}
								</div>
							) : null}
							<div className="text-[11px] text-zinc-400 mt-0.5">
								{statusLabel[step.status]}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export default TaskSteps;
