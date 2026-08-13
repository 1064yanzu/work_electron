// 流式思考展示组件
// 实时展示 Agent 的思考过程，支持阶段切换和动画效果

import { Activity, ChevronDown, ChevronUp, Loader } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useAgentStoreSelector } from "../../lib/agent/store";
import {
	type AgentThinkingStep,
	THINKING_PHASE_CONFIG,
	type ThinkingPhase,
} from "../../lib/agent/types";
import { cn } from "../../lib/utils";

// 阶段指示器组件
function PhaseIndicator({
	phase,
	isActive,
	isCompleted,
}: {
	phase: ThinkingPhase;
	isActive: boolean;
	isCompleted: boolean;
}) {
	const config = THINKING_PHASE_CONFIG[phase];

	return (
		<div
			className={cn(
				"flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250",
				isActive && "bg-focus/16 text-focus scale-105",
				isCompleted && !isActive && "bg-success-muted text-success",
				!isActive && !isCompleted && "bg-warm-200 text-text-light",
			)}
		>
			<span>{config.emoji}</span>
			<span className="hidden sm:inline">{config.label}</span>
		</div>
	);
}

// 思考步骤卡片
function ThinkingStepCard({
	step,
	isLatest,
}: {
	step: AgentThinkingStep;
	isLatest: boolean;
}) {
	const config = THINKING_PHASE_CONFIG[step.phase];
	const contentRef = useRef<HTMLDivElement>(null);
	const [displayedContent, setDisplayedContent] = useState("");
	// 已展示的字符数（跨 effect 重跑保持连续，避免内容追加时从头重打）
	const typedIndexRef = useRef(0);

	// 打字机效果：rAF 驱动，按时间差推进字符数（视觉速度仍为 15ms/字符）
	useEffect(() => {
		const CHAR_INTERVAL_MS = 15;

		if (!isLatest || !step.content) {
			typedIndexRef.current = step.content.length;
			setDisplayedContent(step.content);
			return;
		}

		// 内容被替换变短时收敛索引
		if (typedIndexRef.current > step.content.length) {
			typedIndexRef.current = step.content.length;
			setDisplayedContent(step.content);
		}
		if (typedIndexRef.current >= step.content.length) return;

		let rafId = 0;
		let lastTime = performance.now();
		let carryMs = 0;

		const tick = (now: number) => {
			carryMs += now - lastTime;
			lastTime = now;

			const advance = Math.floor(carryMs / CHAR_INTERVAL_MS);
			if (advance > 0) {
				carryMs -= advance * CHAR_INTERVAL_MS;
				typedIndexRef.current = Math.min(
					typedIndexRef.current + advance,
					step.content.length,
				);
				setDisplayedContent(step.content.slice(0, typedIndexRef.current));
			}

			if (typedIndexRef.current < step.content.length) {
				rafId = requestAnimationFrame(tick);
			} else {
				rafId = 0;
			}
		};

		rafId = requestAnimationFrame(tick);
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [step.content, isLatest]);

	// 自动滚动到底部
	useEffect(() => {
		if (isLatest && contentRef.current) {
			contentRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
		}
	}, [displayedContent, isLatest]);

	return (
		<div
			className={cn(
				"p-3 rounded-lg transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250",
				isLatest
					? "bg-surface/80 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
					: "bg-warm-50/50",
			)}
		>
			<div className="flex items-center gap-2 mb-2">
				<span className="text-base">{config.emoji}</span>
				<span className={cn("text-sm font-medium", config.color)}>
					{config.label}
				</span>
				{step.duration && (
					<span className="text-xs text-text-light ml-auto">
						{(step.duration / 1000).toFixed(1)}s
					</span>
				)}
			</div>
			<div
				ref={contentRef}
				className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap"
			>
				{displayedContent}
				{isLatest && displayedContent.length < step.content.length && (
					<span className="inline-block w-1.5 h-4 bg-focus ml-0.5 animate-pulse" />
				)}
			</div>
		</div>
	);
}

// 主组件
export default function StreamingThought() {
	// 逐字段订阅，避免 agentStore 任意字段变化都重渲染整个思考流
	const thinkingPhase = useAgentStoreSelector((s) => s.thinkingPhase);
	const thinkingSteps = useAgentStoreSelector((s) => s.thinkingSteps);
	const partialThinking = useAgentStoreSelector((s) => s.partialThinking);
	const isExecuting = useAgentStoreSelector((s) => s.isExecuting);
	const taskProgress = useAgentStoreSelector((s) => s.taskProgress);

	const [isExpanded, setIsExpanded] = useState(true);
	const containerRef = useRef<HTMLDivElement>(null);

	// 没有思考内容时不显示
	if (thinkingSteps.length === 0 && !partialThinking) {
		return null;
	}

	const phases: ThinkingPhase[] = [
		"analyzing",
		"planning",
		"executing",
		"reflecting",
		"concluding",
	];

	return (
		<div
			className={cn(
				"rounded-xl overflow-hidden transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250",
				"bg-gradient-to-br from-surface to-background/50",
				"ring-1 ring-black/5 dark:ring-white/10",
			)}
		>
			{/* Header */}
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface/50 transition-colors"
			>
				<div className="relative">
					<Activity
						className={cn(
							"w-5 h-5 transition-colors",
							isExecuting ? "text-focus" : "text-text-light",
						)}
					/>
					{isExecuting && (
						<span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-focus rounded-full animate-pulse" />
					)}
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium text-text-secondary">
							思考过程
						</span>
						{isExecuting && (
							<span className="text-xs text-focus flex items-center gap-1">
								<Loader className="w-3 h-3 animate-pulse" />
								思考中...
							</span>
						)}
					</div>

					{/* 阶段进度条 */}
					<div className="flex items-center gap-1 mt-1.5 overflow-x-auto scrollbar-hide">
						{phases.map((phase, idx) => (
							<React.Fragment key={phase}>
								<PhaseIndicator
									phase={phase}
									isActive={phase === thinkingPhase}
									isCompleted={
										taskProgress?.phaseStatus[phase] === "completed" ||
										phases.indexOf(thinkingPhase) > idx
									}
								/>
								{idx < phases.length - 1 && (
									<div
										className={cn(
											"w-3 h-0.5 rounded-full transition-colors",
											phases.indexOf(thinkingPhase) > idx
												? "bg-success/40"
												: "bg-warm-300",
										)}
									/>
								)}
							</React.Fragment>
						))}
					</div>
				</div>

				{isExpanded ? (
					<ChevronUp className="w-4 h-4 text-text-light" />
				) : (
					<ChevronDown className="w-4 h-4 text-text-light" />
				)}
			</button>

			{/* Content */}
			{isExpanded && (
				<div
					ref={containerRef}
					className="px-4 pb-4 space-y-3 max-h-80 overflow-y-auto scrollbar-hide animate-in fade-in slide-in-from-top-2 duration-250"
				>
					{thinkingSteps.map((step, idx) => (
						<ThinkingStepCard
							key={step.id}
							step={step}
							isLatest={idx === thinkingSteps.length - 1}
						/>
					))}

					{/* 当前正在流式输出的内容 */}
					{partialThinking && (
						<div className="p-3 rounded-lg bg-surface/80 shadow-sm ring-1 ring-focus/20">
							<div className="flex items-center gap-2 mb-2">
								<span className="text-base">
									{THINKING_PHASE_CONFIG[thinkingPhase].emoji}
								</span>
								<span
									className={cn(
										"text-sm font-medium",
										THINKING_PHASE_CONFIG[thinkingPhase].color,
									)}
								>
									{THINKING_PHASE_CONFIG[thinkingPhase].label}
								</span>
								<span className="ml-auto flex items-center gap-1 text-xs text-focus">
									<span className="w-1.5 h-1.5 bg-focus rounded-full animate-pulse" />
									输入中...
								</span>
							</div>
							<div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
								{partialThinking}
								<span className="inline-block w-1.5 h-4 bg-focus ml-0.5 animate-pulse" />
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export { StreamingThought };
