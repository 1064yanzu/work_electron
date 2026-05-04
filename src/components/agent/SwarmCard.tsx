import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Clock,
	Loader2,
	Network,
	Zap,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { cn } from "../../lib/utils";

// ============ 类型定义 ============

export interface SwarmAgentInfo {
	id: string;
	name: string;
	type: string;
	index: number;
	status: "pending" | "running" | "completed" | "error";
	progress?: number;
	lastActivity?: string;
	duration?: number;
}

export interface SwarmCardProps {
	agents: SwarmAgentInfo[];
	title?: string;
	onAgentClick?: (agentId: string) => void;
}

// ============ 子组件 ============

/** 单个 Agent 行的状态圆形编号 */
const AgentIndexBadge = memo(function AgentIndexBadge({
	index,
	status,
}: {
	index: number;
	status: SwarmAgentInfo["status"];
}) {
	return (
		<div
			className={cn(
				"relative flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 transition-all duration-300",
				status === "running" &&
					"bg-[#D96C46]/15 text-[#D96C46] ring-1 ring-[#D96C46]/30",
				status === "completed" &&
					"bg-success/16 dark:bg-emerald-900/30 text-success dark:text-success",
				status === "error" &&
					"bg-[rgba(181,51,51,0.16)] dark:bg-red-900/30 text-error dark:text-error",
				status === "pending" && "bg-warm-200 text-text-light",
			)}
		>
			{status === "completed" ? (
				<CheckCircle2 className="w-3.5 h-3.5" />
			) : status === "error" ? (
				<AlertTriangle className="w-3 h-3" />
			) : (
				index
			)}
			{/* 运行中的脉冲指示器 */}
			{status === "running" && (
				<span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
					<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D96C46] opacity-60" />
					<span className="relative inline-flex rounded-full h-2 w-2 bg-[#D96C46]" />
				</span>
			)}
		</div>
	);
});

/** 进度条 */
const AgentProgressBar = memo(function AgentProgressBar({
	progress,
	status,
}: {
	progress?: number;
	status: SwarmAgentInfo["status"];
}) {
	if (status === "completed") {
		return (
			<div className="w-16 h-1 rounded-full bg-emerald-200 dark:bg-emerald-800/40 overflow-hidden">
				<div className="h-full w-full bg-emerald-400 dark:bg-success rounded-full" />
			</div>
		);
	}
	if (status === "error") {
		return (
			<div className="w-16 h-1 rounded-full bg-[rgba(181,51,51,0.24)] dark:bg-red-800/40 overflow-hidden">
				<div className="h-full w-full bg-error dark:bg-error rounded-full" />
			</div>
		);
	}
	if (status === "pending") {
		return (
			<div className="w-16 h-1 rounded-full bg-warm-300 dark:bg-cream-700" />
		);
	}
	// running
	const pct = progress ?? 0;
	return (
		<div className="w-16 h-1 rounded-full bg-warm-300 dark:bg-cream-700 overflow-hidden">
			{pct > 0 ? (
				<div
					className="h-full bg-[#D96C46] rounded-full transition-all duration-500"
					style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
				/>
			) : (
				<div className="h-full w-1/3 bg-[#D96C46]/70 rounded-full animate-swarm-indeterminate" />
			)}
		</div>
	);
});

