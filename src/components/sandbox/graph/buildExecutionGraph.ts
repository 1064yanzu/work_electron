import type { Edge } from "@xyflow/react";
import type { ToolArtifact, ToolCall } from "../../../lib/agent/types";
import {
	type ExecutionGraphBuild,
	type ExecutionGraphNode,
	type ExecutionGraphSource,
} from "./types";
import { getSubagentType } from "./utils";

/** 从工具调用的 input 生成简短摘要 */
function summarizeInput(input: Record<string, any> | undefined, maxLen = 80): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	// 常见字段优先级
	const candidates = ["command", "path", "file_path", "url", "query", "prompt", "content", "description"];
	for (const key of candidates) {
		const val = input[key];
		if (typeof val === "string" && val.trim()) {
			const clean = val.trim().replace(/\n/g, " ");
			return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
		}
	}
	// fallback: 第一个字符串值
	for (const val of Object.values(input)) {
		if (typeof val === "string" && val.trim().length > 2) {
			const clean = val.trim().replace(/\n/g, " ");
			return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
		}
	}
	return undefined;
}

/** 从工具调用的 output 生成简短摘要 */
function summarizeOutput(output: any, maxLen = 80): string | undefined {
	if (output == null) return undefined;
	if (typeof output === "string") {
		const clean = output.trim().replace(/\n/g, " ");
		if (clean.length < 3) return undefined;
		return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
	}
	if (typeof output === "object") {
		// 常见 output 结构
		const text = output.content || output.result || output.message || output.text;
		if (typeof text === "string" && text.trim().length > 2) {
			const clean = text.trim().replace(/\n/g, " ");
			return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
		}
	}
	return undefined;
}

/** 阶段间隔检测阈值（ms） */
const PHASE_GAP_THRESHOLD = 5000;

/** 并行子代理组：startedAt 差值 < threshold 的连续子代理 */
interface ParallelGroup {
	/** 组内子代理在 orderedToolCalls 中的索引 */
	indices: number[];
	/** 组的分叉源节点 ID（TaskNode 或前一个非子代理节点） */
	forkSourceId: string;
}

/**
 * 检测并行子代理组
 * 连续的子代理节点，如果 startedAt 差值 < threshold，归为同一并行组
 */
function detectParallelGroups(
	orderedToolCalls: ToolCall[],
	taskNodeId: string,
	threshold = 2000,
): ParallelGroup[] {
	const groups: ParallelGroup[] = [];
	let currentGroup: ParallelGroup | null = null;

	for (let i = 0; i < orderedToolCalls.length; i++) {
		const tc = orderedToolCalls[i]!;
		const subType = getSubagentType(tc);
		if (!subType) {
			// 非子代理节点，结束当前组
			if (currentGroup && currentGroup.indices.length >= 2) {
				groups.push(currentGroup);
			}
			currentGroup = null;
			continue;
		}

		if (!currentGroup) {
			// 开始新的潜在并行组
			// 分叉源：往前找最近的非子代理节点，或 taskNodeId
			let forkSourceId = taskNodeId;
			for (let j = i - 1; j >= 0; j--) {
				const prev = orderedToolCalls[j]!;
				if (!getSubagentType(prev)) {
					forkSourceId = prev.id;
					break;
				}
			}
			currentGroup = { indices: [i], forkSourceId };
		} else {
			// 检查与组内前一个子代理的时间差
			const prevIdx = currentGroup.indices[currentGroup.indices.length - 1]!;
			const prevTc = orderedToolCalls[prevIdx]!;
			const prevStart = typeof prevTc.startedAt === "number" ? prevTc.startedAt : null;
			const curStart = typeof tc.startedAt === "number" ? tc.startedAt : null;

			if (prevStart !== null && curStart !== null && Math.abs(curStart - prevStart) < threshold) {
				currentGroup.indices.push(i);
			} else {
				// 时间差太大，结束当前组，开始新组
				if (currentGroup.indices.length >= 2) {
					groups.push(currentGroup);
				}
				let forkSourceId = taskNodeId;
				for (let j = i - 1; j >= 0; j--) {
					const prev = orderedToolCalls[j]!;
					if (!getSubagentType(prev)) {
						forkSourceId = prev.id;
						break;
					}
				}
				currentGroup = { indices: [i], forkSourceId };
			}
		}
	}

	// 处理末尾的组
	if (currentGroup && currentGroup.indices.length >= 2) {
		groups.push(currentGroup);
	}

	return groups;
}

