import type { Logger } from "../../../logging/types";

type HookResult = {
	continue: boolean;
	hookSpecificOutput?: {
		hookEventName:
			| "SessionStart"
			| "SessionEnd"
			| "PreCompact"
			| "TaskCompleted"
			| "Notification"
			| "PermissionRequest"
			| "TeammateIdle"
			| "PostToolUseFailure";
		additionalContext?: string;
	};
};

export function createLifecycleHooks(input: {
	logger: Logger;
	runId: string;
	stderr: (message: string) => void;
	emitLifecycleEvent: (event: Record<string, unknown>) => void;
	sessionAdditionalContext?: string;
	preCompactAdditionalContext?: string;
	runtimeMetadata?: Record<string, unknown>;
	experimentalMultiAgentEnabled?: boolean;
}) {
	const {
		logger,
		runId,
		stderr,
		emitLifecycleEvent,
		sessionAdditionalContext,
		preCompactAdditionalContext,
		runtimeMetadata,
		experimentalMultiAgentEnabled,
	} = input;

	return {
		SessionStart: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "SessionStart") {
							return { continue: true };
						}
						emitLifecycleEvent({
							type: "session_start",
							source: hookInput?.source ?? null,
							agentType: hookInput?.agent_type ?? null,
							model: hookInput?.model ?? null,
							...(runtimeMetadata || {}),
						});
						if (experimentalMultiAgentEnabled) {
							emitLifecycleEvent({
								type: "leader_start",
								source: hookInput?.source ?? null,
								agentType: hookInput?.agent_type ?? null,
								model: hookInput?.model ?? null,
								...(runtimeMetadata || {}),
							});
						}
						logger.info({
							msg: "agent_sdk session start",
							scope: "agent",
							runId,
							source: hookInput?.source ?? null,
						});
						return sessionAdditionalContext
							? {
									continue: true,
									hookSpecificOutput: {
										hookEventName: "SessionStart",
										additionalContext: sessionAdditionalContext,
									},
								}
							: { continue: true };
					},
				],
			},
		],
		SessionEnd: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "SessionEnd") {
							return { continue: true };
						}
						emitLifecycleEvent({
							type: "session_end",
							reason: hookInput?.reason ?? null,
						});
						logger.info({
							msg: "agent_sdk session end",
							scope: "agent",
							runId,
							reason: hookInput?.reason ?? null,
						});
						return { continue: true };
					},
				],
			},
		],
		PreCompact: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "PreCompact") {
							return { continue: true };
						}
						emitLifecycleEvent({
							type: "pre_compact",
							trigger: hookInput?.trigger ?? null,
							customInstructions: hookInput?.custom_instructions ?? null,
							...(runtimeMetadata || {}),
						});
						stderr(
							`[PreCompact] trigger='${String(hookInput?.trigger ?? "unknown")}'`,
						);
						return preCompactAdditionalContext
							? {
									continue: true,
									hookSpecificOutput: {
										hookEventName: "PreCompact",
										additionalContext: preCompactAdditionalContext,
									},
								}
							: { continue: true };
					},
				],
			},
		],
		TaskCompleted: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "TaskCompleted") {
							return { continue: true };
						}
						emitLifecycleEvent({
							type:
								hookInput?.teammate_name || hookInput?.team_name
									? "teammate_complete"
									: "task_notification",
							taskId: hookInput?.task_id ?? null,
							status: "completed",
							summary: hookInput?.task_subject ?? null,
							teammateName: hookInput?.teammate_name ?? null,
							teamName: hookInput?.team_name ?? null,
							...(runtimeMetadata || {}),
						});
						if (hookInput?.team_name && !hookInput?.teammate_name) {
							emitLifecycleEvent({
								type: "leader_merge",
								taskId: hookInput?.task_id ?? null,
								summary: hookInput?.task_subject ?? null,
								teamName: hookInput?.team_name ?? null,
								...(runtimeMetadata || {}),
							});
						}
						return { continue: true };
					},
				],
			},
		],
		Notification: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "Notification") {
							return { continue: true };
						}
						emitLifecycleEvent({
							type: "task_notification",
							notificationType: hookInput?.notification_type ?? null,
							title: hookInput?.title ?? null,
							message: hookInput?.message ?? null,
						});
						return { continue: true };
					},
				],
			},
		],
		PermissionRequest: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "PermissionRequest") {
							return { continue: true };
						}
						logger.info({
							msg: "agent_sdk permission request hook",
							scope: "agent",
							runId,
							tool: hookInput?.tool_name ?? null,
						});
						return { continue: true };
					},
				],
			},
		],
		TeammateIdle: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "TeammateIdle") {
							return { continue: true };
						}
						emitLifecycleEvent({
							type: "teammate_idle",
							teammateName: hookInput?.teammate_name ?? null,
							teamName: hookInput?.team_name ?? null,
							...(runtimeMetadata || {}),
						});
						return { continue: true };
					},
				],
			},
		],
		PostToolUseFailure: [
			{
				hooks: [
					async (hookInput: any): Promise<HookResult> => {
						if (hookInput?.hook_event_name !== "PostToolUseFailure") {
							return { continue: true };
						}
						if (String(hookInput?.tool_name || "") !== "Teammate") {
							return { continue: true };
						}
						emitLifecycleEvent({
							type: "delegation_fallback",
							toolName: hookInput?.tool_name ?? null,
							error: hookInput?.error ?? null,
							...(runtimeMetadata || {}),
						});
						return {
							continue: true,
							hookSpecificOutput: {
								hookEventName: "PostToolUseFailure",
								additionalContext:
									"Teammate 调用失败，请立即回退到 Task 子代理，并继续主流程。",
							},
						};
					},
				],
			},
		],
	};
}