/** 格式化耗时 */
function formatDuration(ms?: number): string {
	if (!ms || ms <= 0) return "";
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

/** 状态文字 */
function statusLabel(status: SwarmAgentInfo["status"]): string {
	switch (status) {
		case "pending":
			return "等待中";
		case "running":
			return "运行中";
		case "completed":
			return "已完成";
		case "error":
			return "错误";
	}
}

/** 单个 Agent 行 */
const SwarmAgentRow = memo(function SwarmAgentRow({
	agent,
	onClick,
}: {
	agent: SwarmAgentInfo;
	onClick?: (id: string) => void;
}) {
	const dur = formatDuration(agent.duration);

	return (
		<button
			type="button"
			onClick={() => onClick?.(agent.id)}
			className={cn(
				"w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200",
				agent.status === "running" &&
					"bg-[#D96C46]/[0.04] dark:bg-[#D96C46]/[0.06]",
				agent.status === "completed" && "opacity-60 hover:opacity-80",
				agent.status === "error" && "bg-[rgba(181,51,51,0.08)]/50 dark:bg-red-900/10",
				agent.status === "pending" && "opacity-50",
				onClick ? "cursor-pointer hover:bg-warm-200/60" : "cursor-default",
			)}
		>
			<AgentIndexBadge index={agent.index} status={agent.status} />

			{/* 名称 + 活动摘要 */}
			<div className="flex-1 min-w-0 flex flex-col gap-0.5">
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-medium text-text-primary truncate">
						{agent.name}
					</span>
					<span className="text-[10px] text-text-light shrink-0">
						#{agent.index}
					</span>
				</div>
				{agent.lastActivity && agent.status === "running" && (
					<div className="flex items-center gap-1 text-[11px] text-text-muted truncate">
						<Loader2 className="w-2.5 h-2.5 animate-spin text-[#D96C46] shrink-0" />
						<span className="truncate">{agent.lastActivity}</span>
					</div>
				)}
			</div>

			{/* 进度条 */}
			<AgentProgressBar progress={agent.progress} status={agent.status} />

			{/* 状态 + 耗时 */}
			<div className="flex items-center gap-1.5 shrink-0">
				<span
					className={cn(
						"text-[10px] font-medium",
						agent.status === "running" && "text-[#D96C46]",
						agent.status === "completed" &&
							"text-success dark:text-success",
						agent.status === "error" && "text-error dark:text-error",
						agent.status === "pending" && "text-text-light",
					)}
				>
					{statusLabel(agent.status)}
				</span>
				{dur && <span className="text-[10px] text-text-light">{dur}</span>}
			</div>
		</button>
	);
});

// ============ 主组件 ============

const DEFAULT_VISIBLE_COUNT = 5;

export const SwarmCard = memo(function SwarmCard({
	agents,
	title = "Agent 集群",
	onAgentClick,
}: SwarmCardProps) {
	const [expanded, setExpanded] = useState(false);

	// 统计
	const stats = useMemo(() => {
		const completed = agents.filter((a) => a.status === "completed").length;
		const running = agents.filter((a) => a.status === "running").length;
		const errored = agents.filter((a) => a.status === "error").length;
		const pending = agents.filter((a) => a.status === "pending").length;
		return { completed, running, errored, pending, total: agents.length };
	}, [agents]);

	const hasAnyRunning = stats.running > 0;
	const allDone =
		stats.completed + stats.errored === stats.total && stats.total > 0;
	const needsExpand = agents.length > DEFAULT_VISIBLE_COUNT;
	const visibleAgents = expanded
		? agents
		: agents.slice(0, DEFAULT_VISIBLE_COUNT);

	// 底部汇总文字
	const summaryText = useMemo(() => {
		if (stats.total === 0) return "等待分配任务...";
		if (allDone) {
			if (stats.errored > 0) {
				return `全部完成 · ${stats.errored} 个出错`;
			}
			return "全部任务已完成";
		}
		if (hasAnyRunning) {
			return `${stats.completed}/${stats.total} 已完成 · ${stats.running} 个运行中`;
		}
		return `正在分配任务...`;
	}, [stats, allDone, hasAnyRunning]);

	return (
		<div
			className={cn(
				"group relative flex flex-col rounded-xl border transition-all duration-300 overflow-hidden mb-2",
				hasAnyRunning
					? "bg-surface/80 border-[#D96C46]/20 dark:border-[#D96C46]/15 shadow-lg shadow-[#D96C46]/5 ring-1 ring-[#D96C46]/15"
					: allDone
						? "bg-surface border-success/30 dark:border-success/30"
						: "bg-surface border-border",
			)}
		>
			{/* 运行中的呼吸背景动画 */}
			{hasAnyRunning && (
				<div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
					<div className="absolute inset-0 bg-gradient-to-r from-[#D96C46]/[0.03] via-orange-500/[0.03] to-[#D96C46]/[0.03] animate-pulse-slow" />
					<div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#D96C46]/40 to-transparent w-full animate-scan-line" />
				</div>
			)}

			{/* 头部 */}
			<div className="relative z-10 flex items-center gap-3 px-3 py-2.5">
				<div className="relative">
					<div
						className={cn(
							"flex items-center justify-center w-8 h-8 rounded-lg transition-all",
							hasAnyRunning
								? "bg-[#D96C46]/10 text-[#D96C46]"
								: allDone
									? "bg-success/16 dark:bg-emerald-900/30 text-success dark:text-success"
									: "bg-warm-200 text-text-muted",
						)}
					>
						{hasAnyRunning ? (
							<Network className="w-4 h-4 animate-pulse" />
						) : allDone ? (
							<Zap className="w-4 h-4" />
						) : (
							<Network className="w-4 h-4" />
						)}
					</div>
					{hasAnyRunning && (
						<span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D96C46] opacity-75" />
							<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#D96C46]" />
						</span>
					)}
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-text-primary">
							{title}
						</span>
						<span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-warm-200 text-text-muted">
							{stats.total} 个并行任务
						</span>
					</div>
					<div className="flex items-center gap-1.5 text-xs text-text-muted mt-0.5">
						{hasAnyRunning && (
							<Loader2 className="w-3 h-3 animate-spin text-[#D96C46]" />
						)}
						{allDone && <CheckCircle2 className="w-3 h-3 text-success" />}
						<span className={cn(hasAnyRunning && "text-[#D96C46] font-medium")}>
							{summaryText}
						</span>
					</div>
				</div>

				{/* 整体进度环 */}
				<SwarmProgressRing
					completed={stats.completed}
					total={stats.total}
					hasError={stats.errored > 0}
				/>
			</div>

			{/* Agent 列表 */}
			<div className="relative z-10 border-t border-border/60">
				<div className="py-1">
					{visibleAgents.map((agent) => (
						<SwarmAgentRow
							key={agent.id}
							agent={agent}
							onClick={onAgentClick}
						/>
					))}
				</div>

				{/* 展开/折叠更多 */}
				{needsExpand && (
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-text-light hover:text-text-secondary dark:hover:text-text-light transition-colors border-t border-border/60"
					>
						{expanded ? (
							<>
								<ChevronDown className="w-3 h-3" />
								收起
							</>
						) : (
							<>
								<ChevronRight className="w-3 h-3" />
								展开更多 ({agents.length - DEFAULT_VISIBLE_COUNT} 个)
							</>
						)}
					</button>
				)}
			</div>

			{/* 底部汇总条 */}
			<div className="relative z-10 flex items-center gap-3 px-3 py-2 border-t border-border/60 bg-warm-50/50/30">
				<SwarmMiniStats stats={stats} />
			</div>
		</div>
	);
});

