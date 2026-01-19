import {
	Activity,
	Brain,
	CheckCircle2,
	ChevronDown,
	Code,
	Database,
	FileText,
	Globe,
	Loader2,
	Search,
	Sparkles,
	Wand2,
	XCircle,
	Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAgentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import { cn } from "../../lib/utils";
import ToolCallInline from "../agent/ToolCallInline";

export type ToolCallRef = {
	taskId: string;
	toolCallId: string;
	name?: string;
	status?: ToolCall["status"];
	input?: any;
	output?: any;
	error?: string;
};

// 工具类型到图标的映射
const toolIconMap: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	kb_search_chunks: Database,
	web_search: Search,
	fetch_url: Globe,
	llm_call: Brain,
	code_execute: Code,
	default: Zap,
};

function getToolIcon(
	name?: string,
): React.ComponentType<{ className?: string }> {
	if (!name) return Sparkles;
	const key = name.toLowerCase();
	if (key.includes("search") || key.includes("检索")) return Search;
	if (key.includes("web") || key.includes("网络")) return Globe;
	if (key.includes("fetch") || key.includes("抓取")) return FileText;
	if (key.includes("code") || key.includes("代码") || key.includes("执行"))
		return Code;
	if (key.includes("llm") || key.includes("ai") || key.includes("分析"))
		return Brain;
	return toolIconMap[key] || Zap;
}

function getGroupStatus(calls: ToolCall[]): ToolCall["status"] {
	if (calls.length === 0) return "pending";
	if (calls.some((c) => c.status === "error")) return "error";
	if (calls.some((c) => c.status === "running")) return "running";
	if (calls.some((c) => c.status === "pending")) return "pending";
	if (calls.some((c) => c.status === "cancelled")) return "cancelled";
	return "completed";
}

function getGroupStatusFromRefs(calls: ToolCallRef[]): ToolCall["status"] {
	if (calls.length === 0) return "pending";
	const statuses = calls.map((c) => c.status || "pending");
	if (statuses.some((s) => s === "error")) return "error";
	if (statuses.some((s) => s === "running")) return "running";
	if (statuses.some((s) => s === "pending")) return "pending";
	if (statuses.some((s) => s === "cancelled")) return "cancelled";
	return "completed";
}

function ToolCallFallbackRow({
	name,
	status,
}: {
	name: string;
	status: ToolCall["status"];
}) {
	const Icon = getToolIcon(name);

	return (
		<div className="group/item relative pl-4 py-2 border-l-2 border-zinc-100 dark:border-zinc-800 ml-3">
			<div className="flex items-center gap-3">
				<Icon className="w-4 h-4 text-zinc-400" />
				<span className="text-sm text-zinc-600 dark:text-zinc-400 font-medium">
					{name}
				</span>
				<span className="ml-auto text-xs text-zinc-400">{status}</span>
			</div>
		</div>
	);
}

function getToolCallName(tc: ToolCall | ToolCallRef): string {
	if ("name" in tc && typeof tc.name === "string" && tc.name.trim().length > 0)
		return tc.name;
	return "Tool";
}

// Claude-style minimal status indicator
function SkillStatusIndicator({ status }: { status: string }) {
	const isRunning =
		status === "running" ||
		status === "loading" ||
		status === "parsing" ||
		status === "loading_style" ||
		status === "generating";
	const isCompleted = status === "completed";
	const isError = status === "error";

	if (isRunning) {
		return (
			<div className="flex items-center gap-1.5">
				<Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />
				<span className="text-[11px] text-zinc-500 font-medium">运行中</span>
			</div>
		);
	}

	if (isCompleted) {
		return (
			<div className="flex items-center gap-1">
				<CheckCircle2 className="w-3 h-3 text-zinc-400" />
				<span className="text-[11px] text-zinc-400">完成</span>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex items-center gap-1">
				<XCircle className="w-3 h-3 text-red-500" />
				<span className="text-[11px] text-red-500">错误</span>
			</div>
		);
	}

	return null;
}

