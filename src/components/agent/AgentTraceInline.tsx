import {
	Archive,
	ChevronDown,
	ChevronRight,
	Database,
	Loader2,
	MessageSquare,
	Pause,
	Play,
} from "lucide-react";
import React from "react";
import { useAgentStore, useAgentStoreSelector } from "../../lib/agent/store";

import { ArtifactRow } from "./inline/ArtifactRow";
import { ResumeFromCheckpointButton } from "./inline/ResumeFromCheckpointButton";
import {
	groupToolCallsForSwarm,
	toolCallToSwarmAgent,
} from "./inline/swarmGrouping";
import { ToolCallRow } from "./inline/ToolCallRow";
import { SwarmCard } from "./SwarmCard";
import TaskSteps from "./TaskSteps";
import { AgentExecutionFlow } from "./AgentExecutionFlow";

/* CommandHighlight / ArtifactRow / ToolCallRow / swarm 分组 / ResumeFromCheckpointButton /
   getToolIcon / ToolStatusIcon / formatDurationMs — 均已抽到 ./inline/ 子目录（M4 续 2 — 2026-05） */

export default function AgentTraceInline({ taskId }: { taskId?: string }) {
	// 使用选择器分开订阅，避免任何状态变化都触发重渲染
	const currentTask = useAgentStoreSelector((s) => s.currentTask);
	const taskHistory = useAgentStoreSelector((s) => s.taskHistory);
	const isExecuting = useAgentStoreSelector((s) => s.isExecuting);
	// pauseTask 和 resumeTask 是方法，不需要选择器
	const { pauseTask, resumeTask } = useAgentStore();

	const [open, setOpen] = React.useState(false);
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

	React.useEffect(() => {
		if (task.status === "error") setOpen(true);
	}, [task.status]);

	return (
		<div className="mt-4 space-y-3">
			{/* 新的执行流程可视化 */}
			<AgentExecutionFlow task={task} isExecuting={isThisTaskExecuting} />

			{/* 原有的详细信息面板 */}
			<div className="rounded-2xl bg-warm-50/80/40 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
				<button
					onClick={() => setOpen((v) => !v)}
					className="w-full flex items-center justify-between px-3 py-2.5 text-left"
				>
					<div className="flex items-center gap-2 min-w-0">
						<div className="p-1.5 rounded-xl bg-surface ring-1 ring-border">
							<MessageSquare className="w-3.5 h-3.5 bai-icon-violet" />
						</div>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<div className="text-xs font-semibold text-text-primary truncate">
									详细信息
								</div>
								<div className="text-[11px] text-text-light">{statusText}</div>
								{isThisTaskExecuting ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin text-focus" />
								) : null}
							</div>
							<div className="text-[11px] text-text-light truncate">
								工具 {task.toolCalls.length} · 产物 {task.artifacts.length}
							</div>
						</div>
					</div>
					<div className="text-text-light">
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
							<div className="w-full">
								<button
									onClick={() => setThinkingOpen((v) => !v)}
									className="w-full flex items-center gap-2 text-left transition-colors py-0.5 cursor-pointer hover:bg-warm-50/50/30 -mx-1.5 px-1.5 rounded"
								>
									<span className="w-4 h-4 flex items-center justify-center text-text-light flex-shrink-0">
										{thinkingOpen ? (
											<ChevronDown className="w-3.5 h-3.5" />
										) : (
											<ChevronRight className="w-3.5 h-3.5" />
										)}
									</span>
									<span className="text-sm text-text-muted">思考过程</span>
								</button>
								{thinkingOpen ? (
									<div className="mt-2 ml-6 pl-3 border-l-2 border-border">
										<div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
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
										className="flex-1 px-3 py-1.5 rounded-lg bg-warm-300 hover:bg-warm-400 transition-colors flex items-center justify-center gap-1.5 text-xs font-medium text-text-secondary"
									>
										<Pause className="w-3.5 h-3.5" />
										暂停
									</button>
								) : null}
								{canResume ? (
									<button
										onClick={() => resumeTask()}
										className="flex-1 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover transition-colors flex items-center justify-center gap-1.5 text-xs font-medium text-primary-foreground"
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
								{(() => {
									const recentCalls = task.toolCalls.slice(-8);
									const groups = groupToolCallsForSwarm(recentCalls);
									return groups.map((group) => {
										if (group.type === "swarm") {
											const agents = group.calls.map((tc, i) =>
												toolCallToSwarmAgent(tc, i),
											);
											const key = group.calls.map((c) => c.id).join("-");
											return <SwarmCard key={key} agents={agents} />;
										}
										return (
											<ToolCallRow key={group.call.id} toolCall={group.call} />
										);
									});
								})()}
							</div>
						) : (
							<div className="px-3 py-3 text-xs text-text-light">
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
									<div className="text-[11px] font-medium text-text-muted px-1">
										产物预览 ({nonKbArtifacts.length})
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
												<div className="mt-2 px-3 py-2 rounded-xl bg-warm-200/50 ring-1 ring-black/5 dark:ring-white/10">
													<div className="text-[11px] text-text-secondary whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
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
							<div className="px-3 py-2 rounded-xl bg-[rgba(181,51,51,0.08)] text-xs text-error">
								{task.error}
							</div>
						) : null}

						{/* 断点续传：任务失败时显示继续按钮 */}
						{task.status === "error" && (
							<ResumeFromCheckpointButton taskId={task.id} />
						)}

						{/* Context Control & Status */}
						<ContextControl task={task} />
					</div>
				) : null}
			</div>
		</div>
	);
}

