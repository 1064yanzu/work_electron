import type { Logger } from "../../../logging/types";

type HookResult = {
	continue: boolean;
	hookSpecificOutput?: {
		hookEventName: "SubagentStart" | "SubagentStop";
		additionalContext?: string;
	};
};

export function createSubagentLifecycleHooks(input: {
	logger: Logger;
	runId: string;
	stderr: (message: string) => void;
	emitLifecycleEvent?: (event: Record<string, unknown>) => void;
	subagentAdditionalContext?: string;
	runtimeMetadata?: Record<string, unknown>;
}) {
	const {
		logger,
		runId,
		stderr,
		emitLifecycleEvent,
		subagentAdditionalContext,
		runtimeMetadata,
	} = input;

	return {
		SubagentStart: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "SubagentStart") {
							return { continue: true };
						}
						const agentId = String(hookInput?.agent_id || "").trim();
						const agentType = String(hookInput?.agent_type || "").trim();

						logger.info({
							msg: "agent_sdk subagent start",
							scope: "agent",
							runId,
							agentId: agentId || null,
							agentType: agentType || null,
						});
						emitLifecycleEvent?.({
							type: "subagent_start",
							agentId: agentId || null,
							agentType: agentType || null,
							...(runtimeMetadata || {}),
						});
						stderr(
							`[SubagentStart] agent_id='${agentId || "unknown"}' agent_type='${agentType || "unknown"}'`,
						);

						return subagentAdditionalContext
							? {
									continue: true,
									hookSpecificOutput: {
										hookEventName: "SubagentStart",
										additionalContext: subagentAdditionalContext,
									},
								}
							: { continue: true };
					},
				],
			},
		],
		SubagentStop: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "SubagentStop") {
							return { continue: true };
						}
						const agentId = String(hookInput?.agent_id || "").trim();
						const agentType = String(hookInput?.agent_type || "").trim();
						const transcriptPath = String(
							hookInput?.agent_transcript_path || "",
						).trim();

						logger.info({
							msg: "agent_sdk subagent stop",
							scope: "agent",
							runId,
							agentId: agentId || null,
							agentType: agentType || null,
							transcriptPath: transcriptPath || null,
						});
						emitLifecycleEvent?.({
							type: "subagent_stop",
							agentId: agentId || null,
							agentType: agentType || null,
							transcriptPath: transcriptPath || null,
							...(runtimeMetadata || {}),
						});
						stderr(
							`[SubagentStop] agent_id='${agentId || "unknown"}' agent_type='${agentType || "unknown"}' transcript='${transcriptPath || "n/a"}'`,
						);

						return { continue: true };
					},
				],
			},
		],
	};
}