export function ToolCallsGroup({ calls }: { calls: ToolCallRef[] }) {
	const [expanded, setExpanded] = useState(calls.length <= 1);
	const { currentTask, taskHistory } = useAgentStore();

	const resolved = useMemo(() => {
		const tasksById = new Map<string, typeof currentTask | null>();
		if (currentTask) tasksById.set(currentTask.id, currentTask);
		for (const t of taskHistory) tasksById.set(t.id, t);

		const resolvedCalls: ToolCall[] = [];
		const resolvedByKey = new Map<string, ToolCall>();
		for (const ref of calls) {
			const task = tasksById.get(ref.taskId) || null;
			const tc = task?.toolCalls.find((x) => x.id === ref.toolCallId) || null;
			if (tc) {
				resolvedCalls.push(tc);
				resolvedByKey.set(`${ref.taskId}:${ref.toolCallId}`, tc);
			}
		}
		return { resolvedCalls, resolvedByKey };
	}, [calls, currentTask, taskHistory]);

	const groupStatus = useMemo(() => {
		if (resolved.resolvedCalls.length > 0)
			return getGroupStatus(resolved.resolvedCalls);
		return getGroupStatusFromRefs(calls);
	}, [calls, resolved.resolvedCalls]);

	const collapsedPreview = useMemo(() => {
		const list =
			resolved.resolvedCalls.length > 0 ? resolved.resolvedCalls : calls;
		if (list.length === 0) return "";
		const parts = list.slice(0, 3).map((tc) => getToolCallName(tc));
		const rest = list.length - parts.length;
		return rest > 0 ? `${parts.join(", ")} +${rest}` : parts.join(", ");
	}, [calls, resolved.resolvedCalls]);

	const isRunning = groupStatus === "running";
	const isError = groupStatus === "error";

	// Special handling for single Skill Call: render premium Claude-style collapsible card
	const [skillExpanded, setSkillExpanded] = useState(true);

	if (
		resolved.resolvedCalls.length === 1 &&
		resolved.resolvedCalls[0].type === "skill_call"
	) {
		const skillExecution = resolved.resolvedCalls[0].metadata?.skillExecution;

		if (skillExecution) {
			// Premium Claude-style Skill Card with neutral colors
			return (
				<div className="my-2 font-sans antialiased">
					{/* Minimal header - Claude style */}
					<button
						type="button"
						onClick={() => setSkillExpanded((v) => !v)}
						className={cn(
							"w-full flex items-center gap-2.5 px-0.5 py-1 text-left group select-none transition-all duration-200",
							!skillExpanded && "opacity-80 hover:opacity-100",
						)}
					>
						{/* Icon container - subtle and neutral */}
						<div className="flex items-center justify-center w-5 h-5 rounded-md bg-zinc-100 dark:bg-zinc-800 transition-colors group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700">
							<Wand2 className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
						</div>

						{/* Title */}
						<div className="flex items-center gap-2 min-w-0 flex-1">
							<span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">
								{skillExecution.skillName}
							</span>
							<SkillStatusIndicator status={skillExecution.status} />
						</div>

						{/* Chevron */}
						<ChevronDown
							className={cn(
								"w-4 h-4 text-zinc-400 transition-transform duration-200",
								skillExpanded ? "rotate-180" : "rotate-0",
							)}
						/>
					</button>

					{/* Expanded content - clean and minimal */}
					{skillExpanded && (
						<div className="mt-1 pl-7 animate-in fade-in slide-in-from-top-1 duration-200">
							<div className="rounded-lg border border-zinc-200/60 dark:border-zinc-700/60 bg-white/50 dark:bg-zinc-900/30 overflow-hidden">
								{/* Scene indicator */}
								{skillExecution.detectedScene && (
									<div className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
										<span className="text-[11px] text-zinc-500">
											场景: {skillExecution.detectedScene}
										</span>
									</div>
								)}

								{/* Steps - minimal timeline style */}
								<div className="px-3 py-2 space-y-1.5">
									{skillExecution.steps?.map((step: any) => (
										<div
											key={step.id}
											className="flex items-center gap-2 text-[12px]"
										>
											{step.status === "running" ? (
												<Loader2 className="w-3 h-3 text-zinc-400 animate-spin flex-shrink-0" />
											) : step.status === "completed" ? (
												<CheckCircle2 className="w-3 h-3 text-zinc-400 flex-shrink-0" />
											) : step.status === "error" ? (
												<XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
											) : (
												<div className="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-600 flex-shrink-0" />
											)}
											<span
												className={cn(
													step.status === "pending"
														? "text-zinc-400"
														: "text-zinc-600 dark:text-zinc-300",
												)}
											>
												{step.label}
											</span>
											{step.detail && (
												<span className="text-zinc-400 text-[11px] truncate">
													· {step.detail}
												</span>
											)}
										</div>
									))}
								</div>

								{/* Loaded files - subtle pills */}
								{skillExecution.loadedFiles?.length > 0 && (
									<div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800">
										<div className="flex flex-wrap gap-1">
											{skillExecution.loadedFiles.map(
												(file: any, i: number) => (
													<span
														key={i}
														className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[10px] text-zinc-500"
													>
														<FileText className="w-2.5 h-2.5" />
														{file.path.split("/").pop()}
													</span>
												),
											)}
										</div>
									</div>
								)}

								{/* Error display */}
								{skillExecution.error && (
									<div className="px-3 py-2 bg-red-50 dark:bg-red-900/10 text-[11px] text-red-600 dark:text-red-400 border-t border-red-100 dark:border-red-800/30">
										{skillExecution.error}
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			);
		}
	}

	return (
		<div className="my-2 font-sans antialiased">
			{/* 极简风格头部 */}
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className={cn(
					"w-full flex items-center gap-2 px-1 py-1 group select-none transition-all duration-300",
					!expanded && "opacity-80 hover:opacity-100",
				)}
			>
				<div
					className={cn(
						"relative flex items-center justify-center w-5 h-5 rounded-md transition-all duration-300",
						isRunning
							? "bg-violet-500/10 text-violet-500"
							: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
						isError && "bg-rose-500/10 text-rose-500",
					)}
				>
					{isRunning ? (
						<Activity className="w-3.5 h-3.5 animate-pulse" />
					) : isError ? (
						<XCircle className="w-3.5 h-3.5" />
					) : (
						<Zap className="w-3.5 h-3.5" />
					)}
				</div>

				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 tracking-tight">
						Use Tools
					</span>
					<span className="h-1 w-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
					{!expanded && collapsedPreview && (
						<span className="text-xs text-zinc-400 truncate font-medium">
							{collapsedPreview}
						</span>
					)}
					{expanded && (
						<span className="text-xs text-zinc-400 font-medium">
							{calls.length} actions
						</span>
					)}
				</div>

				<div className="ml-auto flex items-center">
					<ChevronDown
						className={cn(
							"w-4 h-4 text-zinc-400 transition-transform duration-300 ease-out",
							expanded ? "rotate-180" : "rotate-0",
						)}
					/>
				</div>
			</button>

			{/* 展开的列表 */}
			{expanded ? (
				<div className="mt-1 flex flex-col gap-2 pl-0 animate-in fade-in slide-in-from-top-1 duration-300">
					{calls.map((c, idx) => {
						const resolvedCall = resolved.resolvedByKey.get(
							`${c.taskId}:${c.toolCallId}`,
						);
						if (resolvedCall) {
							return (
								<ToolCallInline
									key={`${c.toolCallId}-${idx}`}
									taskId={c.taskId}
									toolCallId={c.toolCallId}
								/>
							);
						}

						// Fallback used when agentStore is cleared (e.g. after reload)
						// We construct a temporary ToolCall object from the persisted chat message data
						const fallbackData: ToolCall | undefined = c.name
							? {
									id: c.toolCallId,
									type: (c.name as any) || "custom", // Best effort type casting
									name: c.name,
									status: c.status || "pending",
									input: c.input || {},
									output: c.output,
									error: c.error,
								}
							: undefined;

						if (fallbackData) {
							return (
								<ToolCallInline
									key={`${c.toolCallId}-${idx}`}
									taskId={c.taskId}
									toolCallId={c.toolCallId}
									initialData={fallbackData}
								/>
							);
						}

						const name = c.name || "Unknown Tool";
						const status = c.status || "pending";
						return (
							<ToolCallFallbackRow
								key={`${c.toolCallId}-${idx}`}
								name={name}
								status={status}
							/>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
