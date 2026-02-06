import type { Edge } from "@xyflow/react";
import type { ToolArtifact } from "../../../lib/agent/types";
import {
	type ExecutionGraphBuild,
	type ExecutionGraphNode,
	type ExecutionGraphSource,
} from "./types";
import { getSubagentType } from "./utils";

export function buildExecutionGraph(
	source: ExecutionGraphSource | null,
): ExecutionGraphBuild {
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

	const toolsCompleted = orderedToolCalls.filter(
		(t) => t.status === "completed",
	).length;
	const toolsFailed = orderedToolCalls.filter(
		(t) => t.status === "error",
	).length;

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
		const lanePos = laneIndex.get(lane) ?? 0;
		const y = ROOT_Y + lanePos * Y_STEP;
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
				step: i + 1,
				name: tc.name,
				status: tc.status,
				description: tc.description,
				durationMs: tc.duration,
				startedAt: tc.startedAt,
				isSubagent: Boolean(subType),
				subagentType: subType || undefined,
				lastActivity: lastActivity
					? String(lastActivity).slice(0, 240)
					: undefined,
			},
		});

		const sourceId = i === 0 ? taskNodeId : orderedToolCalls[i - 1]!.id;
		const sourceLaneY =
			sourceId === taskNodeId ? ROOT_Y : (toolYById.get(sourceId) ?? ROOT_Y);
		const sameLane = sourceLaneY === y;
		const dashed = !sameLane;
		const isSub = Boolean(subType);

		edges.push({
			id: `edge-${sourceId}-${tc.id}`,
			source: sourceId,
			target: tc.id,
			type: "smoothstep",
			animated: tc.status === "running",
			style: {
				stroke: isSub
					? "rgba(139,92,246,0.85)"
					: tc.status === "error"
						? "rgba(251,113,133,0.85)"
						: "rgba(148,163,184,0.75)",
				strokeWidth: 2,
				strokeDasharray: dashed ? "6 6" : undefined,
				opacity: 0.85,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			},
		});
	}

	const artifactsByTool = new Map<string, ToolArtifact[]>();
	for (const a of artifacts) {
		const toolCallId = String(a?.metadata?.toolCallId || "").trim();
		const key = toolCallId || "__unbound__";
		const arr = artifactsByTool.get(key) || [];
		arr.push(a);
		artifactsByTool.set(key, arr);
	}

	const baseArtifactsY = ROOT_Y + laneKeys.length * Y_STEP + 90;
	let artifactStep = 0;
	for (const [toolCallId, list] of artifactsByTool.entries()) {
		const yOffset = toolCallId === "__unbound__" ? 70 : 0;
		for (let i = 0; i < list.length; i++) {
			const a = list[i]!;
			artifactStep += 1;
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
					step: artifactStep,
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
						stroke: "rgba(161,161,170,0.75)",
						strokeWidth: 1.5,
						strokeDasharray: "2 6",
						opacity: 0.8,
						strokeLinecap: "round",
						strokeLinejoin: "round",
					},
				});
			}
		}
	}

	return { nodes, edges, taskNodeId };
}
