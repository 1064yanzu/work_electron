import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
	AlertTriangle,
	Archive,
	CheckCircle2,
	ChevronRight,
	CircleDot,
	Code2,
	FileImage,
	FileSpreadsheet,
	FileText,
	GitBranch,
	Loader2,
	Minus,
	Music,
	MessageSquare,
	Video,
	PenLine,
	Zap,
} from "lucide-react";
import { memo } from "react";
import { cn } from "../../../lib/utils";
import type {
	ArtifactGraphNode,
	ExecutionGraphNode,
	LaneGraphNode,
	PhaseDividerGraphNode,
	SwarmOverviewGraphNode,
	TaskGraphNode,
	ToolGraphNode,
} from "./types";
import { taskStatusPill, statusPill, formatDuration } from "./utils";
import { getToolIconConfig } from "./toolIconMap";
import { useNodeStatusPulse } from "./useNodeStatusPulse";

const TaskNode = memo(function TaskNode(props: NodeProps<TaskGraphNode>) {
	const { data, selected } = props;
	const pill = taskStatusPill(data.status);
	const isActive = data.status === "executing" || data.status === "planning";
	const isCompleted = data.status === "completed";
	const pulseRef = useNodeStatusPulse(data.status);

	return (
		<div
			ref={pulseRef}
			className={cn(
				"min-w-[320px] max-w-[360px] rounded-2xl border bg-surface/90 backdrop-blur-md",
				"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-shadow duration-150 hover:shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)]",
				"border-black/[0.06] dark:border-white/[0.08]",
				selected && "ring-2 ring-primary/35 dark:ring-primary/45",
				isActive && "graph-node-running",
				isCompleted && "graph-success-shimmer",
			)}
		>
			<Handle type="target" position={Position.Left} className="opacity-0" />
			<Handle type="source" position={Position.Right} className="opacity-0" />

			{/* 顶部状态渐变条 */}
			<div
				className={cn(
					"h-[3px] rounded-t-2xl transition-colors duration-500",
					isActive &&
						"bg-gradient-to-r from-primary/60 via-primary to-primary/60",
					isCompleted &&
						"bg-gradient-to-r from-emerald-400/50 via-emerald-500/70 to-emerald-400/50",
					data.status === "error" &&
						"bg-gradient-to-r from-rose-400/50 via-rose-500/70 to-rose-400/50",
					!isActive &&
						!isCompleted &&
						data.status !== "error" &&
						"bg-gradient-to-r from-cream-200/50 via-cream-300/50 to-cream-200/50 dark:from-cream-700/50 dark:via-cream-600/50 dark:to-cream-700/50",
				)}
			/>

			<div className="px-4 py-3 border-b border-border/60">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm",
							"bg-gradient-to-br from-cream-900 to-cream-700 dark:from-cream-100 dark:to-cream-300 text-white",
							isActive &&
								"from-primary/90 to-primary dark:from-primary dark:to-primary/80 text-white dark:text-white",
						)}
					>
						<GitBranch className="w-4 h-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<div className="text-sm font-semibold text-text-primary truncate">
								{data.title}
							</div>
							<span
								className={cn(
									"inline-flex items-center gap-1 text-xs font-medium",
									pill.cls,
								)}
							>
								{pill.spinning ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : isCompleted ? (
									<CheckCircle2 className="w-3 h-3" />
								) : (
									<MessageSquare className="w-3 h-3" />
								)}
								{pill.label}
							</span>
						</div>
						{data.subtitle ? (
							<div className="mt-0.5 text-xs text-text-muted line-clamp-2">
								{data.subtitle}
							</div>
						) : null}
					</div>
				</div>
			</div>

			<div className="px-4 py-3 text-xs text-text-secondary">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-warm-50 ring-1 ring-black/5 dark:ring-white/10">
						<PenLine className="w-3.5 h-3.5 text-primary" />
						工具 {data.stats.toolsCompleted}/{data.stats.toolsTotal}
					</span>
					{data.stats.toolsFailed > 0 ? (
						<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-[rgba(181,51,51,0.08)] dark:bg-rose-900/20 text-error dark:text-error ring-1 ring-rose-500/15">
							<AlertTriangle className="w-3.5 h-3.5" />
							失败 {data.stats.toolsFailed}
						</span>
					) : null}
					<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-warm-50 ring-1 ring-black/5 dark:ring-white/10">
						<Archive className="w-3.5 h-3.5 text-text-muted" />
						产物 {data.stats.artifacts}
					</span>
				</div>
			</div>
		</div>
	);
});

