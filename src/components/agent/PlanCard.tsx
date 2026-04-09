/**
 * PlanCard - 执行计划卡片
 * 在 Copilot 侧边栏消息流中展示 Agent 输出的执行计划
 */

import {
	CheckCircle2,
	ClipboardList,
	Loader2,
	MessageSquare,
	Play,
	X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { PlanStepItem, type PlanStep } from "./PlanStepItem";

/** 计划整体状态 */
type PlanStatus = "draft" | "confirmed" | "executing" | "completed" | "rejected";

interface PlanCardProps {
	plan: {
		id: string;
		taskDescription: string;
		steps: PlanStep[];
		status: PlanStatus;
	};
	onConfirm?: () => void;
	onReject?: () => void;
	onModify?: (feedback: string) => void;
}

/** 状态标签配置 */
const STATUS_LABEL: Record<
	PlanStatus,
	{ text: string; className: string }
> = {
	draft: {
		text: "待确认",
		className:
			"bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
	},
	confirmed: {
		text: "已确认",
		className:
			"bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
	},
	executing: {
		text: "执行中",
		className:
			"bg-[#D96C46]/10 dark:bg-[#D96C46]/20 text-[#D96C46]",
	},
	completed: {
		text: "已完成",
		className:
			"bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
	},
	rejected: {
		text: "已拒绝",
		className:
			"bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
	},
};

/** 进度条 */
function PlanProgressBar({ steps }: { steps: PlanStep[] }) {
	const total = steps.length;
	if (total === 0) return null;

	const completed = steps.filter((s) => s.status === "completed").length;
	const executing = steps.filter((s) => s.status === "executing").length;
	const rejected = steps.filter((s) => s.status === "rejected").length;

	const completedPct = (completed / total) * 100;
	const executingPct = (executing / total) * 100;
	const rejectedPct = (rejected / total) * 100;

	return (
		<div className="px-4 pb-3">
			<div className="flex items-center gap-2 mb-1.5">
				<span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
					{completed}/{total} 步已完成
				</span>
			</div>
			<div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
				{completedPct > 0 && (
					<div
						className="h-full bg-emerald-500 transition-all duration-500 ease-out"
						style={{ width: `${completedPct}%` }}
					/>
				)}
				{executingPct > 0 && (
					<div
						className="h-full bg-[#D96C46] animate-pulse transition-all duration-500 ease-out"
						style={{ width: `${executingPct}%` }}
					/>
				)}
				{rejectedPct > 0 && (
					<div
						className="h-full bg-red-400 transition-all duration-500 ease-out"
						style={{ width: `${rejectedPct}%` }}
					/>
				)}
			</div>
		</div>
	);
}

export function PlanCard({ plan, onConfirm, onReject, onModify }: PlanCardProps) {
	const [modifyMode, setModifyMode] = useState(false);
	const [feedback, setFeedback] = useState("");

	const statusConfig = STATUS_LABEL[plan.status];
	const isDraft = plan.status === "draft";
	const isExecuting = plan.status === "executing";
	const isCompleted = plan.status === "completed";

	return (
		<div
			className={cn(
				"relative flex flex-col rounded-xl border overflow-hidden transition-all duration-300",
				isExecuting
					? "bg-white/80 dark:bg-zinc-900/80 border-[#D96C46]/30 shadow-lg shadow-[#D96C46]/5 ring-1 ring-[#D96C46]/20"
					: isCompleted
						? "bg-emerald-50/30 dark:bg-emerald-900/5 border-emerald-200 dark:border-emerald-800/30"
						: "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800",
			)}
		>
			{/* 执行中呼吸动画 */}
			{isExecuting && (
				<div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
					<div className="absolute inset-0 bg-gradient-to-r from-[#D96C46]/5 via-amber-500/5 to-[#D96C46]/5 animate-pulse" />
				</div>
			)}

			{/* 头部 */}
			<div className="relative z-10 flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
				<div
					className={cn(
						"flex items-center justify-center w-8 h-8 rounded-lg",
						isExecuting
							? "bg-[#D96C46]/10 text-[#D96C46]"
							: isCompleted
								? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
								: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
					)}
				>
					{isExecuting ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : isCompleted ? (
						<CheckCircle2 className="w-4 h-4" />
					) : (
						<ClipboardList className="w-4 h-4" />
					)}
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
							执行计划
						</span>
						<span
							className={cn(
								"px-1.5 py-0.5 rounded text-[10px] font-medium",
								statusConfig.className,
							)}
						>
							{statusConfig.text}
						</span>
					</div>
					<p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
						{plan.taskDescription}
					</p>
				</div>
			</div>

			{/* 进度条（执行中或已完成时显示） */}
			{(isExecuting || isCompleted) && (
				<PlanProgressBar steps={plan.steps} />
			)}

			{/* 步骤列表 */}
			<div className="relative z-10 px-1 py-2 space-y-0.5 max-h-80 overflow-y-auto">
				{plan.steps.map((step, index) => (
					<PlanStepItem key={step.id} step={step} index={index} />
				))}
			</div>

			{/* 操作按钮（仅 draft 状态） */}
			{isDraft && (
				<div className="relative z-10 border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
					{modifyMode ? (
						<div className="space-y-2">
							<textarea
								value={feedback}
								onChange={(e) => setFeedback(e.target.value)}
								placeholder="描述你想修改的内容..."
								className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#D96C46]/30"
								rows={2}
							/>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => {
										if (feedback.trim()) onModify?.(feedback.trim());
										setModifyMode(false);
										setFeedback("");
									}}
									disabled={!feedback.trim()}
									className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#D96C46] text-white hover:bg-[#c25e3b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								>
									<MessageSquare className="w-3.5 h-3.5" />
									发送修改意见
								</button>
								<button
									type="button"
									onClick={() => {
										setModifyMode(false);
										setFeedback("");
									}}
									className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
								>
									取消
								</button>
							</div>
						</div>
					) : (
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={onConfirm}
								className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-[#D96C46] text-white hover:bg-[#c25e3b] transition-colors shadow-sm"
							>
								<Play className="w-3.5 h-3.5" />
								确认执行
							</button>
							<button
								type="button"
								onClick={() => setModifyMode(true)}
								className="px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
							>
								修改
							</button>
							<button
								type="button"
								onClick={onReject}
								className="px-3 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
							>
								<X className="w-4 h-4" />
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export type { PlanCardProps, PlanStatus };
