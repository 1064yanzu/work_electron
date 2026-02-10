import type {
	RemoteGatewayMethod,
	RemoteGatewayRequest,
	RemoteGatewayResponse,
	RemoteGatewayScope,
} from "../../../shared/remote-control-schema";
import { canCallGatewayMethod, getRequiredScopes } from "../core/scopeGuard";
import { getRemoteControlOrchestrator } from "../core/service";

export const REMOTE_GATEWAY_METHODS: RemoteGatewayMethod[] = [
	"health",
	"channels.status",
	"sessions.list",
	"chat.send",
	"chat.abort",
	"interaction.resolve",
];

function withError(
	id: string,
	code: string,
	message: string,
	details?: Record<string, unknown>,
): RemoteGatewayResponse {
	return {
		id,
		ok: false,
		error: {
			code,
			message,
			details,
		},
	};
}

export async function handleRemoteGatewayRequest(
	request: RemoteGatewayRequest,
): Promise<RemoteGatewayResponse> {
	const id = request.id || "unknown";
	const method = request.method;
	const scopes = (request.auth?.scopes ?? []) as RemoteGatewayScope[];

	if (!canCallGatewayMethod(method, scopes)) {
		return withError(id, "MISSING_SCOPE", "missing required scope", {
			required: getRequiredScopes(method),
			provided: scopes,
		});
	}

	const orchestrator = getRemoteControlOrchestrator();
	try {
		switch (method) {
			case "health":
				return {
					id,
					ok: true,
					payload: {
						status: "ok",
						ts: Date.now(),
					},
				};
			case "channels.status":
				return {
					id,
					ok: true,
					payload: {
						channels: await orchestrator.listChannels(),
					},
				};
			case "sessions.list":
				return {
					id,
					ok: true,
					payload: {
						sessions: orchestrator.listSessions(100),
					},
				};
			case "chat.abort": {
				const runId = String(request.params?.runId ?? "").trim();
				if (!runId) {
					return withError(id, "INVALID_PARAMS", "runId is required");
				}
				const success = await orchestrator.terminateSession(runId);
				return { id, ok: true, payload: { success } };
			}
			case "chat.send":
				return withError(
					id,
					"NOT_IMPLEMENTED",
					"chat.send 网关入口已预留，首期由通道入站触发",
				);
			case "interaction.resolve":
				return withError(
					id,
					"NOT_IMPLEMENTED",
					"interaction.resolve 网关入口已预留，首期由通道命令触发",
				);
			default:
				return withError(id, "UNKNOWN_METHOD", `unknown method: ${method}`);
		}
	} catch (error) {
		return withError(
			id,
			"INTERNAL_ERROR",
			error instanceof Error ? error.message : String(error),
		);
	}
}
