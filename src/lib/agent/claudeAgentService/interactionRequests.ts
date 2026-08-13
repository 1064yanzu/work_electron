import { askUserQuestionStore } from "@/lib/agent/askUserQuestionStore";
import {
	type ExternalPermissionDecision,
	permissionStore,
} from "@/lib/agent/permissionStore";
import { invoke } from "@/lib/tauriCompat";

export interface InteractionRequestPayload {
	requestId?: unknown;
	toolName?: unknown;
	toolInput?: unknown;
	toolUseId?: unknown;
	runId?: unknown;
	expiresAt?: unknown;
	scope?: {
		insideSandbox?: boolean;
		targetPath?: string;
		destructiveLevel?: "safe" | "moderate" | "dangerous";
		reason?: string;
	};
}

export async function handleInteractionRequest(
	request: InteractionRequestPayload,
	runId: string,
): Promise<void> {
	const requestId =
		typeof request.requestId === "string" ? request.requestId : "";
	const toolName = typeof request.toolName === "string" ? request.toolName : "";
	const toolInput =
		request.toolInput && typeof request.toolInput === "object"
			? (request.toolInput as Record<string, unknown>)
			: {};
	if (!requestId || !toolName || !runId) return;

	try {
		if (toolName === "AskUserQuestion") {
			const normalizeQuestions = (
				value: unknown,
			): Array<{
				question: string;
				header: string;
				options: Array<{ label: string; description: string }>;
				multiSelect?: boolean;
				id?: string;
			}> => {
				if (!Array.isArray(value)) return [];
				const normalized: Array<{
					question: string;
					header: string;
					options: Array<{ label: string; description: string }>;
					multiSelect?: boolean;
					id?: string;
				}> = [];
				for (const item of value) {
					if (!item || typeof item !== "object") continue;
					const typed = item as Record<string, unknown>;
					const question =
						typeof typed.question === "string" ? typed.question : "";
					const header = typeof typed.header === "string" ? typed.header : "";
					if (!question || !header) continue;
					const options: Array<{
						label: string;
						description: string;
					}> = [];
					if (Array.isArray(typed.options)) {
						for (const opt of typed.options) {
							if (!opt || typeof opt !== "object") continue;
							const option = opt as Record<string, unknown>;
							const label =
								typeof option.label === "string" ? option.label : "";
							const description =
								typeof option.description === "string"
									? option.description
									: "";
							if (!label) continue;
							options.push({ label, description });
						}
					}
					if (options.length < 2) continue;
					normalized.push({
						question,
						header,
						options,
						multiSelect: typed.multiSelect === true || undefined,
						id: typeof typed.id === "string" ? typed.id : undefined,
					});
				}
				return normalized;
			};

			const expiresAt =
				typeof request.expiresAt === "number"
					? request.expiresAt
					: Date.now() + 55_000;
			const questions = normalizeQuestions(toolInput.questions);
			if (questions.length === 0) {
				await invoke("agent_sdk_resolve_interaction", {
					runId,
					requestId,
					decision: {
						behavior: "deny",
						message: "Invalid AskUserQuestion payload",
					},
				});
				return;
			}

			const decision = await askUserQuestionStore.request({
				requestId,
				runId,
				questions,
				expiresAt,
			});
			await invoke("agent_sdk_resolve_interaction", {
				runId,
				requestId,
				decision,
			});
			return;
		}

		const decision: ExternalPermissionDecision =
			await permissionStore.requestExternalPermission({
				requestId,
				toolCallId:
					typeof request.toolUseId === "string" ? request.toolUseId : requestId,
				toolName,
				toolInput,
				scope:
					request.scope?.insideSandbox != null
						? {
								insideSandbox: request.scope.insideSandbox,
								targetPath: request.scope.targetPath,
								destructiveLevel: request.scope.destructiveLevel,
								reason: request.scope.reason,
							}
						: undefined,
			});
		await invoke("agent_sdk_resolve_interaction", {
			runId,
			requestId,
			decision,
		});
	} catch (interactionError) {
		const message =
			interactionError instanceof Error
				? interactionError.message
				: String(interactionError);
		await invoke("agent_sdk_resolve_interaction", {
			runId,
			requestId,
			decision: {
				behavior: "deny",
				message,
			},
		});
	}
}
