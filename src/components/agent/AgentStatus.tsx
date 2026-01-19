// Agent 状态显示组件
// 显示当前 Agent 任务的执行状态、工具调用进度等

import {
	AlertCircle,
	Brain,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	FileText,
	Globe,
	Loader2,
	Search,
	Wrench,
	XCircle,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { type AgentTask, type ToolCall, useAgentStore } from "../../lib/agent";
import { cn } from "../../lib/utils";

// 工具图标映射
const toolIcons: Record<string, React.ComponentType<{ className?: string }>> = {
	kb_search_chunks: Search,
	web_search: Globe,
	fetch_url: FileText,
	llm_call: Brain,
	default: Wrench,
};

// 状态颜色
const statusColors: Record<string, string> = {
	pending: "text-zinc-400",
	running: "text-blue-500",
	completed: "text-green-500",
	error: "text-red-500",
	cancelled: "text-zinc-400",
};

// 状态图标
function StatusIcon({
	status,
	className,
}: {
	status: string;
	className?: string;
}) {
	switch (status) {
		case "running":
		case "planning":
		case "executing":
			return <Loader2 className={cn("animate-spin", className)} />;
		case "completed":
			return <CheckCircle2 className={cn("text-green-500", className)} />;
		case "error":
			return <XCircle className={cn("text-red-500", className)} />;
		case "cancelled":
			return <AlertCircle className={cn("text-zinc-400", className)} />;
		default:
			return (
				<div className={cn("w-2 h-2 rounded-full bg-zinc-300", className)} />
			);
	}
}

// 单个工具调用项
function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const Icon = toolIcons[toolCall.type] || toolIcons.default;

	return (
		<div className="border-l-2 border-zinc-200 dark:border-zinc-700 pl-3 py-1">
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center gap-2 w-full text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-1 py-0.5 transition-colors"
			>
				{isExpanded ? (
					<ChevronDown className="w-3 h-3 text-zinc-400" />
				) : (
					<ChevronRight className="w-3 h-3 text-zinc-400" />
				)}
				<Icon className={cn("w-4 h-4", statusColors[toolCall.status])} />
				<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-1 truncate">
					{toolCall.name}
				</span>
				<StatusIcon status={toolCall.status} className="w-4 h-4" />
				{toolCall.duration && (
					<span className="text-xs text-zinc-400">
						{(toolCall.duration / 1000).toFixed(1)}s
					</span>
				)}
			</button>

			{isExpanded && (
				<div className="mt-1 ml-5 text-xs space-y-1">
					{/* 输入参数 */}
					<div className="bg-zinc-50 dark:bg-zinc-800/50 rounded p-2">
						<div className="text-zinc-500 mb-1">输入:</div>
						<pre className="text-zinc-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap">
							{JSON.stringify(toolCall.input, null, 2).slice(0, 500)}
						</pre>
					</div>

					{/* 输出结果 */}
					{toolCall.output && (
						<div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
							<div className="text-green-600 dark:text-green-400 mb-1">
								输出:
							</div>
							<pre className="text-zinc-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap">
								{typeof toolCall.output === "string"
									? toolCall.output.slice(0, 500)
									: JSON.stringify(toolCall.output, null, 2).slice(0, 500)}
							</pre>
						</div>
					)}

					{/* 错误信息 */}
					{toolCall.error && (
						<div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
							<div className="text-red-600 dark:text-red-400 mb-1">错误:</div>
							<pre className="text-red-600 dark:text-red-400 whitespace-pre-wrap">
								{toolCall.error}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// Agent 任务状态
function TaskStatus({ task }: { task: AgentTask }) {
	const [isExpanded, setIsExpanded] = useState(true);

	const completedCount = task.toolCalls.filter(
		(tc) => tc.status === "completed",
	).length;
	const totalCount = task.toolCalls.length;

	return (
		<div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
			{/* 头部 */}
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
			>
				<StatusIcon status={task.status} className="w-5 h-5" />
				<div className="flex-1 text-left">
					<div className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">
						{task.title || task.query.slice(0, 30)}
					</div>
					<div className="text-xs text-zinc-500">
						{task.status === "executing" &&
							`执行中 (${completedCount}/${totalCount})`}
						{task.status === "planning" && "规划中..."}
						{task.status === "completed" && `已完成 (${totalCount} 个工具调用)`}
						{task.status === "error" && "执行失败"}
						{task.status === "cancelled" && "已取消"}
					</div>
				</div>
				{isExpanded ? (
					<ChevronDown className="w-4 h-4 text-zinc-400" />
				) : (
					<ChevronRight className="w-4 h-4 text-zinc-400" />
				)}
			</button>

			{/* 工具调用列表 */}
			{isExpanded && task.toolCalls.length > 0 && (
				<div className="border-t border-zinc-100 dark:border-zinc-800 p-3 space-y-1">
					{task.toolCalls.map((tc) => (
						<ToolCallItem key={tc.id} toolCall={tc} />
					))}
				</div>
			)}

			{/* 错误信息 */}
			{task.error && (
				<div className="border-t border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/20 p-3">
					<div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
						<XCircle className="w-4 h-4" />
						<span>{task.error}</span>
					</div>
				</div>
			)}
		</div>
	);
}

// 主组件
export default function AgentStatus() {
	const { currentTask, isExecuting, taskHistory } = useAgentStore();
	const [showHistory, setShowHistory] = useState(false);

	if (!currentTask && taskHistory.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3">
			{/* 当前任务 */}
			{currentTask && (
				<div>
					<div className="flex items-center gap-2 mb-2">
						<Zap className="w-4 h-4 text-amber-500" />
						<span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
							当前任务
						</span>
						{isExecuting && (
							<span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
								执行中
							</span>
						)}
					</div>
					<TaskStatus task={currentTask} />
				</div>
			)}

			{/* 历史任务 */}
			{taskHistory.length > 0 && (
				<div>
					<button
						onClick={() => setShowHistory(!showHistory)}
						className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
					>
						{showHistory ? (
							<ChevronDown className="w-3 h-3" />
						) : (
							<ChevronRight className="w-3 h-3" />
						)}
						<span>历史任务 ({taskHistory.length})</span>
					</button>

					{showHistory && (
						<div className="mt-2 space-y-2">
							{taskHistory.slice(0, 5).map((task) => (
								<TaskStatus key={task.id} task={task} />
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// 紧凑版状态指示器（用于消息气泡内）
export function AgentStatusBadge({ taskId }: { taskId?: string }) {
	const { currentTask, taskHistory } = useAgentStore();

	const task = taskId
		? currentTask?.id === taskId
			? currentTask
			: taskHistory.find((t) => t.id === taskId)
		: currentTask;

	if (!task) return null;

	const completedCount = task.toolCalls.filter(
		(tc) => tc.status === "completed",
	).length;
	const runningCount = task.toolCalls.filter(
		(tc) => tc.status === "running",
	).length;
	const totalCount = task.toolCalls.length;

	return (
		<div className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
			<StatusIcon status={task.status} className="w-3 h-3" />
			<span className="text-zinc-600 dark:text-zinc-400">
				{task.status === "executing" && `${completedCount}/${totalCount} 工具`}
				{task.status === "planning" && "规划中"}
				{task.status === "completed" && `${totalCount} 个工具`}
				{task.status === "error" && "失败"}
			</span>
			{runningCount > 0 && (
				<Loader2 className="w-3 h-3 animate-spin text-blue-500" />
			)}
		</div>
	);
}
