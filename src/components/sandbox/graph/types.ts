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

export type TaskGraphNode = Node<TaskNodeData, "task">;
export type ToolGraphNode = Node<ToolNodeData, "tool">;
export type ArtifactGraphNode = Node<ArtifactNodeData, "artifact">;
export type ExecutionGraphNode =
	| TaskGraphNode
	| ToolGraphNode
	| ArtifactGraphNode;

export type ExecutionGraphBuild = {
	nodes: ExecutionGraphNode[];
	edges: Edge[];
	taskNodeId: string | null;
};

export type GraphNodeQuickAction =
	| "focus_sidebar"
	| "copy_input"
	| "copy_output"
	| "open_artifact";
