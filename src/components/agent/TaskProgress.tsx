// 任务进度可视化组件
// 展示任务执行的整体进度、阶段状态和工具调用统计

import {
	Activity,
	AlertCircle,
	CheckCircle2,
	Circle,
	Clock,
	Hammer,
} from "lucide-react";
import { useAgentStore } from "../../lib/agent/store";
import {
	type TaskProgress as TaskProgressType,
	THINKING_PHASE_CONFIG,
	type ThinkingPhase,
} from "../../lib/agent/types";
import { cn } from "../../lib/utils";

// 阶段状态图标
function PhaseStatusIcon({
	status,
}: {
	status: "pending" | "running" | "completed" | "skipped";
}) {
	switch (status) {
		case "completed":
			return <CheckCircle2 className="w-4 h-4 text-green-500" />;
		case "running":
			return (
				<div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
			);
		case "skipped":
			return <Circle className="w-4 h-4 text-text-light" />;
		default:
			return <Circle className="w-4 h-4 text-text-light" />;
	}
}

// 进度环形组件
function ProgressRing({
	progress,
	size = 48,
	strokeWidth = 4,
}: {
	progress: number;
	size?: number;
	strokeWidth?: number;
}) {
	const radius = (size - strokeWidth) / 2;
	const circumference = radius * 2 * Math.PI;
	const offset = circumference - (progress / 100) * circumference;

	return (
		<div className="relative" style={{ width: size, height: size }}>
			{/* 背景圆 */}
			<svg className="transform -rotate-90" width={size} height={size}>
				<circle
					className="text-zinc-200"
					strokeWidth={strokeWidth}
					stroke="currentColor"
					fill="transparent"
					r={radius}
					cx={size / 2}
					cy={size / 2}
				/>
				{/* 进度圆 */}
				<circle
					className="text-blue-500 transition-all duration-500 ease-out"
					strokeWidth={strokeWidth}
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					stroke="currentColor"
					fill="transparent"
					r={radius}
					cx={size / 2}
					cy={size / 2}
				/>
			</svg>
			{/* 中心文字 */}
			<div className="absolute inset-0 flex items-center justify-center">
				<span className="text-sm font-semibold text-text-secondary dark:text-zinc-200">
					{Math.round(progress)}%
				</span>
			</div>
		</div>
	);
}

