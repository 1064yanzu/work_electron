import "@xyflow/react/dist/style.css";

import {
	Background,
	BackgroundVariant,
	Controls,
	Handle,
	MiniMap,
	Position,
	ReactFlow,
	ReactFlowProvider,
	type Edge,
	type Node,
	type NodeProps,
	useReactFlow,
} from "@xyflow/react";
import {
	AlertTriangle,
	Archive,
	Bot,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Copy,
	Eye,
	FileText,
	Loader2,
	Sparkles,
	Wand2,
	X,
} from "lucide-react";
import React, {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { AgentTask, ToolArtifact, ToolCall } from "../../lib/agent/types";
import { EVENTS, events } from "../../lib/events";
import { cn } from "../../lib/utils";

export type ExecutionGraphSource = {
	/** Stable id for the graph (usually taskId, fallback to session id). */
	id: string;
	title: string;
	subtitle?: string;
	status: AgentTask["status"];
	toolCalls: ToolCall[];
	artifacts: ToolArtifact[];
};

type TaskNodeData = {
	kind: "task";
	taskId: string;
	title: string;
	subtitle?: string;
	status: AgentTask["status"];
	stats: {
		toolsTotal: number;
		toolsCompleted: number;
		toolsFailed: number;
		artifacts: number;
	};
};

type ToolNodeData = {
	kind: "tool";
	toolCallId: string;
	name: string;
	status: ToolCall["status"];
	description?: string;
	durationMs?: number;
	startedAt?: number;
	isSubagent?: boolean;
	subagentType?: string;
	lastActivity?: string;
};

type ArtifactNodeData = {
	kind: "artifact";
	artifactId: string;
	title: string;
	artifactType: ToolArtifact["type"];
	url?: string;
	toolCallId?: string;
};

type TaskGraphNode = Node<TaskNodeData, "task">;
type ToolGraphNode = Node<ToolNodeData, "tool">;
type ArtifactGraphNode = Node<ArtifactNodeData, "artifact">;
type ExecutionGraphNode = TaskGraphNode | ToolGraphNode | ArtifactGraphNode;

function formatDuration(ms?: number) {
	if (!ms || ms <= 0) return "";
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function safeJson(value: unknown): string {
	try {
		const result = JSON.stringify(value, null, 2);
		return typeof result === "string" ? result : String(value);
	} catch {
		return String(value);
	}
}

function getSubagentType(toolCall: ToolCall): string | null {
	if (toolCall.name !== "Task") return null;
	const input = toolCall.input as any;
	const candidate =
		typeof input?.subagent_type === "string"
			? input.subagent_type
			: typeof input?.agent_type === "string"
				? input.agent_type
				: typeof input?.subagentType === "string"
					? input.subagentType
					: typeof input?.agentType === "string"
						? input.agentType
						: null;
	return candidate ? String(candidate).trim() || null : null;
}

function statusPill(status: string): {
	label: string;
	cls: string;
	icon: React.ElementType;
} {
	switch (status) {
		case "running":
			return {
				label: "运行中",
				cls: "text-blue-600 dark:text-blue-400",
				icon: Loader2,
			};
		case "completed":
			return {
				label: "完成",
				cls: "text-emerald-600 dark:text-emerald-400",
				icon: CheckCircle2,
			};
		case "error":
			return {
				label: "失败",
				cls: "text-rose-600 dark:text-rose-400",
				icon: AlertTriangle,
			};
		default:
			return {
				label: "等待",
				cls: "text-zinc-500 dark:text-zinc-400",
				icon: Sparkles,
			};
	}
}

function taskStatusPill(status: AgentTask["status"]): {
	label: string;
	cls: string;
	icon: React.ElementType;
	spinning?: boolean;
} {
	switch (status) {
		case "planning":
			return {
				label: "规划中",
				cls: "text-blue-600 dark:text-blue-400",
				icon: Loader2,
				spinning: true,
			};
		case "executing":
			return {
				label: "执行中",
				cls: "text-blue-600 dark:text-blue-400",
				icon: Loader2,
				spinning: true,
			};
		case "waiting":
			return {
				label: "等待",
				cls: "text-zinc-500 dark:text-zinc-400",
				icon: Sparkles,
			};
		case "completed":
			return {
				label: "完成",
				cls: "text-emerald-600 dark:text-emerald-400",
				icon: CheckCircle2,
			};
		case "error":
			return {
				label: "失败",
				cls: "text-rose-600 dark:text-rose-400",
				icon: AlertTriangle,
			};
		case "cancelled":
			return {
				label: "已取消",
				cls: "text-zinc-500 dark:text-zinc-400",
				icon: X,
			};
		default:
			return {
				label: "就绪",
				cls: "text-zinc-500 dark:text-zinc-400",
				icon: Sparkles,
			};
	}
}

const TaskNode = memo(function TaskNode(props: NodeProps<TaskGraphNode>) {
	const { data, selected } = props;
	const pill = taskStatusPill(data.status);
	const Icon = pill.icon;

	return (
		<div
			className={cn(
				"min-w-[320px] max-w-[360px] rounded-2xl border bg-white/85 dark:bg-zinc-950/60 backdrop-blur-xl shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]",
				"border-black/[0.06] dark:border-white/[0.08] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
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
								<Icon
									className={cn("w-3 h-3", pill.spinning && "animate-spin")}
								/>
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
	const Icon = pill.icon;

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
							<Icon className="w-4 h-4 animate-spin" />
						) : (
							<Icon className="w-4 h-4" />
						)}
					</div>

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
								{data.isSubagent ? data.subagentType || "子代理调用" : data.name}
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

const nodeTypes = {
	task: TaskNode,
	tool: ToolNode,
	artifact: ArtifactNode,
};

type ExecutionGraphBuild = {
	nodes: ExecutionGraphNode[];
	edges: Edge[];
	taskNodeId: string | null;
};

function buildExecutionGraph(source: ExecutionGraphSource | null): ExecutionGraphBuild {
	if (!source) return { nodes: [], edges: [], taskNodeId: null };

	const toolCalls = Array.isArray(source.toolCalls) ? source.toolCalls : [];
	const artifacts = Array.isArray(source.artifacts) ? source.artifacts : [];

	const orderedToolCalls = [...toolCalls].sort((a, b) => {
		const ia = toolCalls.indexOf(a);
		const ib = toolCalls.indexOf(b);
		const ta = typeof a.startedAt === "number" ? a.startedAt : null;
		const tb = typeof b.startedAt === "number" ? b.startedAt : null;
		if (ta !== null && tb !== null && ta !== tb) return ta - tb;
		return ia - ib;
	});

	const laneKeys: string[] = ["main"];
	const laneIndex = new Map<string, number>([["main", 0]]);
	for (const tc of orderedToolCalls) {
		const subType = getSubagentType(tc);
		if (!subType) continue;
		const key = `subagent:${subType}`;
		if (!laneIndex.has(key)) {
			laneIndex.set(key, laneKeys.length);
			laneKeys.push(key);
		}
	}

	const X_STEP = 380;
	const Y_STEP = 190;
	const ROOT_X = 40;
	const ROOT_Y = 40;

	const toolsCompleted = orderedToolCalls.filter((t) => t.status === "completed").length;
	const toolsFailed = orderedToolCalls.filter((t) => t.status === "error").length;

	const nodes: ExecutionGraphNode[] = [];
	const edges: Edge[] = [];

	const taskNodeId = `task-${source.id}`;
	nodes.push({
		id: taskNodeId,
		type: "task",
		position: { x: ROOT_X, y: ROOT_Y },
		data: {
			kind: "task",
			taskId: source.id,
			title: source.title || "托管任务",
			subtitle: source.subtitle,
			status: source.status,
			stats: {
				toolsTotal: orderedToolCalls.length,
				toolsCompleted,
				toolsFailed,
				artifacts: artifacts.length,
			},
		},
	});

	const toolXById = new Map<string, number>();
	const toolYById = new Map<string, number>();

	for (let i = 0; i < orderedToolCalls.length; i++) {
		const tc = orderedToolCalls[i]!;
		const subType = getSubagentType(tc);
		const lane = subType ? `subagent:${subType}` : "main";
		const y = ROOT_Y + laneIndex.get(lane)! * Y_STEP;
		const x = ROOT_X + (i + 1) * X_STEP;
		toolXById.set(tc.id, x);
		toolYById.set(tc.id, y);

		const lastActivity =
			Array.isArray(tc.subagentActivities) && tc.subagentActivities.length > 0
				? tc.subagentActivities[tc.subagentActivities.length - 1]?.content
				: undefined;

		nodes.push({
			id: tc.id,
			type: "tool",
			position: { x, y },
			data: {
				kind: "tool",
				toolCallId: tc.id,
				name: tc.name,
				status: tc.status,
				description: tc.description,
				durationMs: tc.duration,
				startedAt: tc.startedAt,
				isSubagent: tc.name === "Task",
				subagentType: subType || undefined,
				lastActivity: lastActivity ? String(lastActivity).slice(0, 240) : undefined,
			},
		});

		// Sequential edges
		const sourceId = i === 0 ? taskNodeId : orderedToolCalls[i - 1]!.id;
		const sourceLaneY =
			sourceId === taskNodeId ? ROOT_Y : (toolYById.get(sourceId) ?? ROOT_Y);
		const sameLane = sourceLaneY === y;
		const dashed = !sameLane;
		const isSub = tc.name === "Task";

		edges.push({
			id: `edge-${sourceId}-${tc.id}`,
			source: sourceId,
			target: tc.id,
			type: "smoothstep",
			animated: tc.status === "running",
			style: {
				stroke: isSub ? "#8b5cf6" : tc.status === "error" ? "#fb7185" : "#94a3b8",
				strokeWidth: 2,
				strokeDasharray: dashed ? "6 6" : undefined,
				opacity: 0.85,
			},
		});
	}

	// Artifact nodes (grouped by toolCallId)
	const artifactsByTool = new Map<string, ToolArtifact[]>();
	for (const a of artifacts) {
		const toolCallId = String(a?.metadata?.toolCallId || "").trim();
		const key = toolCallId || "__unbound__";
		const arr = artifactsByTool.get(key) || [];
		arr.push(a);
		artifactsByTool.set(key, arr);
	}

	const baseArtifactsY = ROOT_Y + laneKeys.length * Y_STEP + 90;
	for (const [toolCallId, list] of artifactsByTool.entries()) {
		const yOffset = toolCallId === "__unbound__" ? 70 : 0;
		for (let i = 0; i < list.length; i++) {
			const a = list[i]!;
			const parentToolId =
				toolCallId !== "__unbound__"
					? toolCallId
					: orderedToolCalls[orderedToolCalls.length - 1]?.id;
			const baseX = parentToolId
				? (toolXById.get(parentToolId) ?? ROOT_X + X_STEP)
				: ROOT_X + X_STEP;
			const x = baseX;
			const y = baseArtifactsY + yOffset + i * 140;
			const nodeId = `artifact-${a.id}`;
			nodes.push({
				id: nodeId,
				type: "artifact",
				position: { x, y },
				data: {
					kind: "artifact",
					artifactId: a.id,
					title: a.title,
					artifactType: a.type,
					url: a.url,
					toolCallId:
						typeof a.metadata?.toolCallId === "string"
							? a.metadata.toolCallId
							: undefined,
				},
			});

			if (parentToolId) {
				edges.push({
					id: `edge-${parentToolId}-${nodeId}`,
					source: parentToolId,
					target: nodeId,
					type: "smoothstep",
					style: {
						stroke: "#a1a1aa",
						strokeWidth: 1.5,
						strokeDasharray: "2 6",
						opacity: 0.8,
					},
				});
			}
		}
	}

	return { nodes, edges, taskNodeId };
}

function GraphInspector({
	selectedNodeId,
	source,
	taskNodeId,
	toolCallById,
	artifactByNodeId,
	onClose,
	onOpenArtifact,
}: {
	selectedNodeId: string;
	source: ExecutionGraphSource;
	taskNodeId: string;
	toolCallById: Map<string, ToolCall>;
	artifactByNodeId: Map<string, ToolArtifact>;
	onClose: () => void;
	onOpenArtifact: (filePath: string) => void;
}) {
	const selectedToolCall = toolCallById.get(selectedNodeId);
	const selectedArtifact = artifactByNodeId.get(selectedNodeId);
	const isTaskSelected = selectedNodeId === taskNodeId;

	const title = selectedToolCall
		? selectedToolCall.name
		: selectedArtifact
			? selectedArtifact.title
			: isTaskSelected
				? source.title
				: "详情";

	const subtitle = selectedToolCall
		? selectedToolCall.status
		: selectedArtifact
			? selectedArtifact.type
			: source.status;

	const copy = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch { }
	}, []);

	return (
		<div className="absolute right-3 top-3 bottom-3 w-[420px] z-20 pointer-events-auto">
			<div className="h-full rounded-3xl bg-white/90 dark:bg-zinc-950/70 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_18px_60px_-35px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.02] dark:ring-white/[0.06] overflow-hidden flex flex-col animate-in slide-in-from-right-3 fade-in duration-200">
				<div className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
							{title}
						</div>
						{subtitle ? (
							<div className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
								{subtitle}
							</div>
						) : null}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
						title="关闭"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-4">
					{selectedToolCall ? (
						<>
							<div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
								<div className="px-3 py-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
									<span>输入</span>
									<button
										type="button"
										onClick={() => copy(safeJson(selectedToolCall.input))}
										className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white/70 dark:hover:bg-zinc-800/60 transition-colors"
										title="复制"
									>
										<Copy className="w-3.5 h-3.5" />
									</button>
								</div>
								<pre className="px-3 py-2 text-[11px] text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words">
									{safeJson(selectedToolCall.input)}
								</pre>
							</div>

							<div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
								<div className="px-3 py-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
									<span>输出</span>
									<button
										type="button"
										onClick={() => copy(safeJson(selectedToolCall.output))}
										className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white/70 dark:hover:bg-zinc-800/60 transition-colors"
										title="复制"
									>
										<Copy className="w-3.5 h-3.5" />
									</button>
								</div>
								<pre className="px-3 py-2 text-[11px] text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
									{safeJson(selectedToolCall.output)}
								</pre>
							</div>

							{Array.isArray(selectedToolCall.subagentActivities) &&
								selectedToolCall.subagentActivities.length > 0 ? (
								<div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
									<div className="px-3 py-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800/60">
										子代理活动
									</div>
									<div className="px-2 py-2 space-y-1">
										{selectedToolCall.subagentActivities.slice(-50).map((s) => (
											<div
												key={s.id}
												className="px-2 py-1.5 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
											>
												<div className="text-[11px] text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words">
													{s.content}
												</div>
											</div>
										))}
									</div>
								</div>
							) : null}

							<div className="flex items-center justify-between pt-1">
								<button
									type="button"
									onClick={() => {
										events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
											toolCallId: selectedToolCall.id,
											source: "graph",
										});
									}}
									className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90 transition-opacity"
								>
									<ChevronRight className="w-4 h-4" />
									定位到右侧
								</button>
								<div className="text-[11px] text-zinc-400 dark:text-zinc-500">
									{selectedToolCall.duration
										? `耗时 ${formatDuration(selectedToolCall.duration)}`
										: ""}
								</div>
							</div>
						</>
					) : selectedArtifact ? (
						<>
							<div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
								<div className="px-3 py-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800/60">
									路径
								</div>
								<div className="px-3 py-2 text-[12px] text-zinc-700 dark:text-zinc-200 break-words">
									{selectedArtifact.url || "—"}
								</div>
							</div>

							{selectedArtifact.url ? (
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => onOpenArtifact(selectedArtifact.url!)}
										className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90 transition-opacity"
									>
										<Eye className="w-4 h-4" />
										打开预览
									</button>
									<button
										type="button"
										onClick={() => copy(selectedArtifact.url!)}
										className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 transition-colors"
									>
										<Copy className="w-4 h-4" />
										复制路径
									</button>
								</div>
							) : null}
						</>
					) : isTaskSelected ? (
						<div className="space-y-3">
							<div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
								<div className="px-3 py-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800/60">
									任务描述
								</div>
								<div className="px-3 py-2 text-[12px] text-zinc-700 dark:text-zinc-200 break-words">
									{source.subtitle || "—"}
								</div>
							</div>
						</div>
					) : (
						<div className="text-sm text-zinc-500 dark:text-zinc-400">
							未找到对应数据。
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function ExecutionGraphInner({
	source,
	onOpenArtifact,
}: {
	source: ExecutionGraphSource | null;
	onOpenArtifact: (filePath: string) => void;
}) {
	const graphBuild = useMemo(() => buildExecutionGraph(source), [source]);
	const graph = useMemo(
		() => ({ nodes: graphBuild.nodes, edges: graphBuild.edges }),
		[graphBuild.edges, graphBuild.nodes],
	);

	const toolCalls = source?.toolCalls || [];
	const artifacts = source?.artifacts || [];

	const toolCallById = useMemo(() => {
		const map = new Map<string, ToolCall>();
		for (const tc of toolCalls) map.set(tc.id, tc);
		return map;
	}, [toolCalls]);

	const artifactByNodeId = useMemo(() => {
		const map = new Map<string, ToolArtifact>();
		for (const a of artifacts) map.set(`artifact-${a.id}`, a);
		return map;
	}, [artifacts]);

	const { fitView } = useReactFlow();

	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [follow, setFollow] = useState(true);
	const lastFocusKeyRef = useRef<string>("");

	useEffect(() => {
		setSelectedNodeId(null);
		setFollow(true);
		lastFocusKeyRef.current = "";
	}, [source?.id]);

	const runningToolIds = useMemo(() => {
		const ids = graph.nodes
			.filter((n) => n.type === "tool" && (n.data as any)?.status === "running")
			.map((n) => n.id);
		return ids;
	}, [graph.nodes]);

	const focusIds =
		runningToolIds.length > 0
			? runningToolIds
			: graphBuild.taskNodeId
				? [graphBuild.taskNodeId]
				: [];

	useEffect(() => {
		if (!follow) return;
		if (focusIds.length === 0) return;

		const key = focusIds.join("|");
		if (key === lastFocusKeyRef.current) return;
		lastFocusKeyRef.current = key;

		const t = setTimeout(() => {
			try {
				fitView({
					nodes: focusIds.map((id) => ({ id })),
					padding: 0.35,
					duration: 800,
					minZoom: 0.15,
					maxZoom: 1.05,
				});
			} catch { }
		}, 200);

		return () => clearTimeout(t);
	}, [fitView, focusIds, follow]);

	useEffect(() => {
		return events.on(EVENTS.AGENT_FOCUS_TOOL_CALL, (payload) => {
			const toolCallId =
				typeof payload?.toolCallId === "string" ? payload.toolCallId : "";
			if (!toolCallId) return;
			if (!toolCallById.has(toolCallId)) return;
			setSelectedNodeId(toolCallId);
			try {
				fitView({
					nodes: [{ id: toolCallId }],
					padding: 0.4,
					duration: 600,
					minZoom: 0.2,
					maxZoom: 1.1,
				});
			} catch { }
		});
	}, [fitView, toolCallById]);

	const onNodeClick = useCallback(
		(_: React.MouseEvent, node: ExecutionGraphNode) => {
			setSelectedNodeId(node.id);
			if (node.data.kind === "tool") {
				events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
					toolCallId: node.id,
					source: "graph",
				});
			}
			if (node.data.kind === "artifact" && node.data.url) {
				onOpenArtifact(node.data.url);
			}
		},
		[onOpenArtifact],
	);

	const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

	if (!source) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900">
				<div className="text-center space-y-2 max-w-md">
					<div className="mx-auto w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center">
						<Sparkles className="w-6 h-6 text-zinc-400" />
					</div>
					<div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
						暂无运行任务
					</div>
					<div className="text-xs text-zinc-400 dark:text-zinc-500">
						开始托管任务后，这里会展示运行图。
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 relative bg-zinc-50 dark:bg-zinc-900">
			{/* Top-right micro toolbar */}
			<div className="absolute right-4 top-4 z-20 flex items-center gap-2 pointer-events-auto">
				<button
					type="button"
					onClick={() => setFollow((v) => !v)}
					className={cn(
						"inline-flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-medium border backdrop-blur-xl transition-all",
						"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
						follow
							? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-black/[0.06] dark:border-white/[0.08]"
							: "bg-white/85 dark:bg-zinc-950/60 text-zinc-700 dark:text-zinc-200 border-black/[0.06] dark:border-white/[0.08] hover:bg-white dark:hover:bg-zinc-900/70",
					)}
					title={follow ? "正在跟随运行节点" : "暂停自动聚焦"}
				>
					{follow ? (
						<ChevronRight className="w-4 h-4" />
					) : (
						<ChevronLeft className="w-4 h-4" />
					)}
					跟随
				</button>
			</div>

			<ReactFlow
				nodes={graph.nodes}
				edges={graph.edges}
				nodeTypes={nodeTypes as any}
				onNodeClick={onNodeClick}
				onPaneClick={onPaneClick}
				onMoveStart={() => setFollow(false)}
				fitView
				fitViewOptions={{ padding: 0.35, minZoom: 0.15, maxZoom: 1.05 }}
				minZoom={0.1}
				maxZoom={1.2}
				proOptions={{ hideAttribution: true }}
			>
				<Background
					variant={BackgroundVariant.Dots}
					gap={22}
					size={1}
					color="rgba(148,163,184,0.35)"
				/>
				<Controls
					position="bottom-left"
					showInteractive={false}
					className="!bg-white/70 dark:!bg-zinc-950/40 !backdrop-blur-xl !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
				/>
				<MiniMap
					position="bottom-right"
					zoomable
					pannable
					className="!bg-white/70 dark:!bg-zinc-950/40 !backdrop-blur-xl !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
				/>
			</ReactFlow>

			{selectedNodeId ? (
				<GraphInspector
					selectedNodeId={selectedNodeId}
					source={source}
					taskNodeId={graphBuild.taskNodeId || `task-${source.id}`}
					toolCallById={toolCallById}
					artifactByNodeId={artifactByNodeId}
					onClose={() => setSelectedNodeId(null)}
					onOpenArtifact={onOpenArtifact}
				/>
			) : null}
		</div>
	);
}

export function ExecutionGraph({
	source,
	onOpenArtifact,
}: {
	source: ExecutionGraphSource | null;
	onOpenArtifact: (filePath: string) => void;
}) {
	return (
		<ReactFlowProvider>
			<ExecutionGraphInner source={source} onOpenArtifact={onOpenArtifact} />
		</ReactFlowProvider>
	);
}
