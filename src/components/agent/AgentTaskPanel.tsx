// Agent 任务面板
// 显示当前任务进度、工具调用历史、收集的资料

import {
	ArrowLeft,
	Brain,
	Camera,
	CheckCircle2,
	ChevronRight,
	Clock,
	ExternalLink,
	FilePlus,
	FileText,
	FolderOpen,
	Globe,
	Loader2,
	Play,
	Plug,
	Search,
	Sparkles,
	Square,
	Terminal,
	Wrench,
	X,
	XCircle,
} from "lucide-react";
import React from "react";
import { agentExecutor } from "../../lib/agent/executor";
import { settingsStore } from "../../lib/settingsStore";
import { useAgentStore } from "../../lib/agent/store";
import {
	TOOL_ICONS,
	type ToolArtifact,
	type ToolCall,
	type ToolType,
} from "../../lib/agent/types";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import ErrorRecovery from "./ErrorRecovery";
import { SkillCard } from "./SkillCard";
import StreamingThought from "./StreamingThought";
import TaskProgress from "./TaskProgress";
import TaskSteps from "./TaskSteps";

// 工具图标映射
const ToolIconMap: Record<string, React.ElementType> = {
	Search,
	Globe,
	Plug,
	FileText,
	FilePlus,
	FolderOpen,
	Terminal,
	ExternalLink,
	Camera,
	Sparkles,
	Wrench,
};

// 获取工具图标组件
function getToolIcon(type: ToolType): React.ElementType {
	const iconName = TOOL_ICONS[type];
	return ToolIconMap[iconName] || Wrench;
}

// 工具调用状态图标
function ToolStatusIcon({ status }: { status: ToolCall["status"] }) {
	switch (status) {
		case "running":
			return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
		case "completed":
			return <CheckCircle2 className="w-4 h-4 text-green-500" />;
		case "error":
			return <XCircle className="w-4 h-4 text-red-500" />;
		case "cancelled":
			return <X className="w-4 h-4 text-zinc-400" />;
		default:
			return <Clock className="w-4 h-4 text-zinc-400" />;
	}
}

