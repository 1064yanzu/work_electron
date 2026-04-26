import type { AgentSession } from "../../../lib/agent/api";
import type { BackendThreadMetadata } from "./threadGrouping";

export function parseBackendThreadMetadata(
	session: AgentSession,
): BackendThreadMetadata {
	const config =
		session.config_json && typeof session.config_json === "object"
			? (session.config_json as Record<string, unknown>)
			: {};

	const source =
		config.source === "remote-control"
			? "remote"
			: config.source === "local-chat"
				? "local"
				: undefined;

	const readString = (key: string): string | undefined => {
		const value = config[key];
		return typeof value === "string" && value.trim() ? value.trim() : undefined;
	};

	return {
		source,
		cwd: readString("cwd"),
		remoteSessionId: readString("remoteSessionId"),
		channelId: readString("channelId"),
		peerName: readString("peerName"),
		peerId: readString("peerId"),
	};
}

export function buildBackendThreadMetadataMap(
	sessions: AgentSession[],
): Map<string, BackendThreadMetadata> {
	const map = new Map<string, BackendThreadMetadata>();
	for (const session of sessions) {
		map.set(session.id, parseBackendThreadMetadata(session));
	}
	return map;
}
