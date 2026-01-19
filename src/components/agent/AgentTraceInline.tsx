import {
	BookOpen,
	Brain,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Clock,
	FolderOpen,
	Globe,
	Loader2,
	Pause,
	Play,
	Search,
	Sparkles,
	Wrench,
	XCircle,
	Zap,
} from "lucide-react";
import React from "react";
import { useAgentStore } from "../../lib/agent/store";
import {
	TOOL_ICONS,
	type ToolArtifact,
	type ToolCall,
	type ToolType,
} from "../../lib/agent/types";
import { InlineImage } from "../ui/InlineImage";
import { SkillCard } from "./SkillCard";
import TaskSteps from "./TaskSteps";

const ToolIconMap: Record<string, React.ElementType> = {
	Search,
	BookOpen,
	Globe,
	FolderOpen,
	Sparkles,
	Wrench,
};

function getToolIcon(type: ToolType): React.ElementType {
	const iconName = TOOL_ICONS[type];
	return ToolIconMap[iconName] || Wrench;
}

function ToolStatusIcon({ status }: { status: ToolCall["status"] }) {
	switch (status) {
		case "running":
			return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />;
		case "completed":
			return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
		case "error":
			return <XCircle className="w-3.5 h-3.5 text-red-500" />;
		default:
			return <Clock className="w-3.5 h-3.5 text-zinc-400" />;
	}
}

function formatDurationMs(ms?: number) {
	if (!ms || ms <= 0) return "";
	return `${(ms / 1000).toFixed(1)}s`;
}

function ArtifactRow({ artifact }: { artifact: ToolArtifact }) {
	const Icon =
		artifact.type === "url"
			? Globe
			: artifact.type === "text"
				? BookOpen
				: Sparkles;

	return (
		<div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-zinc-900/40 ring-1 ring-black/5 dark:ring-white/10">
			<div className="mt-0.5 p-1.5 rounded-lg bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
				<Icon className="w-3.5 h-3.5 text-zinc-500" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate">
					{artifact.title}
				</div>
				{artifact.url ? (
					<div className="text-[11px] text-zinc-400 truncate">
						{artifact.url}
					</div>
				) : artifact.content ? (
					<div className="text-[11px] text-zinc-400 line-clamp-2 whitespace-pre-wrap">
						{artifact.content}
					</div>
				) : null}

				{artifact.type === "image" && artifact.url ? (
					<div className="mt-2">
						<InlineImage path={artifact.url} title={artifact.title} />
					</div>
				) : null}
			</div>
		</div>
	);
}

