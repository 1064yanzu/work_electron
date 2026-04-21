/**
 * Agent 执行流程可视化组件
 * 根据 Agent 的实际规划步骤动态展示执行过程
 */

import {
	Activity,
	AlertCircle,
	CheckCircle2,
	ChevronRight,
	Loader2,
	Zap,
	TrendingUp,
} from "lucide-react";
import { memo, useMemo } from "react";
import { cn } from "../../lib/utils";
import type { AgentTask, AgentTaskStep, ToolCall } from "../../lib/agent/types";

// ============ 子组件 ============

/** 步骤状态指示器 */
const StepIndicator = memo(function StepIndicator({
	status,
	index,
}: {
	status: AgentTaskStep["status"];
	index: number;
}) {
	if (status === "completed") {
		return (
			<div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center ring-2 ring-emerald-200 dark:ring-emerald-800">
				<CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
			</div>
		);
	}
	if (status === "error") {
		return (
			<div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center ring-2 ring-red-200 dark:ring-red-800">
				<AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
			</div>
		);
	}
	if (status === "running") {
		return (
			<div className="w-8 h-8 rounded-full bg-[#D96C46]/15 flex items-center justify-center ring-2 ring-[#D96C46]/30 relative">
				<div className="w-4 h-4 rounded-full border-2 border-[#D96C46] border-t-transparent animate-spin" />
				<div className="absolute inset-0 rounded-full bg-[#D96C46]/20 animate-pulse" />
			</div>
		);
	}
	return (
		<div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center ring-2 ring-zinc-200 dark:ring-zinc-700">
			<span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
				{index + 1}
			</span>
		</div>
	);
});

/** 单个步骤卡片 */
const StepCard = memo(function StepCard({
	step,
	index,
	isLast,
	toolCount,
}: {
	step: AgentTaskStep;
	index: number;
	isLast: boolean;
	toolCount: number;
}) {
	return (
		<div className="flex gap-3">
			<div className="flex flex-col items-center gap-2">
				<StepIndicator status={step.status} index={index} />
				{!isLast && (
					<div
						className={cn(
							"w-1 flex-1 min-h-12 rounded-full transition-all duration-500",
							step.status === "completed"
								? "bg-emerald-300 dark:bg-emerald-700"
								: step.status === "running"
									? "bg-gradient-to-b from-[#D96C46] to-[#D96C46]/30"
									: "bg-zinc-200 dark:bg-zinc-700",
						)}
					/>
				)}
			</div>
			<div className="flex-1 pb-4">
				<div
					className={cn(
						"rounded-lg p-3 transition-all",
						step.status === "running"
							? "bg-[#D96C46]/[0.08] dark:bg-[#D96C46]/[0.12] ring-1 ring-[#D96C46]/20 dark:ring-[#D96C46]/30"
							: step.status === "completed"
								? "bg-emerald-50/50 dark:bg-emerald-900/10 ring-1 ring-emerald-200/30 dark:ring-emerald-800/30"
								: step.status === "error"
									? "bg-red-50/50 dark:bg-red-900/10 ring-1 ring-red-200/30 dark:ring-red-800/30"
									: "bg-zinc-50/50 dark:bg-zinc-800/30 ring-1 ring-zinc-200/30 dark:ring-zinc-700/30",
					)}
				>
					<div className="flex items-start gap-2 mb-2">
						<div className="flex-1 min-w-0">
							<div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
								{step.title}
							</div>
							{step.description && (
								<div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
									{step.description}
								</div>
							)}
						</div>
						{step.status === "running" && (
							<span className="text-[10px] font-medium px-2 py-1 rounded-full bg-[#D96C46]/20 text-[#D96C46] dark:text-[#D96C46] whitespace-nowrap">
								进行中
							</span>
						)}
					</div>
					{toolCount > 0 && (
						<div className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
							<Zap className="w-3 h-3" />
							<span>{toolCount} 个工具</span>
						</div>
					)}
				</div>
			</div>
		</div>
	);
});

/** 工具调用链 */
const ToolCallChain = memo(function ToolCallChain({
	toolCalls,
}: {
	toolCalls: ToolCall[];
}) {
	if (toolCalls.length === 0) return null;
	const recentCalls = toolCalls.slice(-5);
	return (
		<div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
			<div className="flex items-center gap-2 mb-3">
				<Zap className="w-4 h-4 text-zinc-500" />
				<span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">
					工具调用链
				</span>
				<span className="ml-auto text-[10px] text-zinc-400">
					{toolCalls.length} 次
				</span>
			</div>
			<div className="flex items-center gap-1.5 flex-wrap">
				{recentCalls.map((call, idx) => (
					<div key={call.id} className="flex items-center gap-1.5">
						<div
							className={cn(
								"px-2 py-1 rounded-full text-[10px] font-medium flex items-center gap-1",
								call.status === "completed"
									? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
									: call.status === "running"
										? "bg-[#D96C46]/15 text-[#D96C46] ring-1 ring-[#D96C46]/30"
										: call.status === "error"
											? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
											: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
							)}
						>
							{call.status === "running" && (
								<Loader2 className="w-2.5 h-2.5 animate-spin" />
							)}
							{call.status === "completed" && (
								<CheckCircle2 className="w-2.5 h-2.5" />
							)}
							{call.status === "error" && (
								<AlertCircle className="w-2.5 h-2.5" />
							)}
							<span className="truncate max-w-[80px]">{call.name}</span>
						</div>
						{idx < recentCalls.length - 1 && (
							<ChevronRight className="w-3 h-3 text-zinc-300 dark:text-zinc-600" />
						)}
					</div>
				))}
			</div>
		</div>
	);
});

