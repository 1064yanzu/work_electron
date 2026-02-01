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
	RotateCcw,
	Search,
	Sparkles,
	Wrench,
	XCircle,
	Zap,
	Database,
	Archive,
} from "lucide-react";
import React, { memo, useState } from "react";
import { useAgentStore, useAgentStoreSelector } from "../../lib/agent/store";

import {
	TOOL_ICONS,
	type ToolArtifact,
	type ToolCall,
	type ToolType,
} from "../../lib/agent/types";
import { cn } from "../../lib/utils";
import { safeInvoke } from "../../lib/tauriBridge";
import { InlineImage } from "../ui/InlineImage";
import { WebPreviewCard } from "../chat/WebPreviewCard";
import { SkillCard } from "./SkillCard";
import { SubagentCard } from "./SubagentCard";
import TaskSteps from "./TaskSteps";
import { getCheckpoint, deleteCheckpoint } from "../../lib/agent/api";

/**
 * 恢复任务按钮组件
 * 从检查点恢复失败的任务执行
 */
function ResumeFromCheckpointButton({ taskId }: { taskId: string }) {
	const [isLoading, setIsLoading] = useState(false);
	const [hasCheckpoint, setHasCheckpoint] = useState<boolean | null>(null);
	const [error, setError] = useState<string | null>(null);

	// 检查是否有检查点
	React.useEffect(() => {
		const checkForCheckpoint = async () => {
			try {
				const checkpoint = await getCheckpoint(taskId);
				setHasCheckpoint(!!checkpoint);
			} catch {
				setHasCheckpoint(false);
			}
		};
		checkForCheckpoint();
	}, [taskId]);

	const handleResume = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const checkpoint = await getCheckpoint(taskId);
			if (!checkpoint) {
				setError("未找到检查点");
				return;
			}

			// 动态导入避免循环依赖
			const { agentExecutor } = await import("../../lib/agent/executor");

			// 使用检查点数据恢复执行
			const metadata = checkpoint.metadata as {
				query?: string;
				systemPrompt?: string;
				model?: string;
			};

			await agentExecutor.executeCustomTask(
				metadata.query || "继续之前的任务",
				metadata.systemPrompt,
				{},
				{
					resumeSessionId: checkpoint.sdk_session_id,
					workingDirectory: checkpoint.sandbox_dir,
				},
			);

			// 成功后删除检查点
			await deleteCheckpoint(taskId);
		} catch (err) {
			setError(err instanceof Error ? err.message : "恢复失败");
		} finally {
			setIsLoading(false);
		}
	};

	// 没有检查点或正在检查时不显示
	if (hasCheckpoint === null || hasCheckpoint === false) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			<button
				onClick={handleResume}
				disabled={isLoading}
				className={cn(
					"flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all",
					isLoading
						? "bg-zinc-100 text-zinc-400 cursor-wait dark:bg-zinc-800"
						: "bg-blue-500 hover:bg-blue-600 text-white shadow-sm hover:shadow",
				)}
			>
				{isLoading ? (
					<>
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						恢复中...
					</>
				) : (
					<>
						<RotateCcw className="w-3.5 h-3.5" />
						从断点继续
					</>
				)}
			</button>
			{error && (
				<div className="text-[11px] text-red-500 dark:text-red-400 text-center">
					{error}
				</div>
			)}
		</div>
	);
}

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

// 命令语法高亮组件
const CommandHighlight = memo(function CommandHighlight({ command }: { command: string }) {
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
						<span
							key={idx}
							className="text-blue-600 dark:text-blue-400 font-semibold"
						>
							{part}
						</span>
					);
				}

				// 选项（以 - 或 -- 开头）
				if (trimmed.startsWith("-")) {
					return (
						<span key={idx} className="text-rose-600 dark:text-rose-400">
							{part}
						</span>
					);
				}

				// 操作符（&&, ||, |, >, <）
				if (["&&", "||", "|", ">", "<", ">>"].includes(trimmed)) {
					return (
						<span
							key={idx}
							className="text-purple-600 dark:text-purple-400 font-semibold"
						>
							{part}
						</span>
					);
				}

				// 其他参数
				return (
					<span key={idx} className="text-zinc-700 dark:text-zinc-300">
						{part}
					</span>
				);
			})}
		</div>
	);
});

