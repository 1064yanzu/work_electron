import type { ToolCall } from "../../../lib/agent/types";
import type { SwarmAgentInfo } from "../SwarmCard";

/** 将 Task 类型的 ToolCall 转换为 SwarmAgentInfo */
export function toolCallToSwarmAgent(
	tc: ToolCall,
	index: number,
): SwarmAgentInfo {
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

export type SwarmGroup =
	| { type: "swarm"; calls: ToolCall[] }
	| { type: "single"; call: ToolCall };

/** 将 toolCalls 分组：连续的 Task 调用聚合为蜂群，其他保持原样 */
export function groupToolCallsForSwarm(toolCalls: ToolCall[]): SwarmGroup[] {
	const groups: SwarmGroup[] = [];

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
