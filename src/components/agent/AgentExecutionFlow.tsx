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
import { memo, useMemo, useRef } from "react";
import { attentionPulse, breathe, EASE, useGsapMotion } from "../../lib/motion";
import { cn } from "../../lib/utils";
import type { AgentTask, AgentTaskStep, ToolCall } from "../../lib/agent/types";

// ============ 子组件 ============

/**
 * 步骤状态指示器
 *
 * 状态切换时给一下注意力提示：pending → running → completed/error
 * 是这个组件里唯一「刚刚发生了什么」的信号，光靠换颜色很容易被忽略——
 * 尤其执行流是一屏几十行的长列表，用户的视线不一定停在这一行上。
 *
 * running 态的光晕从 `animate-pulse` 换成 GSAP 呼吸并登记为装饰性动画：
 * 拖分栏时这类无限循环会自动让出帧（见 lib/motion/decorative.ts）。
 */
const StepIndicator = memo(function StepIndicator({
	status,
	index,
}: {
	status: AgentTaskStep["status"];
	index: number;
}) {
	const ringRef = useRef<HTMLDivElement>(null);

	useGsapMotion(
		({ decorative }) => {
			const element = ringRef.current;
			if (!element) return;
			if (status === "completed" || status === "error") {
				attentionPulse(element, { scale: 1.18, duration: 0.46 });
				return;
			}
			if (status === "running") {
				const halo = element.querySelector("[data-step-halo]");
				if (halo) {
					decorative(
						breathe(halo, { scale: 1.22, opacity: 0.1, duration: 1.5 }),
					);
				}
			}
		},
		{ dependencies: [status] },
	);

	if (status === "completed") {
		return (
			<div
				ref={ringRef}
				className="w-8 h-8 rounded-full bg-success/16 flex items-center justify-center ring-2 ring-success/30"
			>
				<CheckCircle2 className="w-4 h-4 text-success" />
			</div>
		);
	}
	if (status === "error") {
		return (
			<div
				ref={ringRef}
				className="w-8 h-8 rounded-full bg-error/16 flex items-center justify-center ring-2 ring-error/30"
			>
				<AlertCircle className="w-4 h-4 text-error" />
			</div>
		);
	}
	if (status === "running") {
		return (
			<div
				ref={ringRef}
				className="w-8 h-8 rounded-full bg-terracotta/15 flex items-center justify-center ring-2 ring-terracotta/30 relative"
			>
				<div className="w-4 h-4 rounded-full border-2 border-terracotta border-t-transparent animate-spin" />
				<div
					data-step-halo
					className="absolute inset-0 rounded-full bg-terracotta/20"
				/>
			</div>
		);
	}
	return (
		<div
			ref={ringRef}
			className="w-8 h-8 rounded-full bg-warm-200 flex items-center justify-center ring-2 ring-border/60"
		>
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
							"w-1 flex-1 min-h-12 rounded-full transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-500",
							step.status === "completed"
								? "bg-success/40"
								: step.status === "running"
									? "bg-gradient-to-b from-terracotta to-terracotta/30"
									: "bg-warm-300",
						)}
					/>
				)}
			</div>
			<div className="flex-1 pb-4">
				<div
					className={cn(
						"rounded-lg p-3 transition-[color,background-color,border-color,opacity,box-shadow,transform]",
						step.status === "running"
							? "bg-terracotta/[0.08] dark:bg-terracotta/[0.12] ring-1 ring-terracotta/20 dark:ring-terracotta/30"
							: step.status === "completed"
								? "bg-success/8 ring-1 ring-success/20"
								: step.status === "error"
									? "bg-error/[0.04] ring-1 ring-error/20"
									: "bg-warm-50/50 ring-1 ring-border/30",
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
							<span className="text-2xs font-medium px-2 py-1 rounded-full bg-terracotta/20 text-terracotta dark:text-terracotta whitespace-nowrap">
								进行中
							</span>
						)}
					</div>
					{toolCount > 0 && (
						<div className="flex items-center gap-1 text-xs text-text-secondary">
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
				<span className="ml-auto text-2xs text-text-light">
					{toolCalls.length} 次
				</span>
			</div>
			<div className="flex items-center gap-1.5 flex-wrap">
				{recentCalls.map((call, idx) => (
					<div key={call.id} className="flex items-center gap-1.5">
						<div
							className={cn(
								"px-2 py-1 rounded-full text-2xs font-medium flex items-center gap-1",
								call.status === "completed"
									? "bg-success/16 text-success"
									: call.status === "running"
										? "bg-terracotta/15 text-terracotta ring-1 ring-terracotta/30"
										: call.status === "error"
											? "bg-error/16 text-error"
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

	const circleRef = useRef<SVGCircleElement>(null);
	const labelRef = useRef<HTMLSpanElement>(null);
	const haloRef = useRef<HTMLDivElement>(null);
	const shownRef = useRef(progress);

	// 环的填充与中心百分比共用一次补间（理由同 TaskProgress 的 ProgressRing）
	useGsapMotion(
		({ gsap, dur }) => {
			const from = shownRef.current;
			if (from === progress) return;
			const circle = circleRef.current;
			const label = labelRef.current;
			const state = { value: from };
			gsap.to(state, {
				value: progress,
				duration: dur(0.62),
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

	// 运行中的外圈呼吸：装饰性，拖拽期自动让路
	useGsapMotion(
		({ decorative }) => {
			const halo = haloRef.current;
			if (!halo || !isRunning) return;
			decorative(breathe(halo, { scale: 1.06, opacity: 0.15, duration: 1.8 }));
		},
		{ dependencies: [isRunning] },
	);

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
					className="text-warm-200"
				/>
				<circle
					ref={circleRef}
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
						"transition-colors duration-500",
						isRunning
							? "text-terracotta"
							: progress >= 100
								? "text-success"
								: "text-focus",
					)}
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center">
				<span ref={labelRef} className="text-2xl font-bold text-text-primary">
					{Math.round(progress)}%
				</span>
				<span className="text-2xs text-text-muted">
					{isRunning ? "运行中" : "完成"}
				</span>
			</div>
			{isRunning && (
				<div
					ref={haloRef}
					className="absolute -inset-2 rounded-full border-2 border-terracotta/30"
				/>
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

	// 新增步骤入场：只动**这一批新出现的**，已经在屏幕上的行不能重放，
	// 否则 Agent 每追加一步整列表就闪一次。用已渲染数量做游标。
	const stepListRef = useRef<HTMLDivElement>(null);
	const renderedCountRef = useRef(0);
	const stepCount = task.steps?.length ?? 0;

	useGsapMotion(
		({ gsap, dur, amp, expressive }) => {
			const list = stepListRef.current;
			const previous = renderedCountRef.current;
			renderedCountRef.current = stepCount;
			if (!list || stepCount <= previous) return;

			const rows = Array.from(list.children).slice(previous);
			if (rows.length === 0) return;
			gsap.from(rows, {
				opacity: 0,
				y: amp(12),
				duration: dur(0.4),
				ease: EASE.outExpo,
				stagger: expressive ? 0.05 : 0,
				clearProps: "transform,opacity",
			});
		},
		{ dependencies: [stepCount] },
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
							<span className="text-2xs px-2 py-0.5 rounded-full bg-terracotta/15 text-terracotta">
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
						<span className="ml-auto text-2xs text-text-light">
							{task.steps.length} 步
						</span>
					</div>
					<div ref={stepListRef} className="space-y-0">
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
						<div className="text-2xs text-text-muted">总调用</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-success dark:text-success">
							{toolStats.completed}
						</div>
						<div className="text-2xs text-text-muted">成功</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-terracotta">
							{toolStats.running}
						</div>
						<div className="text-2xs text-text-muted">运行中</div>
					</div>
					<div className="text-center">
						<div className="text-lg font-bold text-error dark:text-error">
							{toolStats.failed}
						</div>
						<div className="text-2xs text-text-muted">失败</div>
					</div>
				</div>
			</div>
		</div>
	);
});

export default AgentExecutionFlow;
