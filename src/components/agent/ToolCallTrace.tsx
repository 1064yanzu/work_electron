import {
	Activity,
	Check,
	CheckCircle2,
	ChevronDown,
	Clock,
	Code,
	Copy,
	Database,
	File,
	FileCode,
	FileJson,
	FileText,
	FileType,
	Globe,
	Image as ImageIcon,
	Loader2,
	PenLine,
	Search,
	XCircle,
	Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import { cn } from "../../lib/utils";
import { SkillCard } from "./SkillCard";

// 高级感配置
const toolConfig: Record<
	string,
	{
		icon: React.ComponentType<{ className?: string }>;
		gradient: string;
		iconColor: string;
		label: string;
	}
> = {
	kb_search_chunks: {
		icon: Database,
		gradient:
			"from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-violet-200/50 dark:border-violet-800/30",
		iconColor: "text-violet-600 dark:text-violet-400",
		label: "Knowledge Base",
	},
	web_search: {
		icon: Search,
		gradient:
			"from-blue-500/10 via-indigo-500/10 to-violet-500/10 border-blue-200/50 dark:border-blue-800/30",
		iconColor: "text-blue-600 dark:text-blue-400",
		label: "Web Search",
	},
	fetch_url: {
		icon: Globe,
		gradient:
			"from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border-emerald-200/50 dark:border-emerald-800/30",
		iconColor: "text-emerald-600 dark:text-emerald-400",
		label: "Fetch URL",
	},
	llm_call: {
		icon: Activity,
		gradient:
			"from-amber-500/10 via-orange-500/10 to-rose-500/10 border-amber-200/50 dark:border-amber-800/30",
		iconColor: "text-amber-600 dark:text-amber-400",
		label: "AI Analysis",
	},
	code_execute: {
		icon: Code,
		gradient:
			"from-pink-500/10 via-rose-500/10 to-red-500/10 border-pink-200/50 dark:border-pink-800/30",
		iconColor: "text-pink-600 dark:text-pink-400",
		label: "Execute Code",
	},
	skill_call: {
		icon: PenLine,
		gradient:
			"from-purple-500/10 via-fuchsia-500/10 to-pink-500/10 border-purple-200/50 dark:border-purple-800/30",
		iconColor: "text-purple-600 dark:text-purple-400",
		label: "Skill Execution",
	},
	default: {
		icon: Zap,
		gradient:
			"from-zinc-500/10 via-zinc-500/10 to-zinc-500/10 border-border/50/30",
		iconColor: "text-text-secondary",
		label: "Tool Call",
	},
};

// 辅助组件：文件图标
function getFileIcon(filename: string) {
	const ext = filename.split(".").pop()?.toLowerCase();

	switch (ext) {
		case "ts":
		case "tsx":
		case "js":
		case "jsx":
			return <FileCode className="w-3.5 h-3.5 text-blue-500" />;
		case "json":
		case "yml":
		case "yaml":
			return <FileJson className="w-3.5 h-3.5 text-yellow-500" />;
		case "html":
		case "css":
			return <FileType className="w-3.5 h-3.5 text-orange-500" />;
		case "md":
		case "txt":
			return <FileText className="w-3.5 h-3.5 text-text-muted" />;
		case "png":
		case "jpg":
		case "svg":
			return <ImageIcon className="w-3.5 h-3.5 text-purple-500" />;
		default:
			return <File className="w-3.5 h-3.5 text-text-light" />;
	}
}

// 复制按钮
function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			onClick={handleCopy}
			className="p-1 hover:bg-warm-200 dark:hover:bg-cream-700/50 rounded-md transition-colors"
			title="Copy"
		>
			{copied ? (
				<Check className="w-3 h-3 text-emerald-500" />
			) : (
				<Copy className="w-3 h-3 text-text-light" />
			)}
		</button>
	);
}

