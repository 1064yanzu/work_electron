import {
	BookOpen,
	ChevronDown,
	ChevronRight,
	Code2,
	Globe,
	Loader2,
	MessageSquare,
	Pause,
	Play,
	Wrench,
	Database,
	Archive,
} from "lucide-react";
import React, { memo, useState } from "react";
import { useAgentStore, useAgentStoreSelector } from "../../lib/agent/store";

import { type ToolArtifact, type ToolCall } from "../../lib/agent/types";
import { cn } from "../../lib/utils";
import { safeInvoke } from "../../lib/tauriBridge";
import { InlineImage } from "../ui/InlineImage";
import { WebPreviewCard } from "../chat/WebPreviewCard";
import { SkillCard } from "./SkillCard";
import { SubagentCard } from "./SubagentCard";
import { SwarmCard, type SwarmAgentInfo } from "./SwarmCard";
import TaskSteps from "./TaskSteps";
import { AgentExecutionFlow } from "./AgentExecutionFlow";
import { getToolIcon, ToolStatusIcon, formatDurationMs } from "./inline/utils";
import { ResumeFromCheckpointButton } from "./inline/ResumeFromCheckpointButton";

/* ResumeFromCheckpointButton, getToolIcon, ToolStatusIcon, formatDurationMs
   已抽出到 ./inline/ 子文件夹（阶段 3 拆解 — 2026-05） */

// 命令语法高亮组件
const CommandHighlight = memo(function CommandHighlight({
	command,
}: {
	command: string;
}) {
	// 简单的语法高亮逻辑
	const parts = command.split(/(\s+)/); // 按空格分割，保留空格

	return (
		<div className="font-mono text-sm">
			{parts.map((part, idx) => {
				const trimmed = part.trim();
				if (!trimmed) return <span key={idx}>{part}</span>;

				// 命令名（第一个词）
				if (idx === 0) {
					return (
						<span key={idx} className="text-focus font-semibold">
							{part}
						</span>
					);
				}

				// 选项（以 - 或 -- 开头）
				if (trimmed.startsWith("-")) {
					return (
						<span key={idx} className="text-error">
							{part}
						</span>
					);
				}

				// 操作符（&&, ||, |, >, <）
				if (["&&", "||", "|", ">", "<", ">>"].includes(trimmed)) {
					return (
						<span key={idx} className="bai-icon-violet font-semibold">
							{part}
						</span>
					);
				}

				// 其他参数
				return (
					<span key={idx} className="text-text-secondary">
						{part}
					</span>
				);
			})}
		</div>
	);
});

