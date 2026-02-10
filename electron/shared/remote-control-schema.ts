export type RemoteGatewayRole = "operator" | "node";

export type RemoteGatewayScope =
	| "operator.read"
	| "operator.write"
	| "operator.approvals"
	| "operator.pairing"
	| "operator.admin";

export type RemoteGatewayAuth = {
	role: RemoteGatewayRole;
	scopes: RemoteGatewayScope[];
	deviceId?: string;
	token?: string;
};

export type RemoteGatewayMethod =
	| "health"
	| "channels.status"
	| "sessions.list"
	| "chat.send"
	| "chat.abort"
	| "interaction.resolve";

export type RemoteGatewayRequest = {
	id: string;
	method: RemoteGatewayMethod;
	params?: Record<string, unknown>;
	auth?: RemoteGatewayAuth;
};

export type RemoteGatewayResponse = {
	id: string;
	ok: boolean;
	payload?: unknown;
	error?: {
		code: string;
		message: string;
		details?: Record<string, unknown>;
	};
};

export type RemoteGatewayEvent =
	| "chat"
	| "presence"
	| "pairing.requested"
	| "pairing.resolved"
	| "interaction.requested"
	| "interaction.resolved";
