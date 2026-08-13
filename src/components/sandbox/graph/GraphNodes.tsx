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
				"min-w-[320px] max-w-[360px] rounded-2xl border bg-surface",
				"shadow-node ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-shadow duration-150 hover:shadow-float",
				"border-black/[0.06] dark:border-white/[0.08]",
				selected && "ring-2 ring-primary/35 dark:ring-primary/45",
				isActive && "graph-node-running",
				isCompleted && "graph-success-shimmer",
			)}
		>
			<Handle type="target" position={Position.Left} className="opacity-0" />
			<Handle type="source" position={Position.Right} className="opacity-0" />

			{/* 顶部状态纯色条：运行 terracotta / 成功 success / 失败 error / 等待 border */}
			<div
				className={cn(
					"h-[2px] rounded-t-2xl transition-colors duration-500",
					isActive && "bg-terracotta",
					isCompleted && "bg-success",
					data.status === "error" && "bg-error",
					!isActive && !isCompleted && data.status !== "error" && "bg-border",
				)}
			/>

			<div className="px-4 py-3 border-b border-border/60">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm",
							"bg-primary-muted text-text-secondary",
							isActive && "text-terracotta",
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
						<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-error-muted text-error ring-1 ring-black/5 dark:ring-white/10">
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

	// 边框语义：子代理走 primary、失败走 error、常规走中性
	const accent = data.isSubagent ? "warm" : isError ? "rose" : "zinc";
	const borderCls =
		accent === "warm"
			? "border-primary/35 dark:border-primary/30"
			: accent === "rose"
				? "border-error/40 dark:border-error/40"
				: "border-black/[0.06] dark:border-white/[0.08]";

	return (
		<div
			ref={pulseRef}
			className={cn(
				"min-w-[280px] max-w-[320px] rounded-2xl border bg-surface",
				"shadow-node ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 hover:shadow-float",
				borderCls,
				selected && "ring-2 ring-primary/35 dark:ring-primary/45",
				isRunning && "graph-node-running",
			)}
		>
			<Handle type="target" position={Position.Left} className="opacity-0" />
			<Handle type="source" position={Position.Right} className="opacity-0" />

			{/* 运行中进度指示条 — 纯色 terracotta，靠 pulse 传达进行感 */}
			{isRunning && (
				<div className="h-[2px] rounded-t-2xl bg-terracotta animate-pulse" />
			)}

			<div className="px-3.5 py-3">
				<div className="flex items-start gap-3">
					{/* 分类图标 + 状态指示 */}
					<div className="relative mt-0.5">
						<div
							className={cn(
								"w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ring-1 ring-black/5 dark:ring-white/10",
								data.isSubagent
									? "bg-primary-muted text-primary"
									: isError
										? "bg-error-muted text-error"
										: isCompleted
											? "bg-success-muted text-success"
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
							<span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-terracotta graph-indicator-live ring-2 ring-surface" />
						)}
						{/* 完成/失败小角标 */}
						{!isRunning && isCompleted && (
							<span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success text-primary-foreground flex items-center justify-center ring-2 ring-surface">
								<CheckCircle2 className="w-2.5 h-2.5" />
							</span>
						)}
						{!isRunning && isError && (
							<span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-error text-primary-foreground flex items-center justify-center ring-2 ring-surface">
								<AlertTriangle className="w-2.5 h-2.5" />
							</span>
						)}
					</div>

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold tracking-wide bg-warm-200 text-text-muted ring-1 ring-black/5 dark:ring-white/10">
								STEP {String(data.step).padStart(2, "0")}
							</span>
							{/* 工具分类标签 */}
							{!data.isSubagent && (
								<span className={cn("text-2xs font-medium", toolIconCfg.color)}>
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
									<div className="text-xs text-success bg-success-muted rounded-lg px-2 py-1 ring-1 ring-black/[0.03] dark:ring-white/[0.05] line-clamp-1">
										<span className="text-success mr-0.5">←</span>
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

/** 产物类型图标映射 — 近单色体系下类型靠图标形状区分，底色统一 */
function getArtifactIcon(artifactType: string) {
	switch (artifactType) {
		case "image":
			return { icon: FileImage };
		case "code":
			return { icon: Code2 };
		case "video":
			return { icon: Video };
		case "audio":
			return { icon: Music };
		case "spreadsheet":
			return { icon: FileSpreadsheet };
		case "document":
		case "pdf":
			return { icon: FileText };
		default:
			return { icon: Archive };
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
				"min-w-[220px] max-w-[280px] rounded-2xl border bg-surface",
				"shadow-node ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-shadow duration-150 hover:shadow-float",
				"border-black/[0.06] dark:border-white/[0.08]",
				selected && "ring-2 ring-primary/35 dark:ring-primary/45",
			)}
		>
			<Handle type="target" position={Position.Top} className="opacity-0" />
			<div className="px-3.5 py-3">
				<div className="flex items-start gap-3">
					<div className="mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ring-1 ring-black/5 dark:ring-white/10 bg-primary-muted">
						<ArtIcon className="w-4 h-4 text-text-secondary" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5 mb-1">
							<span className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold tracking-wide bg-warm-200 text-text-muted ring-1 ring-black/5 dark:ring-white/10">
								ARTIFACT {String(data.step).padStart(2, "0")}
							</span>
							<span className="text-2xs font-medium text-text-muted">
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
				"min-w-[210px] max-w-[250px] rounded-2xl border bg-surface",
				"shadow-node ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 hover:shadow-float",
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
							{/* 底圈 — 走主题边框变量，暗色自动适配 */}
							<circle
								cx="35"
								cy="35"
								r={radius}
								fill="none"
								stroke="var(--t-border, #E8E5DD)"
								strokeWidth={stroke}
							/>
							{/* 完成段 */}
							{completedLen > 0 && (
								<circle
									cx="35"
									cy="35"
									r={radius}
									fill="none"
									stroke="var(--t-success, #4a7c59)"
									strokeWidth={stroke}
									strokeDasharray={`${completedLen} ${circumference - completedLen}`}
									strokeDashoffset={completedOffset}
									strokeLinecap="round"
									className="transition-[stroke-dasharray,stroke-dashoffset,color,background-color,border-color,opacity,box-shadow,transform] duration-400"
								/>
							)}
							{/* 运行段 — stroke 为签名色 terracotta（无对应 CSS 变量，跨主题恒定，故保留 hex） */}
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
									className="transition-[stroke-dasharray,stroke-dashoffset,color,background-color,border-color,opacity,box-shadow,transform] duration-400"
								/>
							)}
							{/* 失败段 */}
							{failedLen > 0 && (
								<circle
									cx="35"
									cy="35"
									r={radius}
									fill="none"
									stroke="var(--t-error, #b53333)"
									strokeWidth={stroke}
									strokeDasharray={`${failedLen} ${circumference - failedLen}`}
									strokeDashoffset={failedOffset}
									strokeLinecap="round"
									className="transition-[stroke-dasharray,stroke-dashoffset,color,background-color,border-color,opacity,box-shadow,transform] duration-400"
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
				"text-xs font-medium",
				isMain
					? "border-border/70 bg-surface text-text-secondary"
					: "border-primary/25 dark:border-primary/20 bg-primary-muted text-primary/80 dark:text-primary/70",
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
			<span className="text-2xs font-medium text-text-light whitespace-nowrap">
				{data.label}
			</span>
			{data.gapMs ? (
				<span className="text-2xs text-text-light tabular-nums">
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