const ArtifactRow = memo(function ArtifactRow({
	artifact,
}: {
	artifact: ToolArtifact;
}) {
	const [showPreview, setShowPreview] = useState(false);
	const [fileContent, setFileContent] = useState<string | null>(null);
	const [loadingContent, setLoadingContent] = useState(false);

	const toFileUrl = (p: string): string => {
		const raw = String(p || "").trim();
		if (!raw) return "";
		if (raw.startsWith("file://")) return raw;
		const normalized = raw.replace(/\\/g, "/");
		const isWindowsDrive = /^[a-zA-Z]:\//.test(normalized);
		const encoded = encodeURI(normalized);
		return `${isWindowsDrive ? "file:///" : "file://"}${encoded}`;
	};

	// 判断文件类型
	const fileName = artifact.url?.split("/").pop() || artifact.title;
	const ext = fileName.split(".").pop()?.toLowerCase() || "";
	const isHtmlFile = ext === "html" || ext === "htm";
	const isCodeFile = [
		"js",
		"jsx",
		"ts",
		"tsx",
		"css",
		"json",
		"md",
		"py",
		"rs",
		"go",
	].includes(ext);
	const isPdfFile = ext === "pdf";
	const isVideoFile = ["mp4", "webm", "avi", "mov", "mkv"].includes(ext);
	const isAudioFile = ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext);
	const isPreviewable =
		isHtmlFile ||
		isCodeFile ||
		isPdfFile ||
		isVideoFile ||
		isAudioFile ||
		artifact.type === "code" ||
		artifact.content;

	const Icon =
		artifact.type === "url"
			? Globe
			: artifact.type === "text"
				? BookOpen
				: artifact.type === "code" || isCodeFile
					? Code2
					: MessageSquare;

	// 加载文件内容用于预览
	const loadContentForPreview = async () => {
		if (artifact.content) {
			setFileContent(artifact.content);
			setShowPreview(true);
			return;
		}
		if (artifact.url && (isHtmlFile || isCodeFile)) {
			setLoadingContent(true);
			try {
				const content = await safeInvoke<string>("read_file", {
					path: artifact.url,
				});
				if (content) {
					setFileContent(content);
					setShowPreview(true);
				}
			} catch (e) {
				console.error("[ArtifactRow] Failed to load file:", e);
			}
			setLoadingContent(false);
		}
	};

	const togglePreview = () => {
		if (showPreview) {
			setShowPreview(false);
		} else {
			loadContentForPreview();
		}
	};

	return (
		<div className="rounded-xl bg-surface/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			{/* 头部信息 */}
			<div
				className={cn(
					"flex items-start gap-2 px-3 py-2",
					isPreviewable &&
						"cursor-pointer hover:bg-black/[0.02] dark:hover:bg-surface/[0.02] transition-colors",
				)}
				onClick={isPreviewable ? togglePreview : undefined}
			>
				<div className="mt-0.5 p-1.5 rounded-lg bg-surface ring-1 ring-black/5 dark:ring-white/10">
					{loadingContent ? (
						<Loader2 className="w-3.5 h-3.5 text-text-light animate-spin" />
					) : (
						<Icon className="w-3.5 h-3.5 text-text-muted" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="text-xs font-medium text-text-secondary truncate">
							{artifact.title}
						</div>
						{isPreviewable && (
							<div className="flex items-center gap-1 text-[10px] text-text-light">
								{showPreview ? (
									<>
										<ChevronDown className="w-3 h-3" />
										收起
									</>
								) : (
									<>
										<ChevronRight className="w-3 h-3" />
										预览
									</>
								)}
							</div>
						)}
					</div>
					{artifact.url ? (
						<div className="text-[11px] text-text-light truncate">
							{artifact.url}
						</div>
					) : artifact.content && !showPreview ? (
						<div className="text-[11px] text-text-light line-clamp-2 whitespace-pre-wrap">
							{artifact.content.slice(0, 100)}
							{artifact.content.length > 100 ? "..." : ""}
						</div>
					) : null}
				</div>
			</div>

			{/* 图片预览 */}
			{artifact.type === "image" && artifact.url && (
				<div className="px-3 pb-2">
					<InlineImage path={artifact.url} title={artifact.title} />
				</div>
			)}

			{/* HTML 预览 */}
			{showPreview && isHtmlFile && fileContent && (
				<div className="border-t border-border">
					<WebPreviewCard kind="html" html={fileContent} title={fileName} />
				</div>
			)}

			{/* 代码/文本预览 */}
			{showPreview && !isHtmlFile && (fileContent || artifact.content) && (
				<div className="border-t border-border max-h-60 overflow-y-auto">
					<pre className="px-3 py-2 text-[11px] text-text-secondary whitespace-pre-wrap break-words font-mono">
						{(fileContent || artifact.content || "").slice(0, 3000)}
						{(fileContent || artifact.content || "").length > 3000 &&
							"\n... (内容过长已截断)"}
					</pre>
				</div>
			)}

			{/* PDF 预览 */}
			{isPdfFile && artifact.url && showPreview && (
				<div className="border-t border-border h-80">
					<iframe
						src={toFileUrl(artifact.url)}
						title="PDF Preview"
						className="w-full h-full"
					/>
				</div>
			)}

			{/* 视频预览 */}
			{isVideoFile && artifact.url && showPreview && (
				<div className="border-t border-border">
					<video
						controls
						src={toFileUrl(artifact.url)}
						className="w-full max-h-[360px] bg-black"
					/>
				</div>
			)}

			{/* 音频预览 */}
			{isAudioFile && artifact.url && showPreview && (
				<div className="border-t border-border p-3">
					<audio controls src={toFileUrl(artifact.url)} className="w-full" />
				</div>
			)}
		</div>
	);
});

const ToolCallRow = memo(function ToolCallRow({
	toolCall,
}: {
	toolCall: ToolCall;
}) {
	const Icon = getToolIcon(toolCall.type);
	const duration = formatDurationMs(toolCall.duration);
	const progress = toolCall.metadata?.progress as number | undefined;
	const progressMessage = toolCall.metadata?.message as string | undefined;

	// 智能折叠逻辑：
	// - 正在运行时展开
	// - 完成时折叠
	// - 错误时展开
	const shouldAutoExpand =
		toolCall.status === "running" || toolCall.status === "error";

	const [isExpanded, setIsExpanded] = React.useState(shouldAutoExpand);

	// 监听状态变化，自动调整折叠状态
	React.useEffect(() => {
		if (toolCall.status === "running" || toolCall.status === "error") {
			setIsExpanded(true);
		} else if (toolCall.status === "completed") {
			// 完成后自动折叠
			setIsExpanded(false);
		}
	}, [toolCall.status]);

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
			const payload = toolCall.output as any;
			const results =
				payload?.results || (Array.isArray(payload) ? payload : []);
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
				<div className="mb-2 rounded-xl bg-surface/60 ring-1 ring-border overflow-hidden">
					<div className="flex items-center gap-2 px-3 py-2">
						<div className="p-1.5 rounded-lg bg-warm-200 border border-border">
							<Wrench
								className="w-3.5 h-3.5 text-text-secondary"
								strokeWidth={1.5}
							/>
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-xs font-medium text-text-secondary">
									技能已激活: {skillData.skillName}
								</span>
								{toolCall.status === "completed" && (
									<span className="px-1.5 py-0.5 text-[9px] rounded font-medium bg-[rgba(74,124,89,0.08)] text-success">
										就绪
									</span>
								)}
							</div>
							{skillData.description && (
								<div className="text-[11px] text-text-light truncate">
									{skillData.description}
								</div>
							)}
						</div>
					</div>
					{/* 指令预览 */}
					{skillData.instructions && (
						<div className="px-3 pb-2">
							<div className="text-[10px] text-text-light line-clamp-2">
								已加载 {Math.round(skillData.instructions.length / 1000)}KB
								技能指令
							</div>
						</div>
					)}
				</div>
			);
		}
	}

	// code_execute 特殊展示：命令行卡片
	if (toolCall.type === "code_execute") {
		const command = (toolCall.input as any)?.command || "";
		const output = (toolCall.output as any)?.output || "";
		const exitCode = (toolCall.output as any)?.exit_code;

		return (
			<div
				className={cn(
					"rounded-xl overflow-hidden transition-all duration-300 mb-2",
					toolCall.status === "running"
						? "bg-surface/80/60 ring-2 ring-warm-300 shadow-sm"
						: toolCall.status === "error" || exitCode !== 0
							? "bg-surface/80/60 ring-2 ring-[rgba(181,51,51,0.22)] shadow-sm"
							: "bg-surface/60 ring-1 ring-border",
				)}
			>
				<button
					onClick={() => setIsExpanded((v) => !v)}
					className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-surface/90/70 transition-colors"
				>
					<div
						className={cn(
							"mt-0.5 p-1.5 rounded-lg transition-all duration-200",
							toolCall.status === "running"
								? "bg-warm-200"
								: toolCall.status === "error" || exitCode !== 0
									? "bg-[rgba(181,51,51,0.08)]"
									: "bg-[rgba(74,124,89,0.08)]",
						)}
					>
						<Wrench
							className={cn(
								"w-3.5 h-3.5 transition-colors",
								toolCall.status === "running"
									? "text-focus"
									: toolCall.status === "error" || exitCode !== 0
										? "text-error"
										: "text-success",
							)}
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 mb-1.5">
							<span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">
								命令行
							</span>
							<ToolStatusIcon status={toolCall.status} />
							{duration ? (
								<div className="text-[11px] font-medium text-text-light">
									{duration}
								</div>
							) : null}
							<div className="ml-auto">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-text-light transition-transform duration-200" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-text-light transition-transform duration-200" />
								)}
							</div>
						</div>
						{/* 命令语法高亮 */}
						{command && <CommandHighlight command={command} />}
					</div>
				</button>

				{/* 展开后显示完整输出 */}
				{isExpanded && output && (
					<div className="px-3 pb-3 border-t border-border/50">
						<div className="mt-2 p-3 rounded-lg bg-warm-50/50 border border-border/50">
							<div className="text-[11px] font-medium text-text-muted mb-2 flex items-center justify-between">
								<span>输出</span>
								{exitCode !== undefined && (
									<span
										className={cn(
											"px-1.5 py-0.5 rounded text-[10px] font-mono",
											exitCode === 0
												? "bg-[rgba(74,124,89,0.12)] text-success"
												: "bg-[rgba(181,51,51,0.12)] text-error",
										)}
									>
										exit {exitCode}
									</span>
								)}
							</div>
							<pre className="text-[11px] text-text-secondary font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
								{output}
							</pre>
						</div>
					</div>
				)}
			</div>
		);
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

	// 子代理工具调用（子代理）显示高级卡片
	if (toolCall.name === "Task") {
		console.log("[AgentTraceInline] Rendering SubagentCard for Task:", {
			toolCallId: toolCall.id,
			name: toolCall.name,
		});
		return <SubagentCard toolCall={toolCall} />;
	}

	// 🔍 调试：如果工具名称接近 'Task' 但不完全匹配，打印出来
	if (toolCall.name.toLowerCase().includes("task")) {
		console.warn(
			'[AgentTraceInline] Tool name contains "task" but does not match exactly:',
			{ name: toolCall.name, toolCallId: toolCall.id },
		);
	}

	return (
		<div
			className={cn(
				"rounded-xl overflow-hidden transition-all duration-300 mb-2",
				// 根据状态设置边框和背景
				toolCall.status === "running"
					? "bg-surface/80/60 ring-2 ring-warm-300 shadow-sm"
					: toolCall.status === "error"
						? "bg-surface/80/60 ring-2 ring-[rgba(181,51,51,0.22)] shadow-sm"
						: "bg-surface/60 ring-1 ring-border",
			)}
		>
			<button
				onClick={() => hasDetails && setIsExpanded((v) => !v)}
				className={cn(
					"w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors",
					hasDetails && "cursor-pointer hover:bg-surface/90/70",
					!hasDetails && "cursor-default",
				)}
				disabled={!hasDetails}
			>
				<div
					className={cn(
						"mt-0.5 p-1.5 rounded-lg transition-all duration-200",
						toolCall.status === "running"
							? "bg-warm-200"
							: toolCall.status === "error"
								? "bg-[rgba(181,51,51,0.08)]"
								: toolCall.status === "completed"
									? "bg-[rgba(74,124,89,0.08)]"
									: "bg-warm-50/50",
					)}
				>
					<Icon
						className={cn(
							"w-3.5 h-3.5 transition-colors",
							toolCall.status === "running"
								? "text-focus"
								: toolCall.status === "error"
									? "text-error"
									: toolCall.status === "completed"
										? "text-success"
										: "text-text-muted",
						)}
					/>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="text-xs font-semibold text-text-primary truncate">
							{toolCall.name}
							{toolCall.name === "Task" && toolCall.status === "running" && (
								<span className="ml-2 text-[10px] font-normal bai-icon-violet animate-pulse">
									子代理调用中...
								</span>
							)}
						</div>
						<ToolStatusIcon status={toolCall.status} />
						{duration ? (
							<div className="text-[11px] font-medium text-text-light">
								{duration}
							</div>
						) : null}
						{hasDetails ? (
							<div className="ml-auto">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-text-light transition-transform duration-200" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-text-light transition-transform duration-200" />
								)}
							</div>
						) : null}
					</div>
					{toolCall.description ? (
						<div className="text-[11px] text-text-light line-clamp-1">
							{toolCall.description}
						</div>
					) : null}
					{getResultSummary() && !isExpanded ? (
						<div className="mt-1 text-[11px] text-text-muted">
							{getResultSummary()}
						</div>
					) : null}
					{progress !== undefined && toolCall.status === "running" ? (
						<div className="mt-1.5 space-y-1">
							<div className="h-1.5 bg-warm-300 rounded-full overflow-hidden">
								<div
									className="h-full bg-primary transition-all duration-300"
									style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
								/>
							</div>
							{progressMessage ? (
								<div className="text-[11px] text-text-muted">
									{progressMessage}
								</div>
							) : null}
						</div>
					) : null}
					{toolCall.status === "error" && toolCall.error ? (
						<div className="mt-1 text-[11px] text-error break-words">
							{toolCall.error}
						</div>
					) : null}
					{toolCall.metadata?.message && progress === undefined ? (
						<div className="text-[11px] text-text-muted line-clamp-1">
							{String(toolCall.metadata.message)}
						</div>
					) : null}
				</div>
			</button>

			{/* 展开的详细内容 */}
			{isExpanded && toolCall.output && (
				<div className="px-3 pb-3 border-t border-border/50">
					{toolCall.type === "kb_search_chunks" ? (
						<div className="mt-2 space-y-2">
							{((toolCall.output as any)?.hits || []).map(
								(hit: any, idx: number) => (
									<div
										key={idx}
										className="text-[11px] text-text-secondary p-2 rounded-lg bg-warm-50/30"
									>
										<div className="font-medium text-text-secondary mb-1">
											{hit.source_title || "未知"} · #{hit.chunk_index}
											{hit.score ? (
												<span className="ml-2 text-[10px] text-text-light">
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
										className="text-[11px] text-text-secondary p-2 rounded-lg bg-warm-50/30"
									>
										<div className="font-medium text-text-secondary mb-1">
											{result.title || "无标题"}
										</div>
										<div className="text-[10px] text-text-light mb-1">
											{result.url || ""}
										</div>
										<div className="line-clamp-2">{result.snippet || ""}</div>
									</div>
								))}
						</div>
					) : (
						<div className="mt-2 p-2 rounded-lg bg-warm-50/30">
							<pre className="text-[11px] text-text-secondary whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
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
});

/** 将 Task 类型的 ToolCall 转换为 SwarmAgentInfo */
function toolCallToSwarmAgent(tc: ToolCall, index: number): SwarmAgentInfo {
	const input = tc.input as Record<string, unknown> | undefined;
	const subType =
		typeof input?.subagent_type === "string"
			? input.subagent_type
			: typeof input?.agent_type === "string"
				? input.agent_type
				: "子代理";
	const description =
		typeof input?.description === "string" ? input.description : tc.description;
	const activities = tc.subagentActivities || [];
	const lastActivity =
		activities.length > 0
			? activities[activities.length - 1].content
			: undefined;

	return {
		id: tc.id,
		name: description || subType,
		type: subType,
		index: index + 1,
		status:
			tc.status === "cancelled"
				? "error"
				: (tc.status as SwarmAgentInfo["status"]),
		progress: (tc.metadata?.progress as number) ?? undefined,
		lastActivity,
		duration: tc.duration,
	};
}

/** 将 toolCalls 分组：连续的 Task 调用聚合为蜂群，其他保持原样 */
function groupToolCallsForSwarm(
	toolCalls: ToolCall[],
): Array<
	{ type: "swarm"; calls: ToolCall[] } | { type: "single"; call: ToolCall }
> {
	const groups: Array<
		{ type: "swarm"; calls: ToolCall[] } | { type: "single"; call: ToolCall }
	> = [];

	let currentSwarmBatch: ToolCall[] = [];

	const flushSwarm = () => {
		if (currentSwarmBatch.length >= 2) {
			groups.push({ type: "swarm", calls: [...currentSwarmBatch] });
		} else if (currentSwarmBatch.length === 1) {
			groups.push({ type: "single", call: currentSwarmBatch[0] });
		}
		currentSwarmBatch = [];
	};

	for (const tc of toolCalls) {
		const input = tc.input as Record<string, unknown> | undefined;
		const subType = input?.subagent_type || input?.agent_type;
		const isTaskSubagent = tc.name === "Task" && !!subType;

		if (isTaskSubagent) {
			currentSwarmBatch.push(tc);
		} else {
			flushSwarm();
			groups.push({ type: "single", call: tc });
		}
	}
	flushSwarm();

	return groups;
}

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
