import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
	AlertTriangle,
	Archive,
	Bot,
	CheckCircle2,
	ChevronRight,
	Eye,
	FileText,
	Loader2,
	Sparkles,
	Wand2,
	X,
} from "lucide-react";
import { memo } from "react";
import { cn } from "../../../lib/utils";
import type {
	ArtifactGraphNode,
	ExecutionGraphNode,
	TaskGraphNode,
	ToolGraphNode,
} from "./types";
import { taskStatusPill, statusPill, formatDuration } from "./utils";

const TaskNode = memo(function TaskNode(props: NodeProps<TaskGraphNode>) {
	const { data, selected } = props;
	const pill = taskStatusPill(data.status);

	return (
		<div
			className={cn(
				"min-w-[320px] max-w-[360px] rounded-2xl border bg-white/85 dark:bg-zinc-950/60 backdrop-blur-xl shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]",
				"border-black/[0.06] dark:border-white/[0.08] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-shadow duration-200 hover:shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)]",
				selected && "ring-2 ring-indigo-400/50 dark:ring-indigo-500/40",
			)}
		>
			<Handle type="target" position={Position.Left} className="opacity-0" />
			<Handle type="source" position={Position.Right} className="opacity-0" />

			<div className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
				<div className="flex items-start gap-3">
					<div className="mt-0.5 w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-700 dark:from-zinc-100 dark:to-zinc-300 text-white dark:text-zinc-900 flex items-center justify-center shadow-sm">
						<Bot className="w-4 h-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
								{data.title}
							</div>
							<span
								className={cn(
									"inline-flex items-center gap-1 text-[11px] font-medium",
									pill.cls,
								)}
							>
								{pill.spinning ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : (
									<Sparkles className="w-3 h-3" />
								)}
								{pill.label}
							</span>
						</div>
						{data.subtitle ? (
							<div className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
								{data.subtitle}
							</div>
						) : null}
					</div>
				</div>
			</div>

			<div className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
						<Wand2 className="w-3.5 h-3.5 text-indigo-500" />
						工具 {data.stats.toolsCompleted}/{data.stats.toolsTotal}
					</span>
					{data.stats.toolsFailed > 0 ? (
						<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/15">
							<AlertTriangle className="w-3.5 h-3.5" />
							失败 {data.stats.toolsFailed}
						</span>
					) : null}
					<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
						<Archive className="w-3.5 h-3.5 text-zinc-500" />
						产物 {data.stats.artifacts}
					</span>
				</div>
			</div>
		</div>
	);
});

const ToolNode = memo(function ToolNode(props: NodeProps<ToolGraphNode>) {
	const { data, selected } = props;
	const pill = statusPill(data.status);

	const accent = data.isSubagent
		? "purple"
		: data.status === "error"
			? "rose"
			: "zinc";
	const borderCls =
		accent === "purple"
			? "border-purple-200/70 dark:border-purple-900/40"
			: accent === "rose"
				? "border-rose-200/70 dark:border-rose-900/40"
				: "border-black/[0.06] dark:border-white/[0.08]";

	return (
		<div
			className={cn(
				"min-w-[280px] max-w-[320px] rounded-2xl border bg-white/85 dark:bg-zinc-950/60 backdrop-blur-xl",
				"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-shadow duration-200 hover:shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)]",
				borderCls,
				selected && "ring-2 ring-indigo-400/50 dark:ring-indigo-500/40",
				data.status === "running" &&
					"shadow-[0_16px_50px_-28px_rgba(79,70,229,0.35)]",
			)}
		>
			<Handle type="target" position={Position.Left} className="opacity-0" />
			<Handle type="source" position={Position.Right} className="opacity-0" />

			<div className="px-3.5 py-3">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ring-1 ring-black/5 dark:ring-white/10",
							data.isSubagent
								? "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300"
								: data.status === "error"
									? "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300"
									: "bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300",
						)}
					>
						{data.status === "running" ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : data.status === "completed" ? (
							<CheckCircle2 className="w-4 h-4" />
						) : data.status === "error" ? (
							<AlertTriangle className="w-4 h-4" />
						) : data.status === "cancelled" ? (
							<X className="w-4 h-4" />
						) : (
							<Sparkles className="w-4 h-4" />
						)}
					</div>

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
								{data.isSubagent
									? data.subagentType
										? `子代理 · ${data.subagentType}`
										: "子代理"
									: data.name}
							</div>
							<span
								className={cn(
									"inline-flex items-center gap-1 text-[11px] font-medium",
									pill.cls,
								)}
							>
								{pill.label}
							</span>
						</div>
						<div className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
							{data.description || (data.isSubagent ? "子代理调用中..." : "")}
						</div>

						{data.lastActivity ? (
							<div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300 bg-zinc-50/80 dark:bg-zinc-900/60 rounded-xl px-2.5 py-2 ring-1 ring-black/5 dark:ring-white/10">
								<span className="text-zinc-400 dark:text-zinc-500 mr-1">
									最新：
								</span>
								{data.lastActivity}
							</div>
						) : null}
					</div>

					{data.durationMs ? (
						<div className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
							{formatDuration(data.durationMs)}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
});

const ArtifactNode = memo(function ArtifactNode(
	props: NodeProps<ArtifactGraphNode>,
) {
	const { data, selected } = props;
	const Icon =
		data.artifactType === "image"
			? Eye
			: data.artifactType === "code"
				? FileText
				: Archive;

	return (
		<div
			className={cn(
				"min-w-[220px] max-w-[280px] rounded-2xl border bg-white/85 dark:bg-zinc-950/60 backdrop-blur-xl",
				"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
				"transition-shadow duration-200 hover:shadow-[0_18px_60px_-35px_rgba(0,0,0,0.35)]",
				"border-black/[0.06] dark:border-white/[0.08]",
				selected && "ring-2 ring-indigo-400/50 dark:ring-indigo-500/40",
			)}
		>
			<Handle type="target" position={Position.Top} className="opacity-0" />
			<div className="px-3.5 py-3">
				<div className="flex items-start gap-3">
					<div className="mt-0.5 w-8 h-8 rounded-xl bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 flex items-center justify-center shadow-sm ring-1 ring-black/5 dark:ring-white/10">
						<Icon className="w-4 h-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
							{data.title}
						</div>
						<div className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
							产物 · {data.artifactType}
						</div>
					</div>
					<ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-1" />
				</div>
			</div>
		</div>
	);
});

export const nodeTypes = {
	task: TaskNode,
	tool: ToolNode,
	artifact: ArtifactNode,
};

export function isToolNode(node: ExecutionGraphNode): boolean {
	return node.type === "tool";
}
