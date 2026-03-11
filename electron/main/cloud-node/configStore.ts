import type { DbContext } from "../db/client";
import { parseJsonSafely } from "../remote-control/core/utils";
import { CLOUD_NODE_CONFIG_KEY, DEFAULT_CLOUD_NODE_CONFIG } from "./defaults";
import type { CloudNodeConfig, CloudNodeRoutingMode } from "./types";

const VALID_ROUTING_MODES: CloudNodeRoutingMode[] = [
	"cloud_only",
	"prefer_desktop",
	"auto",
];

function toCloudNodeConfig(raw: unknown): CloudNodeConfig {
	const fallback = structuredClone(DEFAULT_CLOUD_NODE_CONFIG);
	if (!raw || typeof raw !== "object") return fallback;
	const input = raw as Record<string, unknown>;

	if (typeof input.enabled === "boolean") fallback.enabled = input.enabled;
	if (typeof input.relayUrl === "string") fallback.relayUrl = input.relayUrl;
	if (typeof input.nodeId === "string") fallback.nodeId = input.nodeId;
	if (typeof input.nodeToken === "string") fallback.nodeToken = input.nodeToken;
	if (typeof input.nodeName === "string") fallback.nodeName = input.nodeName;
	if (typeof input.heartbeatSec === "number") {
		fallback.heartbeatSec = Math.max(5, Math.min(120, Math.floor(input.heartbeatSec)));
	}
	if (
		typeof input.routingMode === "string" &&
		VALID_ROUTING_MODES.includes(input.routingMode as CloudNodeRoutingMode)
	) {
		fallback.routingMode = input.routingMode as CloudNodeRoutingMode;
	}

	fallback.relayUrl = String(fallback.relayUrl || "").trim();
	fallback.nodeId = String(fallback.nodeId || "").trim();
	fallback.nodeToken = String(fallback.nodeToken || "").trim();
	fallback.nodeName = String(fallback.nodeName || "desktop-node").trim() || "desktop-node";
	return fallback;
}

export class CloudNodeConfigStore {
	constructor(private readonly db: DbContext) {}

	async load(): Promise<CloudNodeConfig> {
		const row = await this.db.client.execute({
			sql: "SELECT value FROM app_config WHERE key = ?",
			args: [CLOUD_NODE_CONFIG_KEY],
		});
		const value = row.rows[0]?.value;
		const parsed = parseJsonSafely<unknown>(typeof value === "string" ? value : null);
		return toCloudNodeConfig(parsed);
	}

	async save(config: CloudNodeConfig): Promise<void> {
		await this.db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [CLOUD_NODE_CONFIG_KEY, JSON.stringify(toCloudNodeConfig(config)), Date.now()],
		});
	}
}