function ContextControl({
	task,
}: {
	task: import("../../lib/agent/types").AgentTask;
}) {
	const { tokenUsage, sdkSessionId } = (task.metadata || {}) as {
		tokenUsage?: {
			promptTokens: number;
			completionTokens: number;
			totalTokens: number;
			cacheReadInputTokens?: number;
			cacheCreationInputTokens?: number;
			costUsd?: number;
		};
		sdkSessionId?: string;
	};
	const { agentRole, teamId, delegationMode, teammateMode, maxTeammates } =
		(task.metadata || {}) as {
			agentRole?: string;
			teamId?: string;
			delegationMode?: string;
			teammateMode?: string;
			maxTeammates?: number;
		};
	const [isCompacting, setIsCompacting] = React.useState(false);
	const [compactResult, setCompactResult] = React.useState<string | null>(null);

	const handleCompact = async () => {
		if (!sdkSessionId || isCompacting) return;
		setIsCompacting(true);
		setCompactResult(null);
		try {
			// Import dynamically to avoid circular dependency issues if any
			const { agentExecutor } = await import("../../lib/agent/executor");
			await agentExecutor.executeCustomTask(
				"/compact",
				undefined,
				{ autoExecute: true },
				{ resumeSessionId: sdkSessionId },
			);
			setCompactResult("压缩完成");
		} catch (e) {
			setCompactResult("压缩失败");
		} finally {
			setIsCompacting(false);
			setTimeout(() => setCompactResult(null), 3000);
		}
	};

	if (!tokenUsage && !sdkSessionId && !teamId) return null;

	const percent = Math.min(
		100,
		((tokenUsage?.totalTokens || 0) / 200000) * 100,
	);
	const isHigh = percent > 50;

	return (
		<div className="border-t border-border/50 pt-2 mt-2">
			<div className="flex items-center justify-between px-1">
				<div className="flex items-center gap-2">
					<div className="p-1 rounded bg-warm-200 text-text-muted">
						<Database className="w-3 h-3" />
					</div>
					<div className="flex flex-col">
						<span className="text-[10px] uppercase font-medium text-text-light leading-none mb-0.5">
							Context
						</span>
						<span className="text-xs font-medium text-text-secondary leading-none">
							{(tokenUsage?.totalTokens || 0).toLocaleString()} tokens
							{tokenUsage?.promptTokens !== undefined &&
								tokenUsage?.completionTokens !== undefined && (
									<span className="text-[10px] text-text-muted font-normal ml-1">
										(↑{tokenUsage.promptTokens.toLocaleString()} ↓
										{tokenUsage.completionTokens.toLocaleString()})
									</span>
								)}
						</span>
						{(tokenUsage?.cacheReadInputTokens ||
							tokenUsage?.cacheCreationInputTokens ||
							tokenUsage?.costUsd !== undefined) && (
							<span className="text-[10px] text-text-muted leading-none mt-1">
								cache read{" "}
								{(tokenUsage?.cacheReadInputTokens || 0).toLocaleString()}
								{" · "}
								cache create{" "}
								{(tokenUsage?.cacheCreationInputTokens || 0).toLocaleString()}
								{tokenUsage?.costUsd !== undefined
									? ` · $${tokenUsage.costUsd.toFixed(4)}`
									: ""}
							</span>
						)}
						{teamId && (
							<span className="text-[10px] text-text-muted leading-none mt-1">
								{agentRole || "leader"} · {delegationMode || "hybrid"}
								{teammateMode ? ` · ${teammateMode}` : ""}
								{maxTeammates ? ` · teammates ${maxTeammates}` : ""}
							</span>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2">
					{/* Usage Bar */}
					<div className="w-24 h-1.5 bg-warm-200 rounded-full overflow-hidden">
						<div
							className={`h-full rounded-full transition-all duration-500 ${isHigh ? "bg-peach-500" : "bg-mint-500"}`}
							style={{ width: `${percent}%` }}
						/>
					</div>

					{/* Compress Button */}
					<button
						onClick={handleCompact}
						disabled={isCompacting || !sdkSessionId}
						className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
							isCompacting
								? "bg-warm-200 text-text-light cursor-wait"
								: "bg-warm-200 hover:bg-warm-300 text-text-secondary dark:hover:bg-cream-700"
						}`}
						title="执行 /compact 命令压缩历史"
					>
						{isCompacting ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<Archive className="w-3 h-3" />
						)}
						{compactResult || "压缩"}
					</button>
				</div>
			</div>
		</div>
	);
}
