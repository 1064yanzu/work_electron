import { agentStore } from "@/lib/agent/store";
import type { StreamBlocksBuilder } from "@/lib/chat/streamBlocksBuilder";

export function createAgentWatchdogProbe(deps: {
	isFinalized: () => boolean;
	getStreamingMsgId: () => string | null;
	getLastActivityAt: () => number;
	streamBuilder: StreamBlocksBuilder;
	getStreamText: () => string;
}) {
	const {
		isFinalized,
		getStreamingMsgId,
		getLastActivityAt,
		streamBuilder,
		getStreamText,
	} = deps;

	return () => {
		if (isFinalized()) return null;
		if (!getStreamingMsgId()) return null;
		const live = agentStore.getState();
		const liveTaskStatus = live.currentTask?.status;
		return {
			silenceMs: Date.now() - getLastActivityAt(),
			stillRunning: Boolean(
				live.isExecuting ||
					live.isWaitingForLLM ||
					liveTaskStatus === "planning" ||
					liveTaskStatus === "executing" ||
					(live.currentSkill &&
						live.currentSkill.status !== "completed" &&
						live.currentSkill.status !== "error"),
			),
			hasRunningTools: streamBuilder
				.getBlocks()
				.some(
					(b) =>
						b.type === "tool_call" &&
						(b.status === "running" || b.status === "pending"),
				),
			hasText: getStreamText().trim().length > 0,
		};
	};
}
