import type { Edge, Node } from "@xyflow/react";
import type {
	AgentTask,
	ToolArtifact,
	ToolCall,
} from "../../../lib/agent/types";

export type ExecutionGraphSource = {
	id: string;
	title: string;
	subtitle?: string;
	status: AgentTask["status"];
	toolCalls: ToolCall[];
	artifacts: ToolArtifact[];
};

export type GraphFilter = "all" | "running" | "error" | "artifact";
export type ArtifactClickBehavior = "select_only" | "open_preview";

export type TaskNodeData = {
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

export type ToolNodeData = {
	kind: "tool";
	toolCallId: string;
	step: number;
	name: string;
	status: ToolCall["status"];
	description?: string;
	durationMs?: number;
	startedAt?: number;
	isSubagent?: boolean;
	subagentType?: string;
	lastActivity?: string;
	inputSummary?: string;
	outputSummary?: string;
};

export type ArtifactNodeData = {
	kind: "artifact";
	artifactId: string;
	step: number;
	title: string;
	artifactType: ToolArtifact["type"];
	url?: string;
	toolCallId?: string;
};

export type LaneNodeData = {
	kind: "lane";
	laneId: string;
	label: string;
};

export type SwarmOverviewNodeData = {
	kind: "swarm_overview";
	totalAgents: number;
	completedAgents: number;
	runningAgents: number;
	failedAgents: number;
};

export type PhaseDividerNodeData = {
	kind: "phase_divider";
	label: string;
	phaseIndex: number;
	gapMs?: number;
};

export type TaskGraphNode = Node<TaskNodeData, "task">;
export type ToolGraphNode = Node<ToolNodeData, "tool">;
export type ArtifactGraphNode = Node<ArtifactNodeData, "artifact">;
export type LaneGraphNode = Node<LaneNodeData, "lane">;
export type SwarmOverviewGraphNode = Node<SwarmOverviewNodeData, "swarm_overview">;
export type PhaseDividerGraphNode = Node<PhaseDividerNodeData, "phase_divider">;
export type ExecutionGraphNode =
	| TaskGraphNode
	| ToolGraphNode
	| ArtifactGraphNode
	| LaneGraphNode
	| SwarmOverviewGraphNode
	| PhaseDividerGraphNode;

export type ExecutionGraphBuild = {
	nodes: ExecutionGraphNode[];
	edges: Edge[];
	taskNodeId: string | null;
	laneCount: number;
};

export type GraphNodeQuickAction =
	| "focus_sidebar"
	| "copy_input"
	| "copy_output"
	| "open_artifact";