// 结构化结果渲染
function StructuredOutput({ type, output }: { type: string; output: any }) {
	const codeBlockClass =
		"text-[10px] bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg p-2 overflow-x-auto text-text-secondary font-mono border border-emerald-100/50 dark:border-emerald-900/20 max-h-40 overflow-y-auto";

	// 1. 资料库检索
	if (type === "kb_search_chunks") {
		let results: any[] = [];
		try {
			if (typeof output === "string") results = JSON.parse(output);
			else if (Array.isArray(output)) results = output;
		} catch {}

		if (results.length > 0) {
			return (
				<div className="space-y-1">
					{results.map((item: any, idx: number) => {
						const file = item.file || item.path || item.filename || "unknown";
						const startLine =
							item.start_line || item.startLine || item.line || "?";
						const endLine = item.end_line || item.endLine;
						const lineDisplay = endLine
							? `L${startLine}-${endLine}`
							: `L${startLine}`;
						const basename = file.split(/[/\\]/).pop();
						return (
							<div
								key={idx}
								className="flex items-center gap-2 py-1 px-2 rounded hover:bg-warm-50/50 text-[11px]"
							>
								{getFileIcon(file)}
								<span
									className="font-medium text-text-secondary truncate"
									title={file}
								>
									{basename}
								</span>
								<span className="text-text-light font-mono text-[10px] ml-auto">
									{lineDisplay}
								</span>
							</div>
						);
					})}
				</div>
			);
		}
	}

	// 2. 网络搜索
	if (type === "web_search") {
		let results: any[] = [];
		try {
			const normalize = (payload: any) => {
				if (Array.isArray(payload)) return payload;
				if (Array.isArray(payload?.results)) return payload.results;
				if (Array.isArray(payload?.data?.results)) return payload.data.results;
				return [];
			};
			if (typeof output === "string") results = normalize(JSON.parse(output));
			else results = normalize(output);
		} catch {}

		if (results.length > 0) {
			return (
				<div className="space-y-2">
					{results.slice(0, 5).map((item: any, idx: number) => (
						<a
							key={idx}
							href={item.url}
							target="_blank"
							rel="noopener"
							className="block p-2 rounded border border-border/50 hover:bg-warm-50/50"
						>
							<div className="flex items-center gap-2 mb-1">
								<Globe className="w-3 h-3 text-blue-500" />
								<span className="text-xs font-semibold text-text-secondary truncate">
									{item.title || item.url}
								</span>
							</div>
							{(item.content || item.snippet) && (
								<p className="text-[10px] text-text-muted line-clamp-2">
									{item.content || item.snippet}
								</p>
							)}
						</a>
					))}
				</div>
			);
		}
	}

	// 默认：JSON 代码块
	return (
		<pre className={codeBlockClass}>
			{typeof output === "string" ? output : JSON.stringify(output, null, 2)}
		</pre>
	);
}

