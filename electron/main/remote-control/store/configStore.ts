import type { DbContext } from "../../db/client";
import {
	DEFAULT_REMOTE_CONTROL_CONFIG,
	REMOTE_CONTROL_CONFIG_KEY,
} from "../core/defaults";
import type { RemoteControlConfig } from "../core/types";
import { parseJsonSafely } from "../core/utils";

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

function mergeConfig(
	input: unknown,
	fallback: RemoteControlConfig,
): RemoteControlConfig {
	if (!isObject(input)) return fallback;
	const next = structuredClone(fallback);
	const source = input as Record<string, unknown>;

	if (typeof source.enabled === "boolean") next.enabled = source.enabled;
	if (isObject(source.channels)) {
		const channels = source.channels as Record<string, unknown>;
		if (isObject(channels.feishu)) {
			const feishu = channels.feishu as Record<string, unknown>;
			if (typeof feishu.enabled === "boolean")
				next.channels.feishu.enabled = feishu.enabled;
			if (typeof feishu.appId === "string")
				next.channels.feishu.appId = feishu.appId;
			if (typeof feishu.appSecret === "string")
				next.channels.feishu.appSecret = feishu.appSecret;
			if (feishu.domain === "feishu" || feishu.domain === "lark")
				next.channels.feishu.domain = feishu.domain;
			if (
				feishu.connectionMode === "websocket" ||
				feishu.connectionMode === "webhook"
			)
				next.channels.feishu.connectionMode = feishu.connectionMode;
			if (typeof feishu.webhookPath === "string")
				next.channels.feishu.webhookPath = feishu.webhookPath;
			if (typeof feishu.webhookPort === "number")
				next.channels.feishu.webhookPort = feishu.webhookPort;
			if (
				feishu.dmPolicy === "pairing" ||
				feishu.dmPolicy === "allowlist" ||
				feishu.dmPolicy === "open"
			) {
				next.channels.feishu.dmPolicy = feishu.dmPolicy;
			}
			if (Array.isArray(feishu.allowFrom)) {
				next.channels.feishu.allowFrom = feishu.allowFrom
					.filter((v): v is string => typeof v === "string")
					.map((v) => v.trim())
					.filter(Boolean);
			}
			if (
				feishu.groupPolicy === "disabled" ||
				feishu.groupPolicy === "allowlist" ||
				feishu.groupPolicy === "open"
			) {
				next.channels.feishu.groupPolicy = feishu.groupPolicy;
			}
			if (Array.isArray(feishu.groupAllowFrom)) {
				next.channels.feishu.groupAllowFrom = feishu.groupAllowFrom
					.filter((v): v is string => typeof v === "string")
					.map((v) => v.trim())
					.filter(Boolean);
			}
			if (typeof feishu.requireMention === "boolean")
				next.channels.feishu.requireMention = feishu.requireMention;
			if (typeof feishu.textChunkLimit === "number")
				next.channels.feishu.textChunkLimit = feishu.textChunkLimit;
			if (typeof feishu.rateLimitPerMinute === "number")
				next.channels.feishu.rateLimitPerMinute = feishu.rateLimitPerMinute;
		}
		for (const channelId of ["telegram", "slack", "generic_webhook"] as const) {
			const raw = channels[channelId];
			if (!isObject(raw)) continue;
			if (typeof raw.enabled === "boolean") {
				next.channels[channelId].enabled = raw.enabled;
			}
			if (typeof raw.note === "string") {
				next.channels[channelId].note = raw.note;
			}
		}
	}

	if (isObject(source.security)) {
		const security = source.security as Record<string, unknown>;
		if (typeof security.interactionTimeoutSec === "number") {
			next.security.interactionTimeoutSec = security.interactionTimeoutSec;
		}
		if (Array.isArray(security.defaultScopes)) {
			next.security.defaultScopes = security.defaultScopes.filter(
				(v): v is (typeof next.security.defaultScopes)[number] =>
					typeof v === "string" && v.startsWith("operator."),
			);
		}
	}

	if (isObject(source.mobileGateway)) {
		const mobileGateway = source.mobileGateway as Record<string, unknown>;
		if (typeof mobileGateway.enabled === "boolean")
			next.mobileGateway.enabled = mobileGateway.enabled;
		if (typeof mobileGateway.host === "string")
			next.mobileGateway.host = mobileGateway.host;
		if (typeof mobileGateway.port === "number")
			next.mobileGateway.port = mobileGateway.port;
		if (typeof mobileGateway.requirePairing === "boolean") {
			next.mobileGateway.requirePairing = mobileGateway.requirePairing;
		}
	}

	return next;
}

export class RemoteControlConfigStore {
	constructor(private readonly db: DbContext) {}

	async load(): Promise<RemoteControlConfig> {
		const row = await this.db.client.execute({
			sql: "SELECT value FROM app_config WHERE key = ?",
			args: [REMOTE_CONTROL_CONFIG_KEY],
		});
		const value = row.rows[0]?.value;
		const raw = parseJsonSafely<unknown>(
			typeof value === "string" ? value : null,
		);
		return mergeConfig(raw, DEFAULT_REMOTE_CONTROL_CONFIG);
	}

	async save(config: RemoteControlConfig): Promise<void> {
		await this.db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)\n      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [REMOTE_CONTROL_CONFIG_KEY, JSON.stringify(config), Date.now()],
		});
	}
}