const ArtifactRow = memo(function ArtifactRow({ artifact }: { artifact: ToolArtifact }) {
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
					? Zap
					: Sparkles;

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
		<div className="rounded-xl bg-white/60 dark:bg-zinc-900/40 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			{/* 头部信息 */}
			<div
				className={cn(
					"flex items-start gap-2 px-3 py-2",
					isPreviewable &&
					"cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors",
				)}
				onClick={isPreviewable ? togglePreview : undefined}
			>
				<div className="mt-0.5 p-1.5 rounded-lg bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
					{loadingContent ? (
						<Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
					) : (
						<Icon className="w-3.5 h-3.5 text-zinc-500" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate">
							{artifact.title}
						</div>
						{isPreviewable && (
							<div className="flex items-center gap-1 text-[10px] text-zinc-400">
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
						<div className="text-[11px] text-zinc-400 truncate">
							{artifact.url}
						</div>
					) : artifact.content && !showPreview ? (
						<div className="text-[11px] text-zinc-400 line-clamp-2 whitespace-pre-wrap">
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
				<div className="border-t border-zinc-100 dark:border-zinc-800">
					<WebPreviewCard kind="html" html={fileContent} title={fileName} />
				</div>
			)}

			{/* 代码/文本预览 */}
			{showPreview && !isHtmlFile && (fileContent || artifact.content) && (
				<div className="border-t border-zinc-100 dark:border-zinc-800 max-h-60 overflow-y-auto">
					<pre className="px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words font-mono">
						{(fileContent || artifact.content || "").slice(0, 3000)}
						{(fileContent || artifact.content || "").length > 3000 &&
							"\n... (内容过长已截断)"}
					</pre>
				</div>
			)}

			{/* PDF 预览 */}
			{isPdfFile && artifact.url && showPreview && (
				<div className="border-t border-zinc-100 dark:border-zinc-800 h-80">
					<iframe
						src={toFileUrl(artifact.url)}
						title="PDF Preview"
						className="w-full h-full"
					/>
				</div>
			)}

			{/* 视频预览 */}
			{isVideoFile && artifact.url && showPreview && (
				<div className="border-t border-zinc-100 dark:border-zinc-800">
					<video
						controls
						src={toFileUrl(artifact.url)}
						className="w-full max-h-[360px] bg-black"
					/>
				</div>
			)}

			{/* 音频预览 */}
			{isAudioFile && artifact.url && showPreview && (
				<div className="border-t border-zinc-100 dark:border-zinc-800 p-3">
					<audio controls src={toFileUrl(artifact.url)} className="w-full" />
				</div>
			)}
		</div>
	);
});

const ToolCallRow = memo(function ToolCallRow({ toolCall }: { toolCall: ToolCall }) {
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
				<div className="mb-2 rounded-xl bg-white/60 dark:bg-zinc-900/40 ring-1 ring-zinc-200/30 dark:ring-zinc-700/30 overflow-hidden">
					<div className="flex items-center gap-2 px-3 py-2">
						<div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20">
							<Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
									技能已激活: {skillData.skillName}
								</span>
								{toolCall.status === "completed" && (
									<span className="px-1.5 py-0.5 text-[9px] rounded font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
										就绪
									</span>
								)}
							</div>
							{skillData.description && (
								<div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
									{skillData.description}
								</div>
							)}
						</div>
					</div>
					{/* 指令预览 */}
					{skillData.instructions && (
						<div className="px-3 pb-2">
							<div className="text-[10px] text-zinc-400 dark:text-zinc-500 line-clamp-2">
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
						? "bg-white/80 dark:bg-zinc-900/60 ring-2 ring-blue-200/50 dark:ring-blue-800/30 shadow-sm"
						: toolCall.status === "error" || exitCode !== 0
							? "bg-white/80 dark:bg-zinc-900/60 ring-2 ring-red-200/50 dark:ring-red-800/30 shadow-sm"
							: "bg-white/60 dark:bg-zinc-900/40 ring-1 ring-zinc-200/30 dark:ring-zinc-700/30",
				)}
			>
				<button
					onClick={() => setIsExpanded((v) => !v)}
					className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-white/90 dark:hover:bg-zinc-900/70 transition-colors"
				>
					<div
						className={cn(
							"mt-0.5 p-1.5 rounded-lg transition-all duration-200",
							toolCall.status === "running"
								? "bg-blue-50 dark:bg-blue-900/20"
								: toolCall.status === "error" || exitCode !== 0
									? "bg-red-50 dark:bg-red-900/20"
									: "bg-emerald-50 dark:bg-emerald-900/20",
						)}
					>
						<Wrench
							className={cn(
								"w-3.5 h-3.5 transition-colors",
								toolCall.status === "running"
									? "text-blue-600 dark:text-blue-400"
									: toolCall.status === "error" || exitCode !== 0
										? "text-red-600 dark:text-red-400"
										: "text-emerald-600 dark:text-emerald-400",
							)}
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 mb-1.5">
							<span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
								命令行
							</span>
							<ToolStatusIcon status={toolCall.status} />
							{duration ? (
								<div className="text-[11px] font-medium text-zinc-400">
									{duration}
								</div>
							) : null}
							<div className="ml-auto">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200" />
								)}
							</div>
						</div>
						{/* 命令语法高亮 */}
						{command && <CommandHighlight command={command} />}
					</div>
				</button>

				{/* 展开后显示完整输出 */}
				{isExpanded && output && (
					<div className="px-3 pb-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
						<div className="mt-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50">
							<div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-2 flex items-center justify-between">
								<span>输出</span>
								{exitCode !== undefined && (
									<span
										className={cn(
											"px-1.5 py-0.5 rounded text-[10px] font-mono",
											exitCode === 0
												? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
												: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
										)}
									>
										exit {exitCode}
									</span>
								)}
							</div>
							<pre className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
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

	// Task 工具调用（子代理）显示高级卡片
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
					? "bg-white/80 dark:bg-zinc-900/60 ring-2 ring-blue-200/50 dark:ring-blue-800/30 shadow-sm"
					: toolCall.status === "error"
						? "bg-white/80 dark:bg-zinc-900/60 ring-2 ring-red-200/50 dark:ring-red-800/30 shadow-sm"
						: "bg-white/60 dark:bg-zinc-900/40 ring-1 ring-zinc-200/30 dark:ring-zinc-700/30",
			)}
		>
			<button
				onClick={() => hasDetails && setIsExpanded((v) => !v)}
				className={cn(
					"w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors",
					hasDetails &&
					"cursor-pointer hover:bg-white/90 dark:hover:bg-zinc-900/70",
					!hasDetails && "cursor-default",
				)}
				disabled={!hasDetails}
			>
				<div
					className={cn(
						"mt-0.5 p-1.5 rounded-lg transition-all duration-200",
						toolCall.status === "running"
							? "bg-blue-50 dark:bg-blue-900/20"
							: toolCall.status === "error"
								? "bg-red-50 dark:bg-red-900/20"
								: toolCall.status === "completed"
									? "bg-emerald-50 dark:bg-emerald-900/20"
									: "bg-zinc-50 dark:bg-zinc-800/50",
					)}
				>
					<Icon
						className={cn(
							"w-3.5 h-3.5 transition-colors",
							toolCall.status === "running"
								? "text-blue-600 dark:text-blue-400"
								: toolCall.status === "error"
									? "text-red-600 dark:text-red-400"
									: toolCall.status === "completed"
										? "text-emerald-600 dark:text-emerald-400"
										: "text-zinc-500",
						)}
					/>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
							{toolCall.name}
							{toolCall.name === "Task" && toolCall.status === "running" && (
								<span className="ml-2 text-[10px] font-normal text-purple-500 animate-pulse">
									子代理正在思考...
								</span>
							)}
						</div>
						<ToolStatusIcon status={toolCall.status} />
						{duration ? (
							<div className="text-[11px] font-medium text-zinc-400">
								{duration}
							</div>
						) : null}
						{hasDetails ? (
							<div className="ml-auto">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200" />
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
					{toolCall.type === "kb_search_chunks" ? (
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
});

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
							工具 {task.toolCalls.length} · 产物 {task.artifacts.length}
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

					{/* 断点续传：任务失败时显示继续按钮 */}
					{task.status === "error" && (
						<ResumeFromCheckpointButton taskId={task.id} />
					)}

					{/* Context Control & Status */}
					<ContextControl task={task} />
				</div>
			) : null}
		</div>
	);
}

