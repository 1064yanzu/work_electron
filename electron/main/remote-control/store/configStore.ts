import type { DbContext } from "../../db/client";
import {
	DEFAULT_REMOTE_CONTROL_CONFIG,
	REMOTE_CONTROL_CONFIG_KEY,
} from "../core/defaults";
import type {
	RemoteChannelFeatureConfig,
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
const VALID_STREAMING_MODES = new Set(["off", "edit", "card"]);

function mergeStringArray(raw: unknown): string[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter((v): v is string => typeof v === "string")
		.map((v) => v.trim())
		.filter(Boolean);
}

/**
 * 合并 features 字段；跳过不认识或越界的值。
 */
function mergeChannelFeatures(
	raw: unknown,
	fallback: RemoteChannelFeatureConfig | undefined,
): RemoteChannelFeatureConfig | undefined {
	const base = fallback
		? (structuredClone(fallback) as RemoteChannelFeatureConfig)
		: undefined;
	if (!isObject(raw) || !base) return base;

	if (isObject(raw.streaming)) {
		const mode = (raw.streaming as Record<string, unknown>).mode;
		if (typeof mode === "string" && VALID_STREAMING_MODES.has(mode)) {
			base.streaming.mode =
				mode as RemoteChannelFeatureConfig["streaming"]["mode"];
		}
	}
	if (isObject(raw.typing)) {
		const enabled = (raw.typing as Record<string, unknown>).enabled;
		if (typeof enabled === "boolean") base.typing.enabled = enabled;
	}
	if (isObject(raw.interactive)) {
		const enabled = (raw.interactive as Record<string, unknown>).enabled;
		if (typeof enabled === "boolean") base.interactive.enabled = enabled;
	}
	if (isObject(raw.dedupe)) {
		const persistent = (raw.dedupe as Record<string, unknown>).persistent;
		if (typeof persistent === "boolean") base.dedupe.persistent = persistent;
	}
	if (typeof raw.sequential_delivery === "boolean") {
		base.sequential_delivery = raw.sequential_delivery;
	}
	return base;
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

	if (
		typeof raw.dmPolicy === "string" &&
		VALID_DM_POLICIES.includes(raw.dmPolicy as RemoteDmPolicy)
	) {
		target.dmPolicy = raw.dmPolicy;
	}
	const allowFrom = mergeStringArray(raw.allowFrom);
	if (allowFrom) target.allowFrom = allowFrom;

	if (
		typeof raw.groupPolicy === "string" &&
		VALID_GROUP_POLICIES.includes(raw.groupPolicy as RemoteGroupPolicy)
	) {
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

	// features 能力开关
	const mergedFeatures = mergeChannelFeatures(
		raw.features,
		target.features as RemoteChannelFeatureConfig | undefined,
	);
	if (mergedFeatures) target.features = mergedFeatures;
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
			mergeCommonChannelFields(
				feishu,
				next.channels.feishu as unknown as Record<string, unknown>,
			);
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
			if (typeof feishu.enableAttachmentMerge === "boolean") {
				next.channels.feishu.enableAttachmentMerge =
					feishu.enableAttachmentMerge;
			}
			if (typeof feishu.attachmentMergeWindowSec === "number") {
				next.channels.feishu.attachmentMergeWindowSec = Math.max(
					5,
					Math.floor(feishu.attachmentMergeWindowSec),
				);
			}
			if (typeof feishu.enableDocLinkPrefetch === "boolean") {
				next.channels.feishu.enableDocLinkPrefetch =
					feishu.enableDocLinkPrefetch;
			}
			if (typeof feishu.enableDocxMcp === "boolean") {
				next.channels.feishu.enableDocxMcp = feishu.enableDocxMcp;
			}
			if (typeof feishu.enableDocWriteOps === "boolean") {
				next.channels.feishu.enableDocWriteOps = feishu.enableDocWriteOps;
			}
			if (typeof feishu.enableDocFileDelete === "boolean") {
				next.channels.feishu.enableDocFileDelete = feishu.enableDocFileDelete;
			}
			if (typeof feishu.enableLegacyDocsRead === "boolean") {
				next.channels.feishu.enableLegacyDocsRead = feishu.enableLegacyDocsRead;
			}
			if (typeof feishu.enableDocCommandFallback === "boolean") {
				next.channels.feishu.enableDocCommandFallback =
					feishu.enableDocCommandFallback;
			}
		}

		// ─── Telegram ───
		if (isObject(channels.telegram)) {
			const tg = channels.telegram as Record<string, unknown>;
			mergeCommonChannelFields(
				tg,
				next.channels.telegram as unknown as Record<string, unknown>,
			);
			if (typeof tg.botToken === "string")
				next.channels.telegram.botToken = tg.botToken;
		}

		// ─── Slack ───
		if (isObject(channels.slack)) {
			const sl = channels.slack as Record<string, unknown>;
			mergeCommonChannelFields(
				sl,
				next.channels.slack as unknown as Record<string, unknown>,
			);
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
			mergeCommonChannelFields(
				dc,
				next.channels.discord as unknown as Record<string, unknown>,
			);
			if (typeof dc.botToken === "string")
				next.channels.discord.botToken = dc.botToken;
			if (typeof dc.applicationId === "string")
				next.channels.discord.applicationId = dc.applicationId;
		}

		// ─── QQ Bot ───
		if (isObject(channels.qqbot)) {
			const qb = channels.qqbot as Record<string, unknown>;
			mergeCommonChannelFields(
				qb,
				next.channels.qqbot as unknown as Record<string, unknown>,
			);
			if (typeof qb.appId === "string") next.channels.qqbot.appId = qb.appId;
			if (typeof qb.clientSecret === "string")
				next.channels.qqbot.clientSecret = qb.clientSecret;
			if (qb.environment === "prod" || qb.environment === "sandbox")
				next.channels.qqbot.environment = qb.environment;
			if (typeof qb.enableGuild === "boolean")
				next.channels.qqbot.enableGuild = qb.enableGuild;
			if (typeof qb.enableGroup === "boolean")
				next.channels.qqbot.enableGroup = qb.enableGroup;
			if (typeof qb.enableC2c === "boolean")
				next.channels.qqbot.enableC2c = qb.enableC2c;
		}

		// ─── WeChat ───
		if (isObject(channels.wechat)) {
			const wc = channels.wechat as Record<string, unknown>;
			if (typeof wc.enabled === "boolean")
				next.channels.wechat.enabled = wc.enabled;
			if (
				wc.puppet === "xp" ||
				wc.puppet === "padlocal" ||
				wc.puppet === "service"
			)
				next.channels.wechat.puppet = wc.puppet;
			if (typeof wc.token === "string") next.channels.wechat.token = wc.token;
			if (typeof wc.endpoint === "string")
				next.channels.wechat.endpoint = wc.endpoint;
			if (typeof wc.enableDm === "boolean")
				next.channels.wechat.enableDm = wc.enableDm;
			if (typeof wc.enableGroup === "boolean")
				next.channels.wechat.enableGroup = wc.enableGroup;
			if (typeof wc.requireMention === "boolean")
				next.channels.wechat.requireMention = wc.requireMention;
			if (typeof wc.textChunkLimit === "number")
				next.channels.wechat.textChunkLimit = wc.textChunkLimit;
			if (typeof wc.rateLimitPerMinute === "number")
				next.channels.wechat.rateLimitPerMinute = wc.rateLimitPerMinute;
			if (typeof wc.acknowledgedRisk === "boolean")
				next.channels.wechat.acknowledgedRisk = wc.acknowledgedRisk;
			const allowFrom = mergeStringArray(wc.allowFrom);
			if (allowFrom) next.channels.wechat.allowFrom = allowFrom;
			const groupAllowFrom = mergeStringArray(wc.groupAllowFrom);
			if (groupAllowFrom) next.channels.wechat.groupAllowFrom = groupAllowFrom;
			const mergedFeatures = mergeChannelFeatures(
				wc.features,
				next.channels.wechat.features,
			);
			if (mergedFeatures) next.channels.wechat.features = mergedFeatures;
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
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [REMOTE_CONTROL_CONFIG_KEY, JSON.stringify(config), Date.now()],
		});
	}
}
