import type { DbContext } from "../../db/client";
import {
	DEFAULT_REMOTE_CONTROL_CONFIG,
	REMOTE_CONTROL_CONFIG_KEY,
} from "../core/defaults";
import type {
	RemoteControlConfig,
	RemoteDmPolicy,
	RemoteGroupPolicy,
} from "../core/types";
import { parseJsonSafely } from "../core/utils";

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

// ─── 通用渠道字段合并辅助 ───────────────────────────────

const VALID_DM_POLICIES: RemoteDmPolicy[] = ["pairing", "allowlist", "open"];
const VALID_GROUP_POLICIES: RemoteGroupPolicy[] = [
	"disabled",
	"allowlist",
	"open",
];

function mergeStringArray(
	raw: unknown,
): string[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter((v): v is string => typeof v === "string")
		.map((v) => v.trim())
		.filter(Boolean);
}

/**
 * 合并通用渠道字段（dmPolicy、allowFrom、groupPolicy 等）
 * 适用于 Telegram、Slack、Discord 等所有有标准安全策略的渠道
 */
function mergeCommonChannelFields(
	raw: Record<string, unknown>,
	target: Record<string, unknown>,
): void {
	if (typeof raw.enabled === "boolean") target.enabled = raw.enabled;

	if (typeof raw.dmPolicy === "string" && VALID_DM_POLICIES.includes(raw.dmPolicy as RemoteDmPolicy)) {
		target.dmPolicy = raw.dmPolicy;
	}
	const allowFrom = mergeStringArray(raw.allowFrom);
	if (allowFrom) target.allowFrom = allowFrom;

	if (typeof raw.groupPolicy === "string" && VALID_GROUP_POLICIES.includes(raw.groupPolicy as RemoteGroupPolicy)) {
		target.groupPolicy = raw.groupPolicy;
	}
	const groupAllowFrom = mergeStringArray(raw.groupAllowFrom);
	if (groupAllowFrom) target.groupAllowFrom = groupAllowFrom;

	if (typeof raw.requireMention === "boolean")
		target.requireMention = raw.requireMention;
	if (typeof raw.textChunkLimit === "number")
		target.textChunkLimit = raw.textChunkLimit;
	if (typeof raw.rateLimitPerMinute === "number")
		target.rateLimitPerMinute = raw.rateLimitPerMinute;
}

// ─── 核心 mergeConfig ───────────────────────────────────

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

		// ─── 飞书 ───
		if (isObject(channels.feishu)) {
			const feishu = channels.feishu as Record<string, unknown>;
			mergeCommonChannelFields(feishu, next.channels.feishu as unknown as Record<string, unknown>);
			if (typeof feishu.appId === "string")
				next.channels.feishu.appId = feishu.appId;
			if (typeof feishu.appSecret === "string")
				next.channels.feishu.appSecret = feishu.appSecret;
			if (feishu.domain === "feishu" || feishu.domain === "lark")
				next.channels.feishu.domain = feishu.domain;
			if (feishu.connectionMode === "websocket" || feishu.connectionMode === "webhook")
				next.channels.feishu.connectionMode = feishu.connectionMode;
			if (typeof feishu.webhookPath === "string")
				next.channels.feishu.webhookPath = feishu.webhookPath;
			if (typeof feishu.webhookPort === "number")
				next.channels.feishu.webhookPort = feishu.webhookPort;
		}

		// ─── Telegram ───
		if (isObject(channels.telegram)) {
			const tg = channels.telegram as Record<string, unknown>;
			mergeCommonChannelFields(tg, next.channels.telegram as unknown as Record<string, unknown>);
			if (typeof tg.botToken === "string")
				next.channels.telegram.botToken = tg.botToken;
		}

		// ─── Slack ───
		if (isObject(channels.slack)) {
			const sl = channels.slack as Record<string, unknown>;
			mergeCommonChannelFields(sl, next.channels.slack as unknown as Record<string, unknown>);
			if (typeof sl.botToken === "string")
				next.channels.slack.botToken = sl.botToken;
			if (typeof sl.appToken === "string")
				next.channels.slack.appToken = sl.appToken;
			if (typeof sl.signingSecret === "string")
				next.channels.slack.signingSecret = sl.signingSecret;
		}

		// ─── Discord ───
		if (isObject(channels.discord)) {
			const dc = channels.discord as Record<string, unknown>;
			mergeCommonChannelFields(dc, next.channels.discord as unknown as Record<string, unknown>);
			if (typeof dc.botToken === "string")
				next.channels.discord.botToken = dc.botToken;
			if (typeof dc.applicationId === "string")
				next.channels.discord.applicationId = dc.applicationId;
		}

		// ─── generic_webhook (placeholder) ───
		if (isObject(channels.generic_webhook)) {
			const gw = channels.generic_webhook as Record<string, unknown>;
			if (typeof gw.enabled === "boolean")
				next.channels.generic_webhook.enabled = gw.enabled;
			if (typeof gw.note === "string")
				next.channels.generic_webhook.note = gw.note;
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
	constructor(private readonly db: DbContext) { }

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
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [REMOTE_CONTROL_CONFIG_KEY, JSON.stringify(config), Date.now()],
		});
	}
}