function ContextControl({
	task,
}: {
	task: import("../../lib/agent/types").AgentTask;
}) {
	const { tokenUsage, sdkSessionId } = (task.metadata || {}) as {
		tokenUsage?: { totalTokens: number };
		sdkSessionId?: string;
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

	if (!tokenUsage && !sdkSessionId) return null;

	const percent = Math.min(
		100,
		((tokenUsage?.totalTokens || 0) / 200000) * 100,
	);
	const isHigh = percent > 50;

	return (
		<div className="border-t border-zinc-100 dark:border-zinc-700/50 pt-2 mt-2">
			<div className="flex items-center justify-between px-1">
				<div className="flex items-center gap-2">
					<div className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
						<Database className="w-3 h-3" />
					</div>
					<div className="flex flex-col">
						<span className="text-[10px] uppercase font-medium text-zinc-400 leading-none mb-0.5">
							Context
						</span>
						<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-none">
							{(tokenUsage?.totalTokens || 0).toLocaleString()} tokens
						</span>
					</div>
				</div>

				<div className="flex items-center gap-2">
					{/* Usage Bar */}
					<div className="w-24 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
						<div
							className={`h-full rounded-full transition-all duration-500 ${isHigh ? "bg-amber-400" : "bg-emerald-400"}`}
							style={{ width: `${percent}%` }}
						/>
					</div>

					{/* Compress Button */}
					<button
						onClick={handleCompact}
						disabled={isCompacting || !sdkSessionId}
						className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${isCompacting
							? "bg-zinc-100 text-zinc-400 cursor-wait"
							: "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300"
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