// 阶段进度条
function PhaseProgressBar({ progress }: { progress: TaskProgressType }) {
	const phases: ThinkingPhase[] = [
		"analyzing",
		"planning",
		"executing",
		"reflecting",
		"concluding",
	];

	return (
		<div className="space-y-2">
			{phases.map((phase) => {
				const config = THINKING_PHASE_CONFIG[phase];
				const status = progress.phaseStatus[phase];
				const isActive = progress.currentPhase === phase;

				return (
					<div
						key={phase}
						className={cn(
							"flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300",
							isActive &&
								"bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800",
							status === "completed" &&
								!isActive &&
								"bg-green-50/50 dark:bg-green-900/10",
						)}
					>
						<PhaseStatusIcon status={status} />
						<span className="text-lg">{config.emoji}</span>
						<span
							className={cn(
								"text-sm font-medium flex-1",
								isActive && "text-blue-600 dark:text-blue-400",
								status === "completed" &&
									!isActive &&
									"text-green-600 dark:text-green-400",
								status === "pending" && "text-text-light",
							)}
						>
							{config.label}
						</span>
						{isActive && (
							<span className="text-xs text-blue-500 animate-pulse">
								进行中
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

// 工具调用统计
function ToolCallStats({
	stats,
}: {
	stats: { total: number; completed: number; failed: number };
}) {
	return (
		<div className="flex items-center gap-4 p-3 bg-warm-50/50 rounded-lg">
			<div className="flex items-center gap-2">
				<Hammer className="w-4 h-4 text-text-light" />
				<span className="text-sm text-text-muted">工具调用</span>
			</div>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1">
					<span className="text-sm font-medium text-text-secondary">
						{stats.completed}
					</span>
					<CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
				</div>
				{stats.failed > 0 && (
					<div className="flex items-center gap-1">
						<span className="text-sm font-medium text-red-500">
							{stats.failed}
						</span>
						<AlertCircle className="w-3.5 h-3.5 text-red-500" />
					</div>
				)}
				<span className="text-xs text-text-light">/ {stats.total} 次</span>
			</div>
		</div>
	);
}

// 主组件
export default function TaskProgress() {
	const { taskProgress, isExecuting, currentTask, isWaitingForLLM } =
		useAgentStore();

	// 没有进度数据时不显示
	if (!taskProgress || !currentTask) {
		return null;
	}

	// 格式化剩余时间
	const formatTime = (seconds?: number) => {
		if (!seconds || seconds <= 0) return null;
		if (seconds < 60) return `约 ${Math.ceil(seconds)} 秒`;
		return `约 ${Math.ceil(seconds / 60)} 分钟`;
	};

	return (
		<div className="rounded-xl bg-surface ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			{/* Header */}
			<div className="px-4 py-3 border-b border-border flex items-center gap-3">
				<div className="relative">
					<Activity
						className={cn(
							"w-5 h-5",
							isExecuting ? "text-blue-500" : "text-text-light",
						)}
					/>
					{isExecuting && (
						<span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
					)}
				</div>
				<div className="flex-1">
					<h3 className="text-sm font-semibold text-text-secondary dark:text-zinc-200">
						任务进度
					</h3>
					{taskProgress.currentOperation && (
						<p className="text-xs text-text-light truncate mt-0.5">
							{taskProgress.currentOperation}
						</p>
					)}
				</div>

				{/* 进度环 */}
				<ProgressRing
					progress={taskProgress.overallProgress}
					size={44}
					strokeWidth={4}
				/>
			</div>

			{/* Content */}
			<div className="p-4 space-y-4">
				{/* 等待 AI 响应提示 */}
				{isWaitingForLLM && (
					<div className="flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
						<div className="relative flex items-center justify-center">
							<div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
							<div className="absolute w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-blue-600 dark:text-blue-400">
								正在等待 AI 响应...
							</p>
							<p className="text-xs text-blue-500/70 dark:text-blue-400/70 mt-0.5">
								请稍候，AI 正在思考中
							</p>
						</div>
						{/* 三点波浪动画 */}
						<div className="flex gap-1">
							<span
								className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
								style={{ animationDelay: "0ms" }}
							/>
							<span
								className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
								style={{ animationDelay: "150ms" }}
							/>
							<span
								className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
								style={{ animationDelay: "300ms" }}
							/>
						</div>
					</div>
				)}

				{/* 阶段进度 */}
				<PhaseProgressBar progress={taskProgress} />

				{/* 工具调用统计 */}
				{taskProgress.toolCallStats.total > 0 && (
					<ToolCallStats stats={taskProgress.toolCallStats} />
				)}

				{/* 预估剩余时间 */}
				{taskProgress.estimatedTimeRemaining &&
					taskProgress.estimatedTimeRemaining > 0 && (
						<div className="flex items-center gap-2 text-xs text-text-light">
							<Clock className="w-3.5 h-3.5" />
							<span>{formatTime(taskProgress.estimatedTimeRemaining)}</span>
						</div>
					)}
			</div>
		</div>
	);
}

// 紧凑版进度指示器（用于顶部栏等场景）
export function TaskProgressCompact() {
	const { taskProgress, isExecuting } = useAgentStore();

	if (!taskProgress || !isExecuting) {
		return null;
	}

	return (
		<div className="flex items-center gap-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full">
			<div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
			<div className="flex-1 min-w-0">
				<div className="h-1.5 bg-warm-300 dark:bg-zinc-700 rounded-full overflow-hidden">
					<div
						className="h-full bg-blue-500 rounded-full transition-all duration-500"
						style={{ width: `${taskProgress.overallProgress}%` }}
					/>
				</div>
			</div>
			<span className="text-xs font-medium text-blue-600 dark:text-blue-400">
				{Math.round(taskProgress.overallProgress)}%
			</span>
		</div>
	);
}

export { TaskProgress };
