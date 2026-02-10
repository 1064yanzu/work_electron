import type {
	RemoteGatewayMethod,
	RemoteGatewayScope,
} from "../../../shared/remote-control-schema";

const ADMIN_SCOPE: RemoteGatewayScope = "operator.admin";

const methodScopes: Record<RemoteGatewayMethod, RemoteGatewayScope[]> = {
	health: ["operator.read"],
	"channels.status": ["operator.read"],
	"sessions.list": ["operator.read"],
	"chat.send": ["operator.write"],
	"chat.abort": ["operator.write"],
	"interaction.resolve": ["operator.approvals"],
};

export function canCallGatewayMethod(
	method: RemoteGatewayMethod,
	scopes: RemoteGatewayScope[],
): boolean {
	if (scopes.includes(ADMIN_SCOPE)) return true;
	const required = methodScopes[method] ?? [];
	return required.some((scope) => scopes.includes(scope));
}

export function getRequiredScopes(
	method: RemoteGatewayMethod,
): RemoteGatewayScope[] {
	return [...(methodScopes[method] ?? [])];
}
