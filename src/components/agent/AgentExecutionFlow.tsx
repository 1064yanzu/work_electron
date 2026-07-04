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
			<div className="w-8 h-8 rounded-full bg-success/16 dark:bg-emerald-900/30 flex items-center justify-center ring-2 ring-emerald-200 dark:ring-emerald-800">
				<CheckCircle2 className="w-4 h-4 text-success dark:text-success" />
			</div>
		);
	}
	if (status === "error") {
		return (
			<div className="w-8 h-8 rounded-full bg-error/16 dark:bg-red-900/30 flex items-center justify-center ring-2 ring-red-200 dark:ring-red-800">
				<AlertCircle className="w-4 h-4 text-error dark:text-error" />
			</div>
		);
	}
	if (status === "running") {
		return (
			<div className="w-8 h-8 rounded-full bg-terracotta/15 flex items-center justify-center ring-2 ring-terracotta/30 relative">
				<div className="w-4 h-4 rounded-full border-2 border-terracotta border-t-transparent animate-spin" />
				<div className="absolute inset-0 rounded-full bg-terracotta/20 animate-pulse" />
			</div>
		);
	}
	return (
		<div className="w-8 h-8 rounded-full bg-warm-200 flex items-center justify-center ring-2 ring-zinc-200 dark:ring-zinc-700">
			<span className="text-xs font-semibold text-text-muted">{index + 1}</span>
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
									? "bg-gradient-to-b from-terracotta to-terracotta/30"
									: "bg-warm-300 dark:bg-cream-700",
						)}
					/>
				)}
			</div>
			<div className="flex-1 pb-4">
				<div
					className={cn(
						"rounded-lg p-3 transition-all",
						step.status === "running"
							? "bg-terracotta/[0.08] dark:bg-terracotta/[0.12] ring-1 ring-terracotta/20 dark:ring-terracotta/30"
							: step.status === "completed"
								? "bg-success/8 dark:bg-emerald-900/10 ring-1 ring-emerald-200/30 dark:ring-emerald-800/30"
								: step.status === "error"
									? "bg-error/[0.04] dark:bg-red-900/10 ring-1 ring-red-200/30 dark:ring-red-800/30"
									: "bg-warm-50/50 ring-1 ring-zinc-200/30 dark:ring-zinc-700/30",
					)}
				>
					<div className="flex items-start gap-2 mb-2">
						<div className="flex-1 min-w-0">
							<div className="text-sm font-semibold text-text-primary truncate">
								{step.title}
							</div>
							{step.description && (
								<div className="text-xs text-text-muted mt-1 line-clamp-2">
									{step.description}
								</div>
							)}
						</div>
						{step.status === "running" && (
							<span className="text-[10px] font-medium px-2 py-1 rounded-full bg-terracotta/20 text-terracotta dark:text-terracotta whitespace-nowrap">
								进行中
							</span>
						)}
					</div>
					{toolCount > 0 && (
						<div className="flex items-center gap-1 text-[11px] text-text-secondary">
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
		<div className="mt-4 pt-4 border-t border-border">
			<div className="flex items-center gap-2 mb-3">
				<Zap className="w-4 h-4 text-text-muted" />
				<span className="text-xs font-semibold text-text-secondary uppercase">
					工具调用链
				</span>
				<span className="ml-auto text-[10px] text-text-light">
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
									? "bg-success/16 dark:bg-emerald-900/30 text-success dark:text-success"
									: call.status === "running"
										? "bg-terracotta/15 text-terracotta ring-1 ring-terracotta/30"
										: call.status === "error"
											? "bg-error/16 dark:bg-red-900/30 text-error dark:text-error"
											: "bg-warm-200 text-text-secondary",
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
							<ChevronRight className="w-3 h-3 text-text-light" />
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
					className="text-zinc-200"
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
							? "text-terracotta animate-pulse-slow"
							: progress >= 100
								? "text-success"
								: "text-focus",
					)}
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center">
				<span className="text-2xl font-bold text-text-primary">
					{Math.round(progress)}%
				</span>
				<span className="text-[10px] text-text-muted">
					{isRunning ? "运行中" : "完成"}
				</span>
			</div>
			{isRunning && (
				<div className="absolute -inset-2 rounded-full border-2 border-terracotta/30 animate-pulse" />
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
		<div className="rounded-2xl bg-surface ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			<div className="px-4 py-3 border-b border-border flex items-center gap-4">
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<Activity
							className={cn(
								"w-4 h-4 transition-colors",
								isExecuting ? "text-terracotta" : "text-text-light",
							)}
						/>
						<h3 className="text-sm font-semibold text-text-primary">
							执行计划
						</h3>
						{isExecuting && (
							<span className="text-[10px] px-2 py-0.5 rounded-full bg-terracotta/15 text-terracotta">
								运行中
							</span>
						)}
					</div>
					<p className="text-xs text-text-muted truncate mt-1">{task.title}</p>
				</div>
				<OverallProgressRing
					progress={overallProgress}
					isRunning={isExecuting}
				/>
			</div>

			<div className="p-4 space-y-4">
				<div>
					<div className="flex items-center gap-2 mb-3">
						<TrendingUp className="w-4 h-4 text-text-muted" />
						<span className="text-xs font-semibold text-text-secondary uppercase">
							执行步骤
						</span>
						<span className="ml-auto text-[10px] text-text-light">
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

				<div className="pt-2 border-t border-border grid grid-cols-4 gap-2">
					<div className="text-center">
						<div className="text-lg font-bold text-text-primary">
							{toolStats.total}
						</div>
						<div className="text-[10px] text-text-muted">总调用</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-success dark:text-success">
							{toolStats.completed}
						</div>
						<div className="text-[10px] text-text-muted">成功</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-terracotta">
							{toolStats.running}
						</div>
						<div className="text-[10px] text-text-muted">运行中</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-error dark:text-error">
							{toolStats.failed}
						</div>
						<div className="text-[10px] text-text-muted">失败</div>
					</div>
				</div>
			</div>
		</div>
	);
});

export default AgentExecutionFlow;
