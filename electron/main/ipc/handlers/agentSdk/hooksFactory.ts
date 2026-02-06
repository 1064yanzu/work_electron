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
			| "PermissionRequest";
		additionalContext?: string;
	};
};

export function createLifecycleHooks(input: {
	logger: Logger;
	runId: string;
	stderr: (message: string) => void;
	emitLifecycleEvent: (event: Record<string, unknown>) => void;
}) {
	const { logger, runId, stderr, emitLifecycleEvent } = input;

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
						});
						logger.info({
							msg: "agent_sdk session start",
							scope: "agent",
							runId,
							source: hookInput?.source ?? null,
						});
						return { continue: true };
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
						});
						stderr(
							`[PreCompact] trigger='${String(hookInput?.trigger ?? "unknown")}'`,
						);
						return { continue: true };
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
							type: "task_notification",
							taskId: hookInput?.task_id ?? null,
							status: "completed",
							summary: hookInput?.task_subject ?? null,
						});
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
	};
}
