// 透明思考过程展示组件
// 流式展示Agent的推理过程和决策逻辑

import {
	AlertCircle,
	Brain,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Clock,
	Code,
	FileText,
	Globe,
	Lightbulb,
	RefreshCw,
	Search,
	Sparkles,
	Target,
	Zap,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { ThinkingStep } from "../../lib/agent/core/intelligentAgent";
import type { MemoryEntry } from "../../lib/agent/core/memorySystem";
import type { PlanNode } from "../../lib/agent/core/planningSystem";
import type { QualityAssessment } from "../../lib/agent/core/selfReflection";
import type { ToolMatch } from "../../lib/agent/core/toolSelector";

// ==================== 类型定义 ====================

interface ThinkingProcessProps {
	steps: ThinkingStep[];
	isActive: boolean;
	showDetails?: boolean;
	className?: string;
}

// ==================== 子组件 ====================

// 阶段图标
const PhaseIcon: React.FC<{
	phase: ThinkingStep["phase"];
	className?: string;
}> = ({ phase, className = "" }) => {
	const iconClass = `w-4 h-4 ${className}`;

	switch (phase) {
		case "analyze":
			return <Brain className={iconClass} />;
		case "plan":
			return <Target className={iconClass} />;
		case "decide":
			return <Lightbulb className={iconClass} />;
		case "execute":
			return <Zap className={iconClass} />;
		case "reflect":
			return <RefreshCw className={iconClass} />;
		case "conclude":
			return <CheckCircle2 className={iconClass} />;
		default:
			return <Sparkles className={iconClass} />;
	}
};

// 阶段颜色
const getPhaseColor = (phase: ThinkingStep["phase"]): string => {
	const colors: Record<ThinkingStep["phase"], string> = {
		analyze: "text-blue-500 bg-blue-500/10 border-blue-500/20",
		plan: "text-purple-500 bg-purple-500/10 border-purple-500/20",
		decide: "text-amber-500 bg-amber-500/10 border-amber-500/20",
		execute: "text-green-500 bg-green-500/10 border-green-500/20",
		reflect: "text-orange-500 bg-orange-500/10 border-orange-500/20",
		conclude: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
	};
	return colors[phase] || "text-gray-500 bg-gray-500/10 border-gray-500/20";
};

// 阶段名称
const getPhaseName = (phase: ThinkingStep["phase"]): string => {
	const names: Record<ThinkingStep["phase"], string> = {
		analyze: "分析理解",
		plan: "制定计划",
		decide: "决策选择",
		execute: "执行任务",
		reflect: "反思评估",
		conclude: "得出结论",
	};
	return names[phase] || "思考中";
};

// 工具推荐展示
const ToolRecommendations: React.FC<{ recommendations: ToolMatch[] }> = ({
	recommendations,
}) => {
	if (!recommendations.length) return null;

	const getToolIcon = (tool: string) => {
		if (tool.includes("search")) return <Search className="w-3 h-3" />;
		if (tool.includes("code")) return <Code className="w-3 h-3" />;
		if (tool.includes("doc")) return <FileText className="w-3 h-3" />;
		if (
			tool.includes("web") ||
			tool.includes("fetch") ||
			tool.includes("browser")
		)
			return <Globe className="w-3 h-3" />;
		return <Zap className="w-3 h-3" />;
	};

	return (
		<div className="mt-2 space-y-1">
			{recommendations.slice(0, 3).map((rec, idx) => (
				<div
					key={idx}
					className="flex items-center gap-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded px-2 py-1"
				>
					{getToolIcon(rec.tool)}
					<span className="font-medium">{rec.tool}</span>
					<span className="text-[var(--text-tertiary)]">
						{(rec.score * 100).toFixed(0)}%
					</span>
					{rec.reasoning && (
						<span className="text-[var(--text-tertiary)] truncate flex-1">
							- {rec.reasoning}
						</span>
					)}
				</div>
			))}
		</div>
	);
};

// 记忆展示
const MemoryDisplay: React.FC<{ memories: MemoryEntry[] }> = ({ memories }) => {
	if (!memories.length) return null;

	return (
		<div className="mt-2 space-y-1">
			{memories.slice(0, 3).map((memory, idx) => (
				<div
					key={idx}
					className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded px-2 py-1"
				>
					<span className="text-[var(--text-tertiary)]">[{memory.type}]</span>{" "}
					{memory.content.slice(0, 100)}
					{memory.content.length > 100 && "..."}
				</div>
			))}
		</div>
	);
};

// 计划节点展示
const PlanNodesDisplay: React.FC<{ nodes: PlanNode[] }> = ({ nodes }) => {
	if (!nodes.length) return null;

	const statusIcon = (status: PlanNode["status"]) => {
		switch (status) {
			case "completed":
				return <CheckCircle2 className="w-3 h-3 text-green-500" />;
			case "in_progress":
				return <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />;
			case "failed":
				return <AlertCircle className="w-3 h-3 text-red-500" />;
			default:
				return <Clock className="w-3 h-3 text-gray-400" />;
		}
	};

	return (
		<div className="mt-2 space-y-1">
			{nodes
				.filter((n) => n.type !== "goal")
				.slice(0, 5)
				.map((node, idx) => (
					<div
						key={idx}
						className="flex items-center gap-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded px-2 py-1"
					>
						{statusIcon(node.status)}
						<span
							className={
								node.status === "completed" ? "line-through opacity-60" : ""
							}
						>
							{node.title}
						</span>
					</div>
				))}
		</div>
	);
};

// 质量评估展示
const QualityDisplay: React.FC<{ quality: QualityAssessment }> = ({
	quality,
}) => {
	const getScoreColor = (score: number) => {
		if (score >= 0.8) return "text-green-500";
		if (score >= 0.6) return "text-amber-500";
		return "text-red-500";
	};

	return (
		<div className="mt-2 bg-[var(--bg-secondary)] rounded p-2">
			<div className="flex items-center gap-4 text-xs">
				<div className="flex items-center gap-1">
					<span className="text-[var(--text-tertiary)]">总分:</span>
					<span
						className={`font-medium ${getScoreColor(quality.overallScore)}`}
					>
						{(quality.overallScore * 100).toFixed(0)}%
					</span>
				</div>
				<div className="flex items-center gap-1">
					<span className="text-[var(--text-tertiary)]">完整性:</span>
					<span className={getScoreColor(quality.completeness)}>
						{(quality.completeness * 100).toFixed(0)}%
					</span>
				</div>
				<div className="flex items-center gap-1">
					<span className="text-[var(--text-tertiary)]">准确性:</span>
					<span className={getScoreColor(quality.accuracy)}>
						{(quality.accuracy * 100).toFixed(0)}%
					</span>
				</div>
			</div>
			{quality.issues.length > 0 && (
				<div className="mt-1 text-xs text-[var(--text-tertiary)]">
					问题: {quality.issues.join(", ")}
				</div>
			)}
		</div>
	);
};

// 单个思考步骤
const ThinkingStepItem: React.FC<{
	step: ThinkingStep;
	isLast: boolean;
	showDetails: boolean;
	isActive: boolean;
}> = ({ step, isLast, showDetails, isActive }) => {
	const [expanded, setExpanded] = useState(false);
	const phaseColor = getPhaseColor(step.phase);

	const hasMetadata =
		step.metadata &&
		(step.metadata.toolRecommendations?.length ||
			step.metadata.memoryRetrieved?.length ||
			step.metadata.planNodes?.length ||
			step.metadata.quality);

	return (
		<div className="relative">
			{/* 连接线 */}
			{!isLast && (
				<div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-[var(--border-primary)]" />
			)}

			<div className="flex gap-3">
				{/* 图标 */}
				<div
					className={`
          flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
          border ${phaseColor}
          ${isLast && isActive ? "animate-pulse" : ""}
        `}
				>
					<PhaseIcon phase={step.phase} />
				</div>

				{/* 内容 */}
				<div className="flex-1 min-w-0 pb-4">
					<div className="flex items-center gap-2">
						<span className={`text-sm font-medium ${phaseColor.split(" ")[0]}`}>
							{getPhaseName(step.phase)}
						</span>
						<span className="text-xs text-[var(--text-tertiary)]">
							{step.title}
						</span>
						{step.duration && (
							<span className="text-xs text-[var(--text-tertiary)]">
								{step.duration}ms
							</span>
						)}
						{hasMetadata && showDetails && (
							<button
								onClick={() => setExpanded(!expanded)}
								className="p-0.5 hover:bg-[var(--bg-secondary)] rounded"
							>
								{expanded ? (
									<ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />
								) : (
									<ChevronRight className="w-3 h-3 text-[var(--text-tertiary)]" />
								)}
							</button>
						)}
					</div>

					<div className="mt-1 text-sm text-[var(--text-secondary)] break-words whitespace-pre-wrap">
						{step.content}
					</div>

					{/* 详细信息 */}
					{expanded && showDetails && step.metadata && (
						<div className="mt-2">
							{step.metadata.toolRecommendations && (
								<ToolRecommendations
									recommendations={step.metadata.toolRecommendations}
								/>
							)}
							{step.metadata.memoryRetrieved && (
								<MemoryDisplay memories={step.metadata.memoryRetrieved} />
							)}
							{step.metadata.planNodes && (
								<PlanNodesDisplay nodes={step.metadata.planNodes} />
							)}
							{step.metadata.quality && (
								<QualityDisplay quality={step.metadata.quality} />
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

// ==================== 主组件 ====================

export const ThinkingProcess: React.FC<ThinkingProcessProps> = ({
	steps,
	isActive,
	showDetails = true,
	className = "",
}) => {
	const containerRef = useRef<HTMLDivElement>(null);

	// 自动滚动到底部
	useEffect(() => {
		if (containerRef.current && isActive) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [steps, isActive]);

	if (steps.length === 0) {
		return null;
	}

	return (
		<div
			ref={containerRef}
			className={`
        bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]
        overflow-auto max-h-96
        ${className}
      `}
		>
			{/* 标题 */}
			<div className="sticky top-0 bg-[var(--bg-primary)] border-b border-[var(--border-primary)] px-4 py-2 flex items-center gap-2">
				<Brain className="w-4 h-4 text-[var(--text-secondary)]" />
				<span className="text-sm font-medium text-[var(--text-primary)]">
					思考过程
				</span>
				{isActive && (
					<span className="text-xs text-[var(--accent-primary)] animate-pulse">
						思考中...
					</span>
				)}
				<span className="text-xs text-[var(--text-tertiary)] ml-auto">
					{steps.length} 步
				</span>
			</div>

			{/* 步骤列表 */}
			<div className="p-4 space-y-0">
				{steps.map((step, idx) => (
					<ThinkingStepItem
						key={step.id}
						step={step}
						isLast={idx === steps.length - 1}
						showDetails={showDetails}
						isActive={isActive && idx === steps.length - 1}
					/>
				))}
			</div>
		</div>
	);
};

// 紧凑版思考展示（用于消息内联）
export const ThinkingProcessCompact: React.FC<{
	steps: ThinkingStep[];
	isActive: boolean;
}> = ({ steps, isActive }) => {
	const [expanded, setExpanded] = useState(false);

	if (steps.length === 0) return null;

	const lastStep = steps[steps.length - 1];

	return (
		<div className="text-sm">
			<button
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
			>
				<Brain
					className={`w-4 h-4 ${isActive ? "animate-pulse text-[var(--accent-primary)]" : ""}`}
				/>
				<span>
					{isActive
						? `${getPhaseName(lastStep.phase)}...`
						: `思考了 ${steps.length} 步`}
				</span>
				{expanded ? (
					<ChevronDown className="w-3 h-3" />
				) : (
					<ChevronRight className="w-3 h-3" />
				)}
			</button>

			{expanded && (
				<div className="mt-2 pl-6 border-l-2 border-[var(--border-primary)] space-y-1">
					{steps.map((step, _idx) => (
						<div
							key={step.id}
							className="text-xs text-[var(--text-tertiary)] flex items-center gap-2"
						>
							<PhaseIcon phase={step.phase} className="w-3 h-3" />
							<span className={getPhaseColor(step.phase).split(" ")[0]}>
								{getPhaseName(step.phase)}
							</span>
							<span className="truncate">{step.title}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default ThinkingProcess;