const ToolNode = memo(function ToolNode(props: NodeProps<ToolGraphNode>) {
	const { data, selected } = props;
	const pill = statusPill(data.status);
	const isRunning = data.status === "running";
	const isCompleted = data.status === "completed";
	const isError = data.status === "error";

	const toolIconCfg = getToolIconConfig(
		data.isSubagent ? "subagent" : data.name,
	);
	const ToolIcon = toolIconCfg.icon;

	const pulseRef = useNodeStatusPulse(data.status);

	const accent = data.isSubagent ? "warm" : isError ? "rose" : "zinc";
	const borderCls =
		accent === "warm"
			? "border-primary/35 dark:border-primary/30"
			: accent === "rose"
				? "border-[rgba(181,51,51,0.32)]/70 dark:border-rose-900/40"
				: "border-black/[0.06] dark:border-white/[0.08]";

	return (
		<div
			ref={pulseRef}
			className={cn(
				"min-w-[280px] max-w-[320px] rounded-2xl border bg-surface/85 backdrop-blur-md",
				"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 hover:shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)]",
				borderCls,
				selected && "ring-2 ring-primary/35 dark:ring-primary/45",
				isRunning && "graph-node-running",
			)}
		>
			<Handle type="target" position={Position.Left} className="opacity-0" />
			<Handle type="source" position={Position.Right} className="opacity-0" />

			{/* 运行中进度指示条 */}
			{isRunning && (
				<div className="h-[2px] rounded-t-2xl bg-gradient-to-r from-transparent via-primary/70 to-transparent animate-pulse" />
			)}

			<div className="px-3.5 py-3">
				<div className="flex items-start gap-3">
					{/* 分类图标 + 状态指示 */}
					<div className="relative mt-0.5">
						<div
							className={cn(
								"w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ring-1 ring-black/5 dark:ring-white/10",
								data.isSubagent
									? "bg-gradient-to-br from-primary/15 to-primary/25 dark:from-primary/20 dark:to-primary/35 text-primary"
									: isError
										? "bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-800/30 text-error dark:text-error"
										: isCompleted
											? "bg-gradient-to-br from-emerald-50 to-emerald-100/80 dark:from-emerald-900/20 dark:to-emerald-800/30 text-success dark:text-success"
											: "bg-warm-50 text-text-secondary",
							)}
						>
							{isRunning ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<ToolIcon className="w-4 h-4" />
							)}
						</div>
						{/* 实时指示灯 */}
						{isRunning && (
							<span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary graph-indicator-live ring-2 ring-white dark:ring-cream-900" />
						)}
						{/* 完成/失败小角标 */}
						{!isRunning && isCompleted && (
							<span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success text-white flex items-center justify-center ring-2 ring-white dark:ring-cream-900">
								<CheckCircle2 className="w-2.5 h-2.5" />
							</span>
						)}
						{!isRunning && isError && (
							<span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-error text-white flex items-center justify-center ring-2 ring-white dark:ring-cream-900">
								<AlertTriangle className="w-2.5 h-2.5" />
							</span>
						)}
					</div>

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide bg-warm-200 text-text-muted ring-1 ring-black/5 dark:ring-white/10">
								STEP {String(data.step).padStart(2, "0")}
							</span>
							{/* 工具分类标签 */}
							{!data.isSubagent && (
								<span
									className={cn("text-[11px] font-medium", toolIconCfg.color)}
								>
									{toolIconCfg.label}
								</span>
							)}
							<span
								className={cn(
									"inline-flex items-center gap-1 text-xs font-medium ml-auto",
									pill.cls,
								)}
							>
								{pill.label}
							</span>
						</div>
						<div className="text-sm font-semibold text-text-primary truncate mt-0.5">
							{data.isSubagent
								? data.subagentType
									? `子代理 · ${data.subagentType}`
									: "子代理"
								: data.name}
						</div>
						{data.description && (
							<div className="mt-0.5 text-xs text-text-muted line-clamp-2">
								{data.description}
							</div>
						)}

						{/* 输入/输出摘要 */}
						{(data.inputSummary || data.outputSummary) && (
							<div className="mt-1.5 space-y-1">
								{data.inputSummary && (
									<div className="text-xs text-text-muted bg-warm-50/60 rounded-lg px-2 py-1 ring-1 ring-black/[0.03] dark:ring-white/[0.05] line-clamp-1">
										<span className="text-text-light mr-0.5">→</span>
										{data.inputSummary}
									</div>
								)}
								{data.outputSummary && (
									<div className="text-xs text-success dark:text-success bg-success/8 dark:bg-emerald-900/20 rounded-lg px-2 py-1 ring-1 ring-emerald-500/10 line-clamp-1">
										<span className="text-success dark:text-success mr-0.5">
											←
										</span>
										{data.outputSummary}
									</div>
								)}
							</div>
						)}

						{data.lastActivity ? (
							<div className="mt-2 text-xs text-text-secondary bg-warm-50/80 rounded-xl px-2.5 py-2 ring-1 ring-black/5 dark:ring-white/10">
								<span className="text-text-light mr-1">最新：</span>
								{data.lastActivity}
							</div>
						) : null}
					</div>

					{data.durationMs ? (
						<div className="shrink-0 text-xs text-text-light font-medium tabular-nums">
							{formatDuration(data.durationMs)}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
});

/** 产物类型图标映射 */
function getArtifactIcon(artifactType: string) {
	switch (artifactType) {
		case "image":
			return {
				icon: FileImage,
				color: "text-pink-600 dark:text-pink-400",
				bg: "from-pink-50 to-fuchsia-50 dark:from-pink-900/20 dark:to-fuchsia-900/20",
			};
		case "code":
			return {
				icon: Code2,
				color: "text-teal-600 dark:text-teal-400",
				bg: "from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20",
			};
		case "video":
			return {
				icon: Video,
				color: "text-indigo-600 dark:text-indigo-400",
				bg: "from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20",
			};
		case "audio":
			return {
				icon: Music,
				color: "bai-icon-violet dark:bai-icon-violet",
				bg: "from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20",
			};
		case "spreadsheet":
			return {
				icon: FileSpreadsheet,
				color: "text-cyan-600 dark:text-cyan-400",
				bg: "from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20",
			};
		case "document":
		case "pdf":
			return {
				icon: FileText,
				color: "text-orange-600 dark:text-orange-400",
				bg: "from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20",
			};
		default:
			return {
				icon: Archive,
				color: "text-text-secondary",
				bg: "from-cream-50 to-cream-50 dark:from-cream-900/30 dark:to-cream-800/30",
			};
	}
}

const ArtifactNode = memo(function ArtifactNode(
	props: NodeProps<ArtifactGraphNode>,
) {
	const { data, selected } = props;
	const artCfg = getArtifactIcon(data.artifactType);
	const ArtIcon = artCfg.icon;

	return (
		<div
			className={cn(
				"min-w-[220px] max-w-[280px] rounded-2xl border bg-surface/90 backdrop-blur-md",
				"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-shadow duration-150 hover:shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)]",
				"border-black/[0.06] dark:border-white/[0.08]",
				selected && "ring-2 ring-primary/35 dark:ring-primary/45",
			)}
		>
			<Handle type="target" position={Position.Top} className="opacity-0" />
			<div className="px-3.5 py-3">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ring-1 ring-black/5 dark:ring-white/10",
							"bg-gradient-to-br",
							artCfg.bg,
						)}
					>
						<ArtIcon className={cn("w-4 h-4", artCfg.color)} />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5 mb-1">
							<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide bg-warm-200 text-text-muted ring-1 ring-black/5 dark:ring-white/10">
								ARTIFACT {String(data.step).padStart(2, "0")}
							</span>
							<span className={cn("text-[11px] font-medium", artCfg.color)}>
								{data.artifactType}
							</span>
						</div>
						<div className="text-sm font-semibold text-text-primary truncate">
							{data.title}
						</div>
					</div>
					<ChevronRight className="w-4 h-4 text-text-light shrink-0 mt-1" />
				</div>
			</div>
		</div>
	);
});