/** 整体进度环 */
const OverallProgressRing = memo(function OverallProgressRing({
	progress,
	isRunning,
}: {
	progress: number;
	isRunning: boolean;
}) {
	const radius = 28;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (progress / 100) * circumference;
	return (
		<div className="relative w-20 h-20 flex-shrink-0">
			<svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
				<circle
					cx="40"
					cy="40"
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					className="text-zinc-200 dark:text-zinc-700"
				/>
				<circle
					cx="40"
					cy="40"
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					className={cn(
						"transition-all duration-500",
						isRunning
							? "text-[#D96C46] animate-pulse-slow"
							: progress >= 100
								? "text-emerald-500"
								: "text-blue-500",
					)}
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center">
				<span className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
					{Math.round(progress)}%
				</span>
				<span className="text-[10px] text-zinc-500 dark:text-zinc-400">
					{isRunning ? "运行中" : "完成"}
				</span>
			</div>
			{isRunning && (
				<div className="absolute -inset-2 rounded-full border-2 border-[#D96C46]/30 animate-pulse" />
			)}
		</div>
	);
});

// ============ 主组件 ============

export const AgentExecutionFlow = memo(function AgentExecutionFlow({
	task,
	isExecuting,
}: {
	task: AgentTask;
	isExecuting: boolean;
}) {
	// 计算每个步骤对应的工具调用数
	const stepsWithToolCount = useMemo(() => {
		if (!task.steps || task.steps.length === 0) return [];

		return task.steps.map((step, idx) => {
			// 简单启发式：假设工具调用按顺序分配给步骤
			// 实际应该根据 toolCall 的 metadata 或时间戳来关联
			const isLastStep = idx === task.steps.length - 1;
			const toolCount = isLastStep
				? task.toolCalls.filter((t) => t.status !== "pending").length
				: 0;
			return { step, toolCount };
		});
	}, [task.steps, task.toolCalls]);

	// 计算整体进度
	const overallProgress = useMemo(() => {
		if (!task.steps || task.steps.length === 0) return 0;
		const completed = task.steps.filter((s) => s.status === "completed").length;
		return Math.round((completed / task.steps.length) * 100);
	}, [task.steps]);

	// 计算工具调用统计
	const toolStats = useMemo(
		() => ({
			total: task.toolCalls.length,
			completed: task.toolCalls.filter((t) => t.status === "completed").length,
			running: task.toolCalls.filter((t) => t.status === "running").length,
			failed: task.toolCalls.filter((t) => t.status === "error").length,
		}),
		[task.toolCalls],
	);

	// 如果没有步骤，不显示
	if (!task.steps || task.steps.length === 0) {
		return null;
	}

	return (
		<div className="rounded-2xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			<div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-4">
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<Activity
							className={cn(
								"w-4 h-4 transition-colors",
								isExecuting ? "text-[#D96C46]" : "text-zinc-400",
							)}
						/>
						<h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
							执行计划
						</h3>
						{isExecuting && (
							<span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D96C46]/15 text-[#D96C46]">
								运行中
							</span>
						)}
					</div>
					<p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-1">
						{task.title}
					</p>
				</div>
				<OverallProgressRing
					progress={overallProgress}
					isRunning={isExecuting}
				/>
			</div>

			<div className="p-4 space-y-4">
				<div>
					<div className="flex items-center gap-2 mb-3">
						<TrendingUp className="w-4 h-4 text-zinc-500" />
						<span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">
							执行步骤
						</span>
						<span className="ml-auto text-[10px] text-zinc-400">
							{task.steps.length} 步
						</span>
					</div>
					<div className="space-y-0">
						{stepsWithToolCount.map(({ step, toolCount }, idx) => (
							<StepCard
								key={step.id}
								step={step}
								index={idx}
								isLast={idx === stepsWithToolCount.length - 1}
								toolCount={toolCount}
							/>
						))}
					</div>
				</div>

				{task.toolCalls.length > 0 && (
					<ToolCallChain toolCalls={task.toolCalls} />
				)}

				<div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 grid grid-cols-4 gap-2">
					<div className="text-center">
						<div className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
							{toolStats.total}
						</div>
						<div className="text-[10px] text-zinc-500 dark:text-zinc-400">
							总调用
						</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
							{toolStats.completed}
						</div>
						<div className="text-[10px] text-zinc-500 dark:text-zinc-400">
							成功
						</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-[#D96C46]">
							{toolStats.running}
						</div>
						<div className="text-[10px] text-zinc-500 dark:text-zinc-400">
							运行中
						</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-red-600 dark:text-red-400">
							{toolStats.failed}
						</div>
						<div className="text-[10px] text-zinc-500 dark:text-zinc-400">
							失败
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});

export default AgentExecutionFlow;