function ToolCallRow({ toolCall }: { toolCall: ToolCall }) {
	const Icon = getToolIcon(toolCall.type);
	const duration = formatDurationMs(toolCall.duration);
	const progress = toolCall.metadata?.progress as number | undefined;
	const progressMessage = toolCall.metadata?.message as string | undefined;
	const [isExpanded, setIsExpanded] = React.useState(false);

	// 判断是否有详细内容需要展开
	const hasDetails =
		toolCall.output &&
		(toolCall.type === "kb_search_chunks" ||
			toolCall.type === "web_search" ||
			toolCall.type === "fetch_url" ||
			toolCall.type === "code_execute" ||
			(typeof toolCall.output === "object" &&
				Object.keys(toolCall.output).length > 0));

	// 获取结果摘要
	const getResultSummary = () => {
		if (!toolCall.output) return null;

		if (toolCall.type === "kb_search_chunks") {
			const hits = (toolCall.output as any)?.hits || [];
			return `找到 ${hits.length} 条结果`;
		}

		if (toolCall.type === "web_search") {
			const results = (toolCall.output as any)?.results || [];
			return `找到 ${results.length} 条结果`;
		}

		if (toolCall.type === "fetch_url") {
			const title =
				(toolCall.output as any)?.title ||
				(toolCall.output as any)?.data?.title;
			return title ? `已获取: ${title}` : "已获取内容";
		}

		if (toolCall.type === "code_execute") {
			// 根据工具调用状态判断，而不是 output.success（因为 output 存储的是 data，不包含 success）
			if (toolCall.status === "completed") {
				const output = (toolCall.output as any)?.output || "";
				return output
					? `执行成功: ${output.slice(0, 50)}${output.length > 50 ? "..." : ""}`
					: "执行成功";
			} else if (toolCall.status === "error") {
				return "执行失败";
			}
			return null;
		}

		return null;
	};

	// skill_invoke 工具调用显示技能激活卡片（简化版）
	if (toolCall.type === "skill_invoke") {
		const skillData = (toolCall.output as any)?.data || toolCall.output;
		if (skillData?.skillName || skillData?.instructions) {
			return (
				<div className="mb-2 rounded-xl bg-purple-50/50 dark:bg-purple-900/10 ring-1 ring-purple-200/50 dark:ring-purple-800/30 overflow-hidden">
					<div className="flex items-center gap-2 px-3 py-2">
						<div className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
							<Zap className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-xs font-medium text-purple-800 dark:text-purple-200">
									技能已激活: {skillData.skillName}
								</span>
								{toolCall.status === "completed" && (
									<span className="px-1.5 py-0.5 text-[9px] rounded font-medium bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">
										就绪
									</span>
								)}
							</div>
							{skillData.description && (
								<div className="text-[11px] text-purple-600/70 dark:text-purple-400/70 truncate">
									{skillData.description}
								</div>
							)}
						</div>
					</div>
					{/* 指令预览 */}
					{skillData.instructions && (
						<div className="px-3 pb-2">
							<div className="text-[10px] text-purple-500 dark:text-purple-400/80 line-clamp-2">
								已加载 {Math.round(skillData.instructions.length / 1000)}KB
								技能指令
							</div>
						</div>
					)}
				</div>
			);
		}
	}

	// skill_call 工具调用显示完整技能卡片
	if (toolCall.type === "skill_call") {
		const skillExecution = toolCall.metadata?.skillExecution;
		if (skillExecution?.skillName) {
			return (
				<div className="mb-2">
					<SkillCard skill={skillExecution} compact />
				</div>
			);
		}
	}

	return (
		<div className="rounded-xl bg-white/60 dark:bg-zinc-900/40 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			<button
				onClick={() => hasDetails && setIsExpanded((v) => !v)}
				className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-white/80 dark:hover:bg-zinc-900/60 transition-colors"
				disabled={!hasDetails}
			>
				<div className="mt-0.5 p-1.5 rounded-lg bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
					<Icon className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
							{toolCall.name}
						</div>
						<ToolStatusIcon status={toolCall.status} />
						{duration ? (
							<div className="text-[11px] text-zinc-400">{duration}</div>
						) : null}
						{hasDetails ? (
							<div className="ml-auto">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
								)}
							</div>
						) : null}
					</div>
					{toolCall.description ? (
						<div className="text-[11px] text-zinc-400 line-clamp-1">
							{toolCall.description}
						</div>
					) : null}
					{getResultSummary() && !isExpanded ? (
						<div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
							{getResultSummary()}
						</div>
					) : null}
					{progress !== undefined && toolCall.status === "running" ? (
						<div className="mt-1.5 space-y-1">
							<div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
								<div
									className="h-full bg-blue-500 transition-all duration-300"
									style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
								/>
							</div>
							{progressMessage ? (
								<div className="text-[11px] text-zinc-500 dark:text-zinc-400">
									{progressMessage}
								</div>
							) : null}
						</div>
					) : null}
					{toolCall.status === "error" && toolCall.error ? (
						<div className="mt-1 text-[11px] text-red-600 dark:text-red-400 break-words">
							{toolCall.error}
						</div>
					) : null}
					{toolCall.metadata?.message && progress === undefined ? (
						<div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
							{String(toolCall.metadata.message)}
						</div>
					) : null}
				</div>
			</button>

			{/* 展开的详细内容 */}
			{isExpanded && toolCall.output && (
				<div className="px-3 pb-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
					{toolCall.type === "code_execute" ? (
						<div className="mt-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/30">
							<div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
								执行结果
							</div>
							<pre className="text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
								{(toolCall.output as any)?.output || "无输出"}
							</pre>
							{(toolCall.output as any)?.duration_ms ? (
								<div className="text-[10px] text-zinc-400 mt-1">
									执行时间:{" "}
									{((toolCall.output as any).duration_ms / 1000).toFixed(2)} 秒
								</div>
							) : null}
						</div>
					) : toolCall.type === "kb_search_chunks" ? (
						<div className="mt-2 space-y-2">
							{((toolCall.output as any)?.hits || []).map(
								(hit: any, idx: number) => (
									<div
										key={idx}
										className="text-[11px] text-zinc-600 dark:text-zinc-400 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/30"
									>
										<div className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">
											{hit.source_title || "未知"} · #{hit.chunk_index}
											{hit.score ? (
												<span className="ml-2 text-[10px] text-zinc-400">
													score: {hit.score.toFixed(3)}
												</span>
											) : null}
										</div>
										<div className="line-clamp-3 whitespace-pre-wrap">
											{hit.snippet || ""}
										</div>
									</div>
								),
							)}
						</div>
					) : toolCall.type === "web_search" ? (
						<div className="mt-2 space-y-2">
							{((toolCall.output as any)?.results || [])
								.slice(0, 5)
								.map((result: any, idx: number) => (
									<div
										key={idx}
										className="text-[11px] text-zinc-600 dark:text-zinc-400 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/30"
									>
										<div className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">
											{result.title || "无标题"}
										</div>
										<div className="text-[10px] text-zinc-400 mb-1">
											{result.url || ""}
										</div>
										<div className="line-clamp-2">{result.snippet || ""}</div>
									</div>
								))}
						</div>
					) : (
						<div className="mt-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/30">
							<pre className="text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
								{typeof toolCall.output === "string"
									? toolCall.output
									: JSON.stringify(toolCall.output, null, 2)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default function AgentTraceInline({ taskId }: { taskId?: string }) {
	const { currentTask, taskHistory, isExecuting, pauseTask, resumeTask } =
		useAgentStore();
	const [open, setOpen] = React.useState(true);
	const [thinkingOpen, setThinkingOpen] = React.useState(false);
	const [artifactPreview, setArtifactPreview] = React.useState<string | null>(
		null,
	);

	const task = taskId
		? currentTask?.id === taskId
			? currentTask
			: taskHistory.find((t) => t.id === taskId) || null
		: currentTask;

	if (!task) return null;

	const thinking = task.metadata?.thinking as string | undefined;
	const canPause = task.status === "executing" || task.status === "planning";
	const canResume = task.status === "waiting";

	const statusLabel: Record<string, string> = {
		planning: "规划中",
		executing: "执行中",
		completed: "已完成",
		error: "出错",
		cancelled: "已取消",
		idle: "空闲",
		waiting: "等待",
	};

	const statusText = statusLabel[task.status] || task.status;
	const isThisTaskExecuting = taskId
		? isExecuting && currentTask?.id === taskId
		: isExecuting;

	return (
		<div className="mt-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/40 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			<button
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center justify-between px-3 py-2.5 text-left"
			>
				<div className="flex items-center gap-2 min-w-0">
					<div className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
						<Sparkles className="w-3.5 h-3.5 text-indigo-500" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
								Agent 运行过程
							</div>
							<div className="text-[11px] text-zinc-400">{statusText}</div>
							{isThisTaskExecuting ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
							) : null}
						</div>
						<div className="text-[11px] text-zinc-400 truncate">
							工具 {task.toolCalls.length} · 资料 {task.artifacts.length}
						</div>
					</div>
				</div>
				<div className="text-zinc-400">
					{open ? (
						<ChevronDown className="w-4 h-4" />
					) : (
						<ChevronRight className="w-4 h-4" />
					)}
				</div>
			</button>

			{open ? (
				<div className="px-3 pb-3 space-y-3">
					{/* 思考过程 */}
					{thinking ? (
						<div className="rounded-xl bg-amber-50/50 dark:bg-amber-900/10 ring-1 ring-amber-200/50 dark:ring-amber-800/30 overflow-hidden">
							<button
								onClick={() => setThinkingOpen((v) => !v)}
								className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
							>
								<div className="flex items-center gap-2">
									<Brain className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
									<span className="text-xs font-medium text-amber-800 dark:text-amber-200">
										思考过程
									</span>
								</div>
								{thinkingOpen ? (
									<ChevronDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
								)}
							</button>
							{thinkingOpen ? (
								<div className="px-3 pb-3">
									<div className="text-xs text-amber-700 dark:text-amber-300 whitespace-pre-wrap leading-relaxed">
										{thinking}
									</div>
								</div>
							) : null}
						</div>
					) : null}

					{/* 暂停/恢复按钮 */}
					{canPause || canResume ? (
						<div className="flex gap-2">
							{canPause ? (
								<button
									onClick={() => pauseTask()}
									className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200"
								>
									<Pause className="w-3.5 h-3.5" />
									暂停
								</button>
							) : null}
							{canResume ? (
								<button
									onClick={() => resumeTask()}
									className="flex-1 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5 text-xs font-medium text-white"
								>
									<Play className="w-3.5 h-3.5" />
									继续
								</button>
							) : null}
						</div>
					) : null}

					{task.steps && task.steps.length > 0 ? (
						<TaskSteps steps={task.steps} />
					) : null}

					{task.toolCalls.length > 0 ? (
						<div className="space-y-2">
							{task.toolCalls.slice(-8).map((tc) => (
								<ToolCallRow key={tc.id} toolCall={tc} />
							))}
						</div>
					) : (
						<div className="px-3 py-3 text-xs text-zinc-400">
							尚未开始工具调用
						</div>
					)}

					{/* 只显示非资料库检索的 Artifacts（资料库检索的结果已经在工具调用中显示了） */}
					{(() => {
						// 过滤掉来自资料库检索的 Artifacts（通过 metadata 判断）
						const nonKbArtifacts = task.artifacts.filter((a) => {
							// 如果 artifact 的 metadata 中有 chunkId 或 sourceId，说明来自资料库检索
							const isFromKb = a.metadata?.chunkId || a.metadata?.sourceId;
							return !isFromKb;
						});

						return nonKbArtifacts.length > 0 ? (
							<div className="space-y-2">
								<div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 px-1">
									其他资料 ({nonKbArtifacts.length})
								</div>
								{nonKbArtifacts.slice(0, 6).map((a) => (
									<div key={a.id}>
										{a.type === "image" ? (
											<ArtifactRow artifact={a} />
										) : (
											<button
												onClick={() =>
													setArtifactPreview(
														artifactPreview === a.id ? null : a.id,
													)
												}
												className="w-full"
											>
												<ArtifactRow artifact={a} />
											</button>
										)}
										{artifactPreview === a.id && a.content ? (
											<div className="mt-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 ring-1 ring-black/5 dark:ring-white/10">
												<div className="text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
													{a.content.slice(0, 1000)}
													{a.content.length > 1000 ? "..." : ""}
												</div>
											</div>
										) : null}
									</div>
								))}
							</div>
						) : null;
					})()}

					{task.error ? (
						<div className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">
							{task.error}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