/** 蜂群总览节点 — 环形进度 + 统计数字 + 粒子动画 */
const SwarmOverviewNode = memo(function SwarmOverviewNode(
	props: NodeProps<SwarmOverviewGraphNode>,
) {
	const { data, selected } = props;
	const { totalAgents, completedAgents, runningAgents, failedAgents } = data;
	const pending = Math.max(
		0,
		totalAgents - completedAgents - runningAgents - failedAgents,
	);
	const hasRunning = runningAgents > 0;
	const allDone =
		completedAgents + failedAgents === totalAgents && totalAgents > 0;

	// 环形进度 SVG 参数
	const radius = 28;
	const stroke = 5;
	const circumference = 2 * Math.PI * radius;
	const completedPct = totalAgents > 0 ? completedAgents / totalAgents : 0;
	const runningPct = totalAgents > 0 ? runningAgents / totalAgents : 0;
	const failedPct = totalAgents > 0 ? failedAgents / totalAgents : 0;

	// 各段偏移
	const completedLen = circumference * completedPct;
	const runningLen = circumference * runningPct;
	const failedLen = circumference * failedPct;
	const completedOffset = 0;
	const runningOffset = -completedLen;
	const failedOffset = -(completedLen + runningLen);

	return (
		<div
			className={cn(
				"min-w-[210px] max-w-[250px] rounded-2xl border bg-surface/90 backdrop-blur-md",
				"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 hover:shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)]",
				"border-primary/30 dark:border-primary/25",
				selected && "ring-2 ring-primary/35 dark:ring-primary/45",
				hasRunning && "graph-node-running",
			)}
		>
			<Handle type="target" position={Position.Left} className="opacity-0" />
			<Handle type="source" position={Position.Right} className="opacity-0" />

			<div className="px-4 py-3">
				{/* 标题行 + 蜂群粒子 */}
				<div className="flex items-center gap-2 mb-2.5">
					<GitBranch className="w-3.5 h-3.5 text-primary/70" />
					<span className="text-xs font-semibold text-text-primary">
						蜂群总览
					</span>
					{/* 粒子指示器 */}
					{hasRunning && (
						<span className="flex items-center gap-0.5 ml-auto">
							<span className="w-1.5 h-1.5 rounded-full bg-primary/70 graph-swarm-particle" />
							<span className="w-1.5 h-1.5 rounded-full bg-primary/50 graph-swarm-particle" />
							<span className="w-1.5 h-1.5 rounded-full bg-primary/30 graph-swarm-particle" />
						</span>
					)}
					{allDone && failedAgents === 0 && (
						<CheckCircle2 className="w-3.5 h-3.5 text-success ml-auto" />
					)}
				</div>

				<div className="flex items-center gap-3">
					{/* 环形进度 */}
					<div className="relative shrink-0 w-16 h-16">
						<svg
							viewBox="0 0 70 70"
							className={cn(
								"w-full h-full -rotate-90 transition-transform",
								hasRunning && "graph-ring-animated",
							)}
						>
							{/* 底圈 */}
							<circle
								cx="35"
								cy="35"
								r={radius}
								fill="none"
								stroke="rgba(148,163,184,0.18)"
								strokeWidth={stroke}
							/>
							{/* 完成段 */}
							{completedLen > 0 && (
								<circle
									cx="35"
									cy="35"
									r={radius}
									fill="none"
									stroke="#10b981"
									strokeWidth={stroke}
									strokeDasharray={`${completedLen} ${circumference - completedLen}`}
									strokeDashoffset={completedOffset}
									strokeLinecap="round"
									className="transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-700"
								/>
							)}
							{/* 运行段 */}
							{runningLen > 0 && (
								<circle
									cx="35"
									cy="35"
									r={radius}
									fill="none"
									stroke="#D96C46"
									strokeWidth={stroke}
									strokeDasharray={`${runningLen} ${circumference - runningLen}`}
									strokeDashoffset={runningOffset}
									strokeLinecap="round"
									className="transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-700"
								/>
							)}
							{/* 失败段 */}
							{failedLen > 0 && (
								<circle
									cx="35"
									cy="35"
									r={radius}
									fill="none"
									stroke="#f43f5e"
									strokeWidth={stroke}
									strokeDasharray={`${failedLen} ${circumference - failedLen}`}
									strokeDashoffset={failedOffset}
									strokeLinecap="round"
									className="transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-700"
								/>
							)}
						</svg>
						{/* 中心数字 */}
						<div className="absolute inset-0 flex items-center justify-center">
							<span className="text-base font-bold text-text-primary tabular-nums">
								{totalAgents}
							</span>
						</div>
					</div>

					{/* 统计文字 */}
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
							<span className="inline-flex items-center gap-1 text-success dark:text-success">
								<CircleDot className="w-3 h-3" />
								{completedAgents}
							</span>
							{runningAgents > 0 && (
								<span className="inline-flex items-center gap-1 text-primary">
									<Zap className="w-3 h-3" />
									{runningAgents}
								</span>
							)}
							{failedAgents > 0 && (
								<span className="inline-flex items-center gap-1 text-error dark:text-error">
									<AlertTriangle className="w-3 h-3" />
									{failedAgents}
								</span>
							)}
							{pending > 0 && (
								<span className="text-text-light">等待 {pending}</span>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});

const LaneNode = memo(function LaneNode(props: NodeProps<LaneGraphNode>) {
	const { data } = props;
	const isMain = data.laneId === "main";
	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm",
				"text-xs font-medium backdrop-blur-sm",
				isMain
					? "border-border/70 bg-surface/80 text-text-secondary"
					: "border-primary/25 dark:border-primary/20 bg-primary/5 dark:bg-primary/10 text-primary/80 dark:text-primary/70",
			)}
		>
			{isMain ? (
				<GitBranch className="w-3 h-3 opacity-60" />
			) : (
				<GitBranch className="w-3 h-3 opacity-60" />
			)}
			{data.label}
		</div>
	);
});

/** 阶段分隔节点 — 标记工具调用间的思考间隔 */
const PhaseDividerNode = memo(function PhaseDividerNode(
	props: NodeProps<PhaseDividerGraphNode>,
) {
	const { data } = props;
	return (
		<div className="flex items-center gap-2 px-3 py-1">
			<Handle type="target" position={Position.Left} className="opacity-0" />
			<Handle type="source" position={Position.Right} className="opacity-0" />
			<Minus className="w-3 h-3 text-text-light" />
			<span className="text-[11px] font-medium text-text-light whitespace-nowrap">
				{data.label}
			</span>
			{data.gapMs ? (
				<span className="text-[11px] text-text-light tabular-nums">
					{formatDuration(data.gapMs)}
				</span>
			) : null}
			<Minus className="w-3 h-3 text-text-light" />
		</div>
	);
});

export const nodeTypes = {
	lane: LaneNode,
	task: TaskNode,
	tool: ToolNode,
	artifact: ArtifactNode,
	swarm_overview: SwarmOverviewNode,
	phase_divider: PhaseDividerNode,
};

export function isToolNode(node: ExecutionGraphNode): boolean {
	return node.type === "tool";
}