export function buildExecutionGraph(
	source: ExecutionGraphSource | null,
): ExecutionGraphBuild {
	if (!source) return { nodes: [], edges: [], taskNodeId: null, laneCount: 0 };

	const toolCalls = Array.isArray(source.toolCalls) ? source.toolCalls : [];
	const artifacts = Array.isArray(source.artifacts) ? source.artifacts : [];

	// 预构建 index map 避免排序中 O(n) 的 indexOf 调用
	const originalIndex = new Map<ToolCall, number>();
	for (let i = 0; i < toolCalls.length; i++) {
		originalIndex.set(toolCalls[i]!, i);
	}
	const orderedToolCalls = [...toolCalls].sort((a, b) => {
		const ta = typeof a.startedAt === "number" ? a.startedAt : null;
		const tb = typeof b.startedAt === "number" ? b.startedAt : null;
		if (ta !== null && tb !== null && ta !== tb) return ta - tb;
		return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
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

	const laneCount = laneKeys.length;
	const toolCount = orderedToolCalls.length;
	const X_STEP = toolCount > 16 ? 300 : toolCount > 10 ? 340 : 380;
	const Y_STEP = laneCount > 3 ? 170 : 190;
	const ROOT_X = 40;
	const ROOT_Y = 40;

	let toolsCompleted = 0;
	let toolsFailed = 0;
	for (const t of orderedToolCalls) {
		if (t.status === "completed") toolsCompleted++;
		else if (t.status === "error") toolsFailed++;
	}

	const nodes: ExecutionGraphNode[] = [];
	const edges: Edge[] = [];

	const taskNodeId = `task-${source.id}`;
	laneKeys.forEach((laneKey, index) => {
		const label =
			laneKey === "main" ? "主流程" : laneKey.replace("subagent:", "");
		nodes.push({
			id: `lane-${laneKey}`,
			type: "lane",
			position: { x: ROOT_X - 220, y: ROOT_Y + index * Y_STEP + 62 },
			draggable: false,
			selectable: false,
			data: {
				kind: "lane",
				laneId: laneKey,
				label,
			},
		});
	});

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

	// 检测并行子代理组
	const parallelGroups = detectParallelGroups(orderedToolCalls, taskNodeId);
	// 构建索引 → 所属并行组的映射
	const indexToGroup = new Map<number, ParallelGroup>();
	for (const group of parallelGroups) {
		for (const idx of group.indices) {
			indexToGroup.set(idx, group);
		}
	}

	// 用于追踪并行组内的 X 偏移（同组共享同一 X 列）
	const groupBaseXMap = new Map<ParallelGroup, number>();
	let nextXSlot = 1; // 下一个可用的 X 列位置

	for (let i = 0; i < orderedToolCalls.length; i++) {
		const tc = orderedToolCalls[i]!;
		const subType = getSubagentType(tc);
		const lane = subType ? `subagent:${subType}` : "main";
		const lanePos = laneIndex.get(lane) ?? 0;
		const y = ROOT_Y + lanePos * Y_STEP;

		const group = indexToGroup.get(i);
		let x: number;
		if (group) {
			// 并行组内的节点共享同一 X 列（视觉上对齐，体现"同时开始"）
			if (!groupBaseXMap.has(group)) {
				groupBaseXMap.set(group, nextXSlot);
				nextXSlot++;
			}
			x = ROOT_X + groupBaseXMap.get(group)! * X_STEP;
		} else {
			x = ROOT_X + nextXSlot * X_STEP;
			nextXSlot++;
		}

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
				inputSummary: summarizeInput(tc.input),
				outputSummary: summarizeOutput(tc.output),
			},
		});

		// 构建边：并行组内的节点都从 forkSourceId 分叉
		const group2 = indexToGroup.get(i);
		if (group2) {
			// 并行组内：所有子代理都从 forkSourceId 分叉
			const forkSource = group2.forkSourceId;
			edges.push({
				id: `edge-${forkSource}-${tc.id}`,
				source: forkSource,
				target: tc.id,
				type: "smoothstep",
				animated: tc.status === "running",
				style: {
					stroke: "rgba(217,108,70,0.82)",
					strokeWidth: 2,
					strokeDasharray: "6 6",
					opacity: 0.85,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				},
			});
		} else {
			// 非并行组：串行连接
			const sourceId = i === 0 ? taskNodeId : orderedToolCalls[i - 1]!.id;
			const prevGroup = i > 0 ? indexToGroup.get(i - 1) : undefined;
			const effectiveSourceId = prevGroup
				? orderedToolCalls[prevGroup.indices[prevGroup.indices.length - 1]!]!.id
				: sourceId;
			const sourceLaneY =
				effectiveSourceId === taskNodeId
					? ROOT_Y
					: (toolYById.get(effectiveSourceId) ?? ROOT_Y);
			const sameLane = sourceLaneY === y;
			const crossLane = !sameLane;
			const isSub = Boolean(subType);
			const isErr = tc.status === "error";

			// 边样式分级：主流程实线粗、子代理虚线、错误红色高亮
			const edgeStroke = isErr
				? "rgba(244,63,94,0.85)"
				: isSub
					? "rgba(217,108,70,0.82)"
					: "rgba(148,163,184,0.75)";
			const edgeWidth = isErr ? 2.5 : isSub ? 2 : crossLane ? 1.5 : 2.5;
			const edgeDash = isSub || crossLane ? "6 6" : undefined;

			edges.push({
				id: `edge-${effectiveSourceId}-${tc.id}`,
				source: effectiveSourceId,
				target: tc.id,
				type: "smoothstep",
				animated: tc.status === "running",
				style: {
					stroke: edgeStroke,
					strokeWidth: edgeWidth,
					strokeDasharray: edgeDash,
					opacity: 0.85,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				},
			});
		}
	}

	// 插入阶段分隔节点：检测主流程工具调用间的时间间隔
	let phaseCount = 0;
	for (let i = 1; i < orderedToolCalls.length; i++) {
		const prevTc = orderedToolCalls[i - 1]!;
		const curTc = orderedToolCalls[i]!;
		// 只在主流程中插入分隔（非子代理）
		if (getSubagentType(prevTc) || getSubagentType(curTc)) continue;
		// 并行组内不插入
		if (indexToGroup.has(i) || indexToGroup.has(i - 1)) continue;

		const prevEnd = typeof prevTc.completedAt === "number" ? prevTc.completedAt : (typeof prevTc.startedAt === "number" && prevTc.duration ? prevTc.startedAt + prevTc.duration : null);
		const curStart = typeof curTc.startedAt === "number" ? curTc.startedAt : null;

		if (prevEnd !== null && curStart !== null) {
			const gapMs = curStart - prevEnd;
			if (gapMs >= PHASE_GAP_THRESHOLD) {
				phaseCount++;
				const prevX = toolXById.get(prevTc.id) ?? ROOT_X;
				const curX = toolXById.get(curTc.id) ?? (prevX + X_STEP);
				const dividerX = (prevX + curX) / 2;
				const dividerY = ROOT_Y - 30;
				const dividerId = `phase-${phaseCount}`;

				nodes.push({
					id: dividerId,
					type: "phase_divider",
					position: { x: dividerX, y: dividerY },
					draggable: false,
					selectable: false,
					data: {
						kind: "phase_divider",
						label: `阶段 ${phaseCount + 1}`,
						phaseIndex: phaseCount,
						gapMs,
					},
				});
			}
		}
	}

	// 为每个并行组插入 SwarmOverviewNode（2+ 个并行子代理时）
	for (const group of parallelGroups) {
		const groupToolCalls = group.indices.map((idx) => orderedToolCalls[idx]!);
		let completed = 0;
		let running = 0;
		let failed = 0;
		for (const tc of groupToolCalls) {
			if (tc.status === "completed") completed++;
			else if (tc.status === "running") running++;
			else if (tc.status === "error") failed++;
		}

		// 放在 TaskNode 右侧（forkSource 的右上方）
		const forkX = group.forkSourceId === taskNodeId
			? ROOT_X
			: (toolXById.get(group.forkSourceId) ?? ROOT_X);
		const swarmX = forkX + X_STEP * 0.5;
		const swarmY = ROOT_Y - Y_STEP * 0.7;

		const swarmNodeId = `swarm-overview-${group.indices[0]}`;
		nodes.push({
			id: swarmNodeId,
			type: "swarm_overview",
			position: { x: swarmX, y: swarmY },
			data: {
				kind: "swarm_overview",
				totalAgents: groupToolCalls.length,
				completedAgents: completed,
				runningAgents: running,
				failedAgents: failed,
			},
		});

		// 从 forkSource 连到 SwarmOverviewNode
		edges.push({
			id: `edge-${group.forkSourceId}-${swarmNodeId}`,
			source: group.forkSourceId,
			target: swarmNodeId,
			type: "smoothstep",
			style: {
				stroke: "rgba(217,108,70,0.5)",
				strokeWidth: 1.5,
				strokeDasharray: "4 4",
				opacity: 0.7,
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

	return { nodes, edges, taskNodeId, laneCount };
}