// 工具调用卡片
function ToolCallCard({
	toolCall,
	isExpanded,
	onToggle,
}: {
	toolCall: ToolCall;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const isSubagentCall = toolCall.name === "Task";
	const input = toolCall.input as Record<string, unknown> | undefined;
	const subagentType = isSubagentCall
		? String(
				(input as any)?.subagent_type ||
					(input as any)?.agent_type ||
					(input as any)?.subagentType ||
					(input as any)?.agentType ||
					"",
			).trim() || undefined
		: undefined;
	const Icon = isSubagentCall ? Brain : getToolIcon(toolCall.type);
	const statusColors = {
		pending: "bg-zinc-50 dark:bg-zinc-800/50",
		running: "bg-blue-50 dark:bg-blue-900/20",
		completed: "bg-green-50/50 dark:bg-green-900/10",
		error: "bg-red-50/50 dark:bg-red-900/10",
		cancelled: "bg-zinc-50 dark:bg-zinc-800/50",
	};

	return (
		<div
			className={`rounded-xl transition-colors ${statusColors[toolCall.status]}`}
		>
			<button
				onClick={onToggle}
				className="w-full flex items-start gap-3 p-3 text-left"
			>
				<div className="mt-0.5 p-1.5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm">
					<Icon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
							{isSubagentCall
								? `子代理${subagentType ? ` · ${subagentType}` : ""}`
								: toolCall.name}
						</p>
						<ToolStatusIcon status={toolCall.status} />
					</div>
					{toolCall.description && (
						<p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
							{toolCall.description}
						</p>
					)}
					{toolCall.duration && (
						<p className="text-xs text-zinc-400 mt-0.5">
							耗时 {(toolCall.duration / 1000).toFixed(1)}s
						</p>
					)}
				</div>
				<ChevronRight
					className={`w-4 h-4 text-zinc-300 transition-transform ${isExpanded ? "rotate-90" : ""}`}
				/>
			</button>

			{/* 展开详情 */}
			{isExpanded && (
				<div className="px-3 pb-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
					{/* 输入参数 */}
					{toolCall.input && Object.keys(toolCall.input).length > 0 && (
						<div className="p-2 bg-white/50 dark:bg-zinc-800/50 rounded-lg">
							<p className="text-xs font-medium text-zinc-500 mb-1">输入</p>
							<pre className="text-xs text-zinc-600 dark:text-zinc-400 overflow-x-auto">
								{JSON.stringify(toolCall.input, null, 2)}
							</pre>
						</div>
					)}

					{/* 输出结果 */}
					{toolCall.output && (
						<div className="p-2 bg-white/50 dark:bg-zinc-800/50 rounded-lg">
							<p className="text-xs font-medium text-zinc-500 mb-1">输出</p>
							<pre className="text-xs text-zinc-600 dark:text-zinc-400 overflow-x-auto max-h-32">
								{typeof toolCall.output === "string"
									? toolCall.output
									: JSON.stringify(toolCall.output, null, 2)}
							</pre>
						</div>
					)}

					{/* 错误信息 */}
					{toolCall.error && (
						<div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
							<p className="text-xs font-medium text-red-600 dark:text-red-400">
								{toolCall.error}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// Artifact 卡片
function ArtifactCard({
	artifact,
	onClick,
}: {
	artifact: ToolArtifact;
	onClick?: () => void;
}) {
	const typeIcons: Record<ToolArtifact["type"], React.ElementType> = {
		text: FileText,
		image: Camera,
		file: FilePlus,
		url: Globe,
		code: Terminal,
	};
	const Icon = typeIcons[artifact.type] || FileText;

	return (
		<button
			onClick={onClick}
			className="w-full flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-left transition-colors group"
		>
			<div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 shrink-0">
				<Icon className="w-4 h-4" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
					{artifact.title}
				</p>
				{artifact.url && (
					<p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
						{artifact.url}
					</p>
				)}
			</div>
			<ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 shrink-0 mt-1" />
		</button>
	);
}

// 主面板组件
export default function AgentTaskPanel({
	onBack,
	onArtifactClick,
}: {
	onBack?: () => void;
	onArtifactClick?: (artifact: ToolArtifact) => void;
}) {
	const { currentTask, isExecuting, currentSkill } = useAgentStore();
	const [expandedToolCall, setExpandedToolCall] = React.useState<string | null>(
		null,
	);
	const [runtimeHint, setRuntimeHint] = React.useState<string>("");

	// 没有任务时的空状态
	if (!currentTask) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
				<div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
					<Sparkles className="w-8 h-8 text-zinc-400" />
				</div>
				<h3 className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">
					暂无 Agent 任务
				</h3>
				<p className="text-sm text-zinc-400 max-w-[200px]">
					在右侧 AI 助手中发起深度研究或其他 Agent 任务
				</p>
				{onBack && (
					<button
						onClick={onBack}
						className="mt-4 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
					>
						返回资料库
					</button>
				)}
			</div>
		);
	}

	// 任务状态颜色
	const statusColors = {
		idle: "text-zinc-400",
		planning: "text-blue-500",
		executing: "text-blue-600",
		waiting: "text-amber-500",
		completed: "text-green-500",
		error: "text-red-500",
		cancelled: "text-zinc-400",
	};

	const statusLabels = {
		idle: "空闲",
		planning: "规划中",
		executing: "执行中",
		waiting: "等待输入",
		completed: "已完成",
		error: "出错",
		cancelled: "已取消",
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
				{onBack && (
					<button
						onClick={onBack}
						className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
					>
						<ArrowLeft className="w-4 h-4" />
					</button>
				)}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-blue-500" />
						<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
							Agent 任务
						</h2>
						<span className={`text-xs ${statusColors[currentTask.status]}`}>
							{statusLabels[currentTask.status]}
						</span>
					</div>
					<p className="text-xs text-zinc-400 truncate mt-0.5">
						{currentTask.title}
					</p>
				</div>

				{/* 控制按钮 */}
				<div className="flex items-center gap-1">
					{isExecuting ? (
						<>
							<button
								onClick={() => {
									void agentExecutor.setRuntimePermissionMode("default");
									setRuntimeHint("已切换为 default 审批模式");
								}}
								className="px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
								title="运行时切换为 default 审批模式"
							>
								default
							</button>
							<button
								onClick={() => {
									void agentExecutor.setRuntimePermissionMode("acceptEdits");
									setRuntimeHint("已切换为 acceptEdits 模式");
								}}
								className="px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
								title="运行时切换为 acceptEdits 模式"
							>
								acceptEdits
							</button>
							<button
								onClick={() => {
									const model = settingsStore.getActiveModel();
									if (!model) return;
									void agentExecutor.setRuntimeModel(model);
									setRuntimeHint(`已请求切换模型：${model}`);
								}}
								className="px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
								title="运行时切换为当前模型"
							>
								模型
							</button>
							<button
								onClick={() => agentExecutor.cancel()}
								className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
								title="取消任务"
							>
								<Square className="w-4 h-4" />
							</button>
						</>
					) : currentTask.status === "completed" ||
						currentTask.status === "error" ? (
						<button
							onClick={() => {
								// 可以添加重新执行逻辑
							}}
							className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
							title="重新执行"
						>
							<Play className="w-4 h-4" />
						</button>
					) : null}
				</div>
			</div>
			{isExecuting && runtimeHint ? (
				<div className="px-4 py-1 text-[11px] text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
					{runtimeHint}
				</div>
			) : null}

			{/* Content */}
			<div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4">
				{/* 任务进度可视化 */}
				{isExecuting && <TaskProgress />}

				{/* Skill 执行卡片（如果有）*/}
				{currentSkill && <SkillCard skill={currentSkill} />}

				{/* 流式思考展示 */}
				<StreamingThought />

				{/* 错误恢复提示 */}
				<ErrorRecovery
					onAction={(action, suggestion) => {
						console.log("[AgentTaskPanel] 错误恢复操作:", action, suggestion);
						// TODO: 实际处理错误恢复逻辑
					}}
				/>

				{/* 任务步骤 */}
				{currentTask.steps && currentTask.steps.length > 0 && (
					<TaskSteps steps={currentTask.steps} />
				)}

				{/* 工具调用时间线 */}
				{currentTask.toolCalls.length > 0 && (
					<div className="space-y-3">
						<h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
							工具调用 ({currentTask.toolCalls.length})
						</h3>
						<div className="space-y-2">
							{currentTask.toolCalls.map((toolCall) => (
								<ToolCallCard
									key={toolCall.id}
									toolCall={toolCall}
									isExpanded={expandedToolCall === toolCall.id}
									onToggle={() =>
										setExpandedToolCall(
											expandedToolCall === toolCall.id ? null : toolCall.id,
										)
									}
								/>
							))}
						</div>
					</div>
				)}

				{/* 收集的资料 */}
				{currentTask.artifacts.length > 0 && (
					<div className="space-y-3">
						<h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
							收集的资料 ({currentTask.artifacts.length})
						</h3>
						<div className="space-y-2">
							{currentTask.artifacts.map((artifact) => (
								<ArtifactCard
									key={artifact.id}
									artifact={artifact}
									onClick={() => onArtifactClick?.(artifact)}
								/>
							))}
						</div>
					</div>
				)}

				{/* 任务结果 */}
				{currentTask.result && (
					<div className="space-y-3">
						<h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
							任务结果
						</h3>
						<div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
							<article className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
								<MarkdownRenderer
									content={currentTask.result}
									className="text-sm"
								/>
							</article>
						</div>
					</div>
				)}

				{/* 错误信息 */}
				{currentTask.error && (
					<div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
						<p className="text-sm text-red-600 dark:text-red-400">
							⚠️ {currentTask.error}
						</p>
					</div>
				)}

				{/* 执行中的加载状态 */}
				{isExecuting && currentTask.toolCalls.length === 0 && (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="w-6 h-6 animate-spin text-blue-500" />
						<span className="ml-2 text-sm text-zinc-500">正在规划任务...</span>
					</div>
				)}
			</div>
		</div>
	);
}