/** 整体进度环 */
const SwarmProgressRing = memo(function SwarmProgressRing({
	completed,
	total,
	hasError,
}: {
	completed: number;
	total: number;
	hasError: boolean;
}) {
	const pct = total > 0 ? (completed / total) * 100 : 0;
	const radius = 14;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (pct / 100) * circumference;

	return (
		<div className="relative w-9 h-9 shrink-0">
			<svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
				<circle
					cx="18"
					cy="18"
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					className="text-zinc-200"
				/>
				<circle
					cx="18"
					cy="18"
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					className={cn(
						"transition-all duration-500",
						hasError
							? "text-peach-500"
							: pct >= 100
								? "text-success"
								: "text-[#D96C46]",
					)}
				/>
			</svg>
			<div className="absolute inset-0 flex items-center justify-center">
				<span className="text-[9px] font-bold text-text-secondary">
					{completed}/{total}
				</span>
			</div>
		</div>
	);
});

/** 底部迷你统计 */
const SwarmMiniStats = memo(function SwarmMiniStats({
	stats,
}: {
	stats: {
		completed: number;
		running: number;
		errored: number;
		pending: number;
		total: number;
	};
}) {
	return (
		<div className="flex items-center gap-3 text-[10px] font-medium">
			{stats.completed > 0 && (
				<span className="flex items-center gap-1 text-success dark:text-success">
					<CheckCircle2 className="w-3 h-3" />
					{stats.completed} 完成
				</span>
			)}
			{stats.running > 0 && (
				<span className="flex items-center gap-1 text-[#D96C46]">
					<Loader2 className="w-3 h-3 animate-spin" />
					{stats.running} 运行中
				</span>
			)}
			{stats.errored > 0 && (
				<span className="flex items-center gap-1 text-error">
					<AlertTriangle className="w-3 h-3" />
					{stats.errored} 错误
				</span>
			)}
			{stats.pending > 0 && (
				<span className="flex items-center gap-1 text-text-light">
					<Clock className="w-3 h-3" />
					{stats.pending} 等待
				</span>
			)}
		</div>
	);
});