// 单个工具调用卡片 - Trace View
function ToolCallCard({
	toolCall,
	isLast,
	showDetails = false,
}: {
	toolCall: ToolCall;
	isLast: boolean;
	showDetails?: boolean;
}) {
	const [isExpanded, setIsExpanded] = useState(showDetails);
	const config = toolConfig[toolCall.type] || toolConfig.default;
	const Icon = config.icon;
	const isRunning = toolCall.status === "running";
	const isError = toolCall.status === "error";

	return (
		<div className="relative group/trace-item">
			{/* 连接线 */}
			{!isLast && (
				<div className="absolute left-[15px] top-8 bottom-[-8px] w-px bg-warm-300" />
			)}

			<div
				className={cn("relative flex gap-3 transition-opacity duration-500")}
			>
				{/* 时间轴图标 */}
				<div className="relative flex-shrink-0 z-10">
					<div
						className={cn(
							"flex items-center justify-center w-8 h-8 rounded-full border bg-surface shadow-sm transition-all duration-300",
							isRunning
								? "scale-110 ring-2 ring-violet-500/20 border-violet-500"
								: "border-border",
							isError ? "border-rose-500" : "",
						)}
					>
						{isRunning ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
						) : isError ? (
							<XCircle className="w-3.5 h-3.5 text-rose-500" />
						) : (
							<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
						)}
					</div>
				</div>

				{/* 内容卡片 */}
				<div
					className={cn(
						"flex-1 min-w-0 rounded-xl border transition-all duration-300 mb-3 overflow-hidden",
						"bg-surface/40",
						isRunning
							? "border-violet-200 dark:border-violet-800/30 shadow-sm"
							: "border-border/60 hover:border-cream-400",
					)}
				>
					<button
						onClick={() => setIsExpanded(!isExpanded)}
						className="w-full flex items-center gap-3 p-3 text-left hover:bg-warm-50/50/30 transition-colors"
					>
						<div
							className={cn(
								"flex items-center justify-center w-8 h-8 rounded-lg border",
								"bg-gradient-to-br",
								config.gradient,
							)}
						>
							<Icon className={cn("w-4 h-4", config.iconColor)} />
						</div>

						<div className="flex-1 min-w-0">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-text-primary dark:text-zinc-200">
									{config.label}
								</span>
								<span className="text-[10px] text-text-light font-mono">
									{toolCall.duration
										? `${(toolCall.duration / 1000).toFixed(1)}s`
										: isRunning
											? "running"
											: ""}
								</span>
							</div>
							<div className="text-xs text-text-muted truncate mt-0.5">
								{toolCall.name}
							</div>
						</div>

						<ChevronDown
							className={cn(
								"w-4 h-4 text-text-light transition-transform duration-200",
								isExpanded && "rotate-180",
							)}
						/>
					</button>

					{/* 详情内容 */}
					{isExpanded && (
						<div className="px-3 pb-3 pt-0 border-t border-border/50">
							{toolCall.type === "skill_call" &&
							toolCall.metadata?.skillExecution ? (
								<div className="mt-3">
									<SkillCard skill={toolCall.metadata.skillExecution} />
								</div>
							) : (
								<div className="mt-3 space-y-3">
									<div>
										<div className="flex items-center justify-between mb-1">
											<span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
												Input
											</span>
											<CopyButton
												text={JSON.stringify(toolCall.input, null, 2)}
											/>
										</div>
										<pre className="text-[10px] bg-warm-50 rounded-lg p-2 overflow-x-auto text-text-secondary font-mono border border-border">
											{JSON.stringify(toolCall.input, null, 2)}
										</pre>
									</div>

									{toolCall.output && (
										<div>
											<div className="flex items-center justify-between mb-1">
												<span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
													Output
												</span>
												<CopyButton
													text={
														typeof toolCall.output === "string"
															? toolCall.output
															: JSON.stringify(toolCall.output, null, 2)
													}
												/>
											</div>
											{/* 使用结构化输出渲染 */}
											<StructuredOutput
												type={toolCall.type}
												output={toolCall.output}
											/>
										</div>
									)}

									{toolCall.error && (
										<div>
											<span className="text-[10px] font-medium text-rose-600 uppercase tracking-wider mb-1 block">
												Error
											</span>
											<pre className="text-[10px] bg-rose-50 dark:bg-rose-900/10 rounded-lg p-2 text-rose-600 dark:text-rose-400 font-mono border border-rose-100 dark:border-rose-900/20">
												{toolCall.error}
											</pre>
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// 主组件：工具调用追踪面板
export default function ToolCallTrace({
	taskId: _taskId,
}: {
	taskId?: string;
}) {
	const { currentTask, taskHistory } = useAgentStore();
	const scrollRef = useRef<HTMLDivElement>(null);

	const task = _taskId
		? currentTask?.id === _taskId
			? currentTask
			: taskHistory.find((t) => t.id === _taskId)
		: currentTask;

	// 自动滚动到底部
	useEffect(() => {
		if (scrollRef.current && task?.status === "executing") {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [task?.toolCalls.length]);

	if (!task) {
		return (
			<div className="flex flex-col items-center justify-center p-8 text-center">
				<div className="w-12 h-12 rounded-2xl bg-warm-50 flex items-center justify-center mb-3">
					<Search className="w-5 h-5 text-text-light" />
				</div>
				<p className="text-sm font-medium text-text-muted">No active trace</p>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			{/* 头部摘要 */}
			<div className="flex-none p-4 border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-20">
				<h3 className="text-sm font-semibold text-text-primary dark:text-zinc-200 mb-1">
					追踪: {task.title || "代理任务"}
				</h3>
				<div className="flex items-center gap-2 text-xs text-text-muted">
					<Clock className="w-3.5 h-3.5" />
					<span>Started {new Date(task.createdAt).toLocaleTimeString()}</span>
					<span className="w-1 h-1 rounded-full bg-cream-400 dark:bg-cream-600" />
					<span>{task.toolCalls.length} Steps</span>
				</div>
			</div>

			{/* 滚动列表 */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
				{task.toolCalls.map((tc, idx) => (
					<ToolCallCard
						key={tc.id}
						toolCall={tc}
						isLast={idx === task.toolCalls.length - 1}
						showDetails={tc.status === "error"}
					/>
				))}

				{task.status === "executing" && (
					<div className="pl-[15px] pt-4">
						<div className="w-1.5 h-1.5 rounded-full bg-warm-300 dark:bg-cream-700 animate-pulse" />
					</div>
				)}
			</div>

			{/* 底部结果状态 */}
			{(task.status === "completed" || task.status === "error") && (
				<div
					className={cn(
						"flex-none p-4 border-t",
						task.status === "completed"
							? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/20"
							: "bg-rose-50/50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/20",
					)}
				>
					<div className="flex items-center gap-2 font-medium">
						{task.status === "completed" ? (
							<>
								<CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
								<span className="text-emerald-700 dark:text-emerald-300">
									任务已完成
								</span>
							</>
						) : (
							<>
								<XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
								<span className="text-rose-700 dark:text-rose-300">
									任务失败
								</span>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// 内联版本（用于消息气泡）
export function ToolCallTraceInline({ taskId: _taskId }: { taskId?: string }) {
	// Keeping this simple as it redirects to full trace view usually
	return null;
}
