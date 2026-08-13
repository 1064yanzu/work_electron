// 任务进度可视化组件
// 展示任务执行的整体进度、阶段状态和工具调用统计

import { useRef } from "react";
import {
	Activity,
	AlertCircle,
	CheckCircle2,
	Circle,
	Clock,
	Hammer,
} from "lucide-react";
import { useAgentStoreSelector } from "../../lib/agent/store";
import { EASE, useGsapMotion } from "../../lib/motion";
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
			return <CheckCircle2 className="w-4 h-4 text-success" />;
		case "running":
			return (
				<div className="w-4 h-4 rounded-full border-2 border-focus border-t-transparent animate-spin" />
			);
		case "skipped":
			return <Circle className="w-4 h-4 text-text-light" />;
		default:
			return <Circle className="w-4 h-4 text-text-light" />;
	}
}

// 进度环形组件
//
// 环的填充与中心数字走同一次 GSAP 补间：CSS transition 只能推动
// strokeDashoffset，数字得靠 React 每次 setState 重渲染才会变，
// 两者节奏对不上（环平滑滑过去、数字一格一格跳）。
// 交给 GSAP 之后，onUpdate 里同时写 dashoffset 和 textContent，
// 一次补间两个输出，而且**完全不产生重渲染**。
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

	const circleRef = useRef<SVGCircleElement>(null);
	const labelRef = useRef<HTMLSpanElement>(null);
	// 上一帧的百分比：补间要从"现在画到哪儿"开始，而不是每次从 0 重来
	const shownRef = useRef(progress);

	useGsapMotion(
		({ gsap, dur }) => {
			const circle = circleRef.current;
			const label = labelRef.current;
			const from = shownRef.current;
			if (from === progress) return;

			const state = { value: from };
			gsap.to(state, {
				value: progress,
				duration: dur(0.6),
				ease: EASE.outExpo,
				onUpdate: () => {
					shownRef.current = state.value;
					if (circle) {
						circle.style.strokeDashoffset = String(
							circumference - (state.value / 100) * circumference,
						);
					}
					if (label) label.textContent = `${Math.round(state.value)}%`;
				},
				onComplete: () => {
					shownRef.current = progress;
				},
			});
		},
		{ dependencies: [progress, circumference], runInReduced: true },
	);

	return (
		<div className="relative" style={{ width: size, height: size }}>
			{/* 背景圆 */}
			<svg className="transform -rotate-90" width={size} height={size}>
				<circle
					className="text-warm-200"
					strokeWidth={strokeWidth}
					stroke="currentColor"
					fill="transparent"
					r={radius}
					cx={size / 2}
					cy={size / 2}
				/>
				{/* 进度圆 */}
				<circle
					ref={circleRef}
					className="text-focus"
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
				<span
					ref={labelRef}
					className="text-sm font-semibold text-text-secondary"
				>
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
							"flex items-center gap-3 px-3 py-2 rounded-lg transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250",
							isActive && "bg-focus/8 ring-1 ring-focus/30",
							status === "completed" && !isActive && "bg-success-muted/50",
						)}
					>
						<PhaseStatusIcon status={status} />
						<span className="text-lg">{config.emoji}</span>
						<span
							className={cn(
								"text-sm font-medium flex-1",
								isActive && "text-focus dark:text-focus",
								status === "completed" && !isActive && "text-success",
								status === "pending" && "text-text-light",
							)}
						>
							{config.label}
						</span>
						{isActive && (
							<span className="text-xs text-focus animate-pulse">进行中</span>
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
					<CheckCircle2 className="w-3.5 h-3.5 text-success" />
				</div>
				{stats.failed > 0 && (
					<div className="flex items-center gap-1">
						<span className="text-sm font-medium text-error">
							{stats.failed}
						</span>
						<AlertCircle className="w-3.5 h-3.5 text-error" />
					</div>
				)}
				<span className="text-xs text-text-light">/ {stats.total} 次</span>
			</div>
		</div>
	);
}

// 主组件
export default function TaskProgress() {
	const taskProgress = useAgentStoreSelector((s) => s.taskProgress);
	const isExecuting = useAgentStoreSelector((s) => s.isExecuting);
	const currentTask = useAgentStoreSelector((s) => s.currentTask);
	const isWaitingForLLM = useAgentStoreSelector((s) => s.isWaitingForLLM);

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
							isExecuting ? "text-focus" : "text-text-light",
						)}
					/>
					{isExecuting && (
						<span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-focus rounded-full animate-pulse" />
					)}
				</div>
				<div className="flex-1">
					<h3 className="text-sm font-semibold text-text-secondary">
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
				{/* 等待态保持安静：单 spinner + 一行文字（渐变底和弹跳点是噪音） */}
				{isWaitingForLLM && (
					<div className="flex items-center gap-3 px-3 py-2.5 bg-info-muted rounded-lg border border-info/16">
						<div className="w-4 h-4 rounded-full border-2 border-info border-t-transparent animate-spin shrink-0" />
						<p className="text-sm font-medium text-info flex-1 min-w-0 truncate">
							正在等待 AI 响应…
						</p>
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
	const taskProgress = useAgentStoreSelector((s) => s.taskProgress);
	const isExecuting = useAgentStoreSelector((s) => s.isExecuting);

	if (!taskProgress || !isExecuting) {
		return null;
	}

	return (
		<div className="flex items-center gap-3 px-3 py-2 bg-focus/8 rounded-full">
			<div className="w-4 h-4 rounded-full border-2 border-focus border-t-transparent animate-spin" />
			<div className="flex-1 min-w-0">
				<div className="h-1.5 bg-warm-300 rounded-full overflow-hidden">
					<div
						className="h-full bg-focus rounded-full transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-500"
						style={{ width: `${taskProgress.overallProgress}%` }}
					/>
				</div>
			</div>
			<span className="text-xs font-medium text-focus dark:text-focus">
				{Math.round(taskProgress.overallProgress)}%
			</span>
		</div>
	);
}

export { TaskProgress };
