import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	GitBranch,
	Layout,
	Loader2,
	Terminal,
	Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ToolCall } from "../../lib/agent/types";
import { cn } from "../../lib/utils"; // Assuming utils exist
import { MarkdownRenderer } from "../ui/MarkdownRenderer";

interface SubagentCardProps {
	toolCall: ToolCall;
	isExpanded?: boolean;
	onToggleExpand?: () => void;
}

export function SubagentCard({
	toolCall,
	isExpanded: initialExpanded = false,
	onToggleExpand,
}: SubagentCardProps) {
	const [expanded, setExpanded] = useState(initialExpanded);
	const activitiesRef = useRef<HTMLDivElement>(null);

	// 提取子代理信息
	const input = toolCall.input as Record<string, unknown> | undefined;
	const subagentType =
		typeof input?.subagent_type === "string" ? input.subagent_type : undefined;
	const subagentModel =
		typeof input?.model === "string" ? input.model : undefined;
	const subagentDescription =
		typeof input?.description === "string"
			? input.description
			: toolCall.description;

	// Auto-scroll to bottom of activities
	useEffect(() => {
		if (expanded && activitiesRef.current) {
			activitiesRef.current.scrollTop = activitiesRef.current.scrollHeight;
		}
	}, [toolCall.subagentActivities?.length, expanded]);

	const isRunning = toolCall.status === "running";
	const isError = toolCall.status === "error";
	const isCompleted = toolCall.status === "completed";

	const toggleExpand = () => {
		if (onToggleExpand) onToggleExpand();
		else setExpanded(!expanded);
	};

	const activities = toolCall.subagentActivities || [];
	const lastActivity =
		activities.length > 0 ? activities[activities.length - 1] : null;

	return (
		<div
			className={cn(
				"group relative flex flex-col rounded-xl border transition-all duration-300 overflow-hidden",
				isRunning
					? "bg-surface/80/80 border-purple-200 dark:border-purple-800/30 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/20"
					: isError
						? "bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"
						: "bg-surface border-border",
			)}
		>
			{/* Breathing Background Animation for Running State */}
			{isRunning && (
				<div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
					<div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-purple-500/5 animate-pulse-slow" />
					<div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/50 to-transparent w-full animate-scan-line" />
				</div>
			)}

			{/* Header */}
			<div
				className="relative z-10 flex items-center gap-3 p-3 cursor-pointer select-none"
				onClick={toggleExpand}
			>
				{/* Icon & Status Indicator */}
				<div className="relative">
					<div
						className={cn(
							"flex items-center justify-center w-8 h-8 rounded-lg transition-all",
							isRunning
								? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
								: isCompleted
									? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
									: "bg-warm-200 text-text-muted",
						)}
					>
						{isRunning ? (
							<GitBranch className="w-4 h-4 animate-pulse" />
						) : isCompleted ? (
							<Zap className="w-4 h-4" />
						) : (
							<Layout className="w-4 h-4" />
						)}
					</div>
					{isRunning && (
						<span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
							<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
						</span>
					)}
				</div>

				{/* Title & Info */}
				<div className="flex-1 min-w-0 flex flex-col gap-0.5">
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-text-primary truncate">
							子代理调用{subagentType ? ` · ${subagentType}` : ""}
						</span>
						{subagentModel && (
							<span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 truncate max-w-[120px]">
								{subagentModel}
							</span>
						)}
						<div
							className={cn(
								"px-1.5 py-0.5 rounded text-[10px] font-medium",
								isRunning
									? "bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300"
									: isCompleted
										? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300"
										: "bg-warm-200 text-text-muted",
							)}
						>
							{isRunning
								? "运行中"
								: isCompleted
									? "已完成"
									: isError
										? "错误"
										: toolCall.status}
						</div>
					</div>

					{/* Active Status Text */}
					<div className="flex items-center gap-1.5 text-xs text-text-muted h-4">
						{isRunning ? (
							<>
								<Loader2 className="w-3 h-3 animate-spin text-purple-500" />
								<span className="truncate text-purple-600 dark:text-purple-400 font-medium">
									{lastActivity?.content || "子代理调用启动中..."}
								</span>
							</>
						) : (
							<span className="truncate">{subagentDescription}</span>
						)}
					</div>
				</div>

				{/* Expand Toggle */}
				<div className="text-text-light">
					{expanded ? (
						<ChevronDown className="w-4 h-4" />
					) : (
						<ChevronRight className="w-4 h-4" />
					)}
				</div>
			</div>

			{/* Expanded Content: Activities Log */}
			{expanded && (
				<div className="relative z-10 border-t border-border bg-warm-50/50/50">
					<div
						ref={activitiesRef}
						className="max-h-60 overflow-y-auto p-2 space-y-1 font-mono text-xs"
					>
						{/* Parameters */}
						<div className="px-2 py-1.5 mb-2 rounded bg-warm-200 text-text-muted">
							调用参数: {JSON.stringify(toolCall.input)}
						</div>

						{activities.length === 0 && isRunning && (
							<div className="px-3 py-4 text-center text-text-light italic">
								等待子代理响应...
							</div>
						)}

						{activities.map((step) => (
							<div
								key={step.id}
								className="group flex gap-2 px-2 py-1.5 rounded hover:bg-black/5 dark:hover:bg-surface/5 transition-colors"
							>
								<div className="mt-0.5 shrink-0 text-text-light">
									{step.phase === "executing" ? (
										<Terminal className="w-3 h-3 text-amber-500" />
									) : (
										<GitBranch className="w-3 h-3 text-purple-500" />
									)}
								</div>
								<div className="flex-1 min-w-0 break-words text-text-secondary leading-relaxed">
									{step.content}
								</div>
								<div className="shrink-0 text-[10px] text-text-light opacity-0 group-hover:opacity-100 transition-opacity">
									{new Date(step.timestamp).toLocaleTimeString([], {
										hour: "2-digit",
										minute: "2-digit",
										second: "2-digit",
									})}
								</div>
							</div>
						))}

						{/* Result */}
						{isCompleted && toolCall.output && (
							<div className="mt-2 pt-2 border-t border-border/50">
								<div className="px-2 py-1.5 rounded bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300">
									<div className="font-semibold mb-1 flex items-center gap-1.5">
										<Zap className="w-3 h-3" /> 结果
									</div>
									<div className="prose-sm max-w-none [&_.prose]:max-w-none">
										{typeof toolCall.output === "string" ? (
											<MarkdownRenderer content={toolCall.output} />
										) : (
											<pre className="text-[11px] whitespace-pre-wrap break-words">
												{JSON.stringify(toolCall.output, null, 2)}
											</pre>
										)}
									</div>
								</div>
							</div>
						)}

						{/* Error */}
						{isError && toolCall.error && (
							<div className="mt-2 pt-2 border-t border-border/50">
								<div className="px-2 py-1.5 rounded bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300">
									<div className="font-semibold mb-1 flex items-center gap-1.5">
										<AlertTriangle className="w-3 h-3" /> 错误
									</div>
									<div className="whitespace-pre-wrap">{toolCall.error}</div>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
